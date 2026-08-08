"""
GET /country-tasks?codes=ES,TH — sugiere trámites previos al viaje a partir
de las Recomendaciones de viaje del MAE (pasaporte español), destiladas con Haiku.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import unicodedata
from pathlib import Path
from typing import Any, Literal

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import AuthUser, require_user
from country_briefs import ISO_TO_NAME, iso_to_slug
from country_tasks_cache import (
    CONTENT_VERSION,
    get_cached_country_tasks,
    store_country_tasks,
)
from obs import log_kv
from photo_lookup import single_flight
from travel_briefs import ensure_travel_briefs, recommendation_url
from usage import enforce_usage, record_event

logger = logging.getLogger(__name__)

router = APIRouter()

PROMPT_PATH = Path(__file__).parent / "agents" / "country_tasks.md"
HAIKU_MODEL = "claude-haiku-4-5-20251001"
MAX_CODES = 12
MAX_BRIEF_CHARS = 50_000

DISCLAIMER = (
    "Las recomendaciones del Ministerio de Asuntos Exteriores están redactadas "
    "para ciudadanos españoles (pasaporte español). Comprueba siempre los "
    "requisitos oficiales vigentes antes de viajar."
)

Category = Literal["paperwork", "health"]


class SuggestedTask(BaseModel):
    id: str
    title: str
    category: Category
    lead_time_days: int | None = None
    details: str | None = None


class CountryTasksEntry(BaseModel):
    country_code: str
    name: str
    tasks: list[SuggestedTask] = Field(default_factory=list)
    cached: bool = False
    brief_fetched_at: str | None = None
    # URL de la Recomendación de viaje MAE del país (fuente oficial).
    url: str | None = None
    error: str | None = None


class CountryTasksResponse(BaseModel):
    disclaimer: str
    brief_source: str = "Ministerio de Asuntos Exteriores (España) — Recomendaciones de viaje"
    countries: list[CountryTasksEntry]


def _load_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def parse_country_codes(raw: str) -> list[str]:
    """Split, upper, dedupe, validate ISO-2 format. Raises HTTPException on empty/overflow."""
    parts = [p.strip().upper() for p in (raw or "").split(",")]
    out: list[str] = []
    seen: set[str] = set()
    for p in parts:
        if not p:
            continue
        if not re.fullmatch(r"[A-Z]{2}", p):
            continue
        if p in seen:
            continue
        seen.add(p)
        out.append(p)
    if not out:
        raise HTTPException(status_code=400, detail="Falta codes (ISO-2 separados por coma)")
    if len(out) > MAX_CODES:
        raise HTTPException(
            status_code=400,
            detail=f"Demasiados códigos (máx. {MAX_CODES})",
        )
    return out


def _slugify(value: str) -> str:
    nfkd = unicodedata.normalize("NFKD", value or "")
    ascii_only = "".join(c for c in nfkd if not unicodedata.combining(c))
    s = ascii_only.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    s = re.sub(r"-{2,}", "-", s)
    return s[:64] or "tramite"


def stable_task_id(country_code: str, id_slug: str) -> str:
    code = country_code.upper().strip()
    slug = _slugify(id_slug)
    return f"country:{code.lower()}:{slug}"


def _strip_json_fence(raw: str) -> str:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _call_haiku_distill(country_code: str, brief_text: str) -> tuple[dict[str, Any], int | None]:
    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Falta ANTHROPIC_API_KEY")

    name = ISO_TO_NAME.get(country_code, country_code)
    clipped = brief_text[:MAX_BRIEF_CHARS]
    user_message = (
        f"País: {name} ({country_code})\n\n"
        f"## Recomendaciones de viaje MAE\n\n{clipped}\n\n"
        "Devuelve solo el JSON."
    )

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=1024,
        temperature=0.1,
        system=_load_prompt(),
        messages=[{"role": "user", "content": user_message}],
    )
    parts: list[str] = []
    for block in message.content:
        if getattr(block, "type", None) == "text":
            parts.append(getattr(block, "text", "") or "")
    raw = "".join(parts).strip()
    output_tokens = getattr(message.usage, "output_tokens", None) if message.usage else None
    try:
        data = json.loads(_strip_json_fence(raw))
    except json.JSONDecodeError as e:
        raise ValueError(f"JSON inválido de Haiku: {e}") from e
    if not isinstance(data, dict):
        raise ValueError("La respuesta de Haiku no es un objeto JSON")
    return data, output_tokens


def normalize_tasks_payload(country_code: str, raw: dict[str, Any]) -> list[SuggestedTask]:
    """Valida y normaliza la lista de tareas; descarta entradas inválidas."""
    code = country_code.upper().strip()
    code_l = code.lower()
    prefix = f"country:{code_l}:"
    tasks_raw = raw.get("tasks")
    if not isinstance(tasks_raw, list):
        return []
    out: list[SuggestedTask] = []
    seen: set[str] = set()
    for item in tasks_raw:
        if not isinstance(item, dict):
            continue
        category = item.get("category")
        if category not in ("paperwork", "health"):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        id_raw = str(item.get("id_slug") or item.get("id") or title).strip()
        if id_raw.startswith(prefix):
            task_id = id_raw
        elif id_raw.startswith("country:") and ":" in id_raw[8:]:
            # Id ya namespaced (p. ej. de caché); conservar si el ISO coincide.
            parts = id_raw.split(":")
            if len(parts) >= 3 and parts[1].lower() == code_l:
                task_id = id_raw
            else:
                task_id = stable_task_id(code, parts[-1])
        else:
            task_id = stable_task_id(code, id_raw)
        if task_id in seen:
            continue
        seen.add(task_id)
        lead = item.get("lead_time_days")
        lead_time: int | None
        if isinstance(lead, bool):
            lead_time = None
        elif isinstance(lead, int) and lead >= 0:
            lead_time = lead
        elif isinstance(lead, float) and lead >= 0 and lead == int(lead):
            lead_time = int(lead)
        else:
            lead_time = None
        details_raw = item.get("details")
        details = (
            str(details_raw).strip()
            if isinstance(details_raw, str) and details_raw.strip()
            else None
        )
        out.append(
            SuggestedTask(
                id=task_id,
                title=title[:200],
                category=category,
                lead_time_days=lead_time,
                details=details[:800] if details else None,
            )
        )
    return out


async def _distill_country(
    code: str,
    brief_text: str,
    brief_sha: str,
    brief_fetched_at: str | None,
    user: AuthUser | None,
) -> tuple[list[SuggestedTask], bool]:
    """Cache lookup → miss → Haiku. Returns (tasks, cached). Metering solo en miss real."""
    cached = await get_cached_country_tasks(code, brief_sha, content_version=CONTENT_VERSION)
    if cached is not None:
        return normalize_tasks_payload(code, cached), True

    await enforce_usage(user, "country_tasks")

    async def run() -> list[SuggestedTask]:
        again = await get_cached_country_tasks(code, brief_sha, content_version=CONTENT_VERSION)
        if again is not None:
            return normalize_tasks_payload(code, again)
        raw, tokens = await asyncio.to_thread(_call_haiku_distill, code, brief_text)
        tasks = normalize_tasks_payload(code, raw)
        payload = {
            "country_code": code,
            "tasks": [t.model_dump() for t in tasks],
        }
        await store_country_tasks(
            code,
            brief_sha,
            payload,
            brief_fetched_at=brief_fetched_at,
            content_version=CONTENT_VERSION,
        )
        # Solo el worker que destiló registra uso (los waiters reutilizan el Future).
        if user is not None:
            await record_event(user.id, "country_tasks", cost_hint=tokens)
        return tasks

    flight_key = f"country-tasks:{code}:{brief_sha}:{CONTENT_VERSION}"
    tasks = await single_flight(flight_key, run)
    return tasks, False


async def _process_country(code: str, user: AuthUser | None) -> CountryTasksEntry:
    name = ISO_TO_NAME.get(code, code)
    source_url = recommendation_url(code)
    if iso_to_slug(code) is None:
        return CountryTasksEntry(
            country_code=code,
            name=name,
            tasks=[],
            url=source_url,
            error="País sin ficha/recomendaciones MAE",
        )

    briefs = await ensure_travel_briefs([code])
    entry = briefs.get(code) or {}
    text = entry.get("text") or ""
    meta = entry.get("meta") or {}
    meta_url = meta.get("url") if isinstance(meta.get("url"), str) else None
    source_url = meta_url or source_url
    if meta.get("error") or not text:
        return CountryTasksEntry(
            country_code=code,
            name=name,
            tasks=[],
            brief_fetched_at=meta.get("fetched_at"),
            url=source_url,
            error=str(meta.get("error") or "Recomendación MAE no disponible"),
        )

    sha = meta.get("sha256")
    if not isinstance(sha, str) or not sha:
        return CountryTasksEntry(
            country_code=code,
            name=name,
            tasks=[],
            brief_fetched_at=meta.get("fetched_at"),
            url=source_url,
            error="Metadatos de recomendación incompletos",
        )

    try:
        tasks, cached = await _distill_country(
            code,
            text,
            sha,
            meta.get("fetched_at"),
            user,
        )
    except HTTPException:
        raise
    except Exception as e:
        log_kv(
            logger,
            event="country_tasks_distill_failed",
            code=code,
            error=type(e).__name__,
        )
        return CountryTasksEntry(
            country_code=code,
            name=name,
            tasks=[],
            brief_fetched_at=meta.get("fetched_at"),
            url=source_url,
            error="No se pudieron destilar los trámites",
        )

    return CountryTasksEntry(
        country_code=code,
        name=name,
        tasks=tasks,
        cached=cached,
        brief_fetched_at=meta.get("fetched_at"),
        url=source_url,
        error=None,
    )


@router.get("/country-tasks", response_model=CountryTasksResponse)
async def get_country_tasks(
    codes: str = Query("", description="ISO-2 separados por coma, p. ej. ES,TH"),
    user: AuthUser | None = Depends(require_user),
) -> CountryTasksResponse:
    parsed = parse_country_codes(codes)
    # Procesar con concurrencia limitada para no disparar N Claude a la vez.
    sem = asyncio.Semaphore(3)

    async def guarded(code: str) -> CountryTasksEntry:
        async with sem:
            return await _process_country(code, user)

    results = await asyncio.gather(*[guarded(c) for c in parsed])
    return CountryTasksResponse(disclaimer=DISCLAIMER, countries=list(results))
