"""
POST /day-summary — genera una descripción corta (1-4 palabras) de un día
del itinerario con Claude Haiku a partir de los ítems consolidados.
"""
from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Literal

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import AuthUser, require_user
from obs import log_kv
from usage import enforce_usage, record_event

logger = logging.getLogger(__name__)

router = APIRouter()

PROMPT_PATH = Path(__file__).parent / "agents" / "day_summary.md"
HAIKU_MODEL = "claude-haiku-4-5-20251001"
MAX_WORDS = 4
MAX_CHARS = 40

ItemType = Literal["transport", "stay", "food", "activity"]


class DaySummaryItem(BaseModel):
    type: ItemType
    name: str = Field(min_length=1, max_length=200)
    region: str | None = Field(default=None, max_length=120)


class DaySummaryRequest(BaseModel):
    items: list[DaySummaryItem] = Field(min_length=1, max_length=40)
    country_codes: list[str] = Field(default_factory=list, max_length=12)
    day_index: int | None = Field(default=None, ge=0, le=365)


class DaySummaryResponse(BaseModel):
    summary: str


def _load_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def sanitize_day_summary(raw: str) -> str:
    """Recorta a 1-4 palabras, sin comillas ni puntuación final."""
    text = (raw or "").strip()
    text = re.sub(r"^[\s\"'«»`]+|[\s\"'«»`]+$", "", text)
    text = re.sub(r"\s+", " ", text)
    # Quitar prefijo «Día N» si el modelo se despista.
    text = re.sub(r"^(día|day)\s*\d+\s*[·:\-—–]?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"[.;,:!?¡¿«»\"']+$", "", text).strip()
    words = [w for w in text.split(" ") if w]
    words = words[:MAX_WORDS]
    out = " ".join(words).strip()
    if len(out) > MAX_CHARS:
        out = out[:MAX_CHARS].rsplit(" ", 1)[0].strip()
    return out


def _build_user_message(body: DaySummaryRequest) -> str:
    lines: list[str] = []
    if body.day_index is not None:
        lines.append(f"Día {body.day_index + 1} del viaje.")
    if body.country_codes:
        lines.append(f"Países: {', '.join(body.country_codes)}.")
    lines.append("Ítems del día:")
    for item in body.items:
        region = f" ({item.region})" if item.region and item.region.strip() else ""
        lines.append(f"- [{item.type}] {item.name}{region}")
    lines.append("")
    lines.append("Responde solo con la descripción (1-4 palabras).")
    return "\n".join(lines)


def _call_haiku(user_message: str) -> tuple[str, int | None]:
    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Falta ANTHROPIC_API_KEY")

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=64,
        temperature=0.3,
        system=_load_prompt(),
        messages=[{"role": "user", "content": user_message}],
    )
    parts: list[str] = []
    for block in message.content:
        if getattr(block, "type", None) == "text":
            parts.append(getattr(block, "text", "") or "")
    raw = "".join(parts).strip()
    output_tokens = getattr(message.usage, "output_tokens", None) if message.usage else None
    return raw, output_tokens


@router.post("/day-summary", response_model=DaySummaryResponse)
async def post_day_summary(
    body: DaySummaryRequest,
    user: AuthUser | None = Depends(require_user),
) -> DaySummaryResponse:
    await enforce_usage(user, "day_summary")

    try:
        raw, output_tokens = _call_haiku(_build_user_message(body))
    except HTTPException:
        raise
    except Exception as e:
        log_kv(
            logger,
            event="day_summary_failed",
            error=type(e).__name__,
        )
        raise HTTPException(
            status_code=502,
            detail="No se pudo generar la descripción del día.",
        ) from e

    summary = sanitize_day_summary(raw)
    if not summary:
        raise HTTPException(
            status_code=502,
            detail="La IA no devolvió una descripción usable.",
        )

    if user is not None:
        await record_event(user.id, "day_summary", cost_hint=output_tokens)

    return DaySummaryResponse(summary=summary)
