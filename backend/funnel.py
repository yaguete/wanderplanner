"""
POST /funnel: contadores del CTA de blogs.

Público (sin JWT): el denominador `start_opened` se dispara antes de Turnstile
y sin consentimiento. No guarda IP, user_id ni URL. Lista blanca de nombres,
`meta` acotado y tope diario por IP. Siempre 204: un fallo de instrumentación
no rompe el flujo.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import date
from typing import Any

import httpx
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

from obs import log_kv

logger = logging.getLogger(__name__)

TABLE = "funnel_events"
FUNNEL_NAMES = frozenset(
    {"start_opened", "outbound_click", "account_created", "gate_shown"}
)
POST_SLUG_RE = re.compile(r"^[a-z0-9-]{1,120}$")
REF_RE = re.compile(r"^[a-z0-9-]{1,64}$")
META_MAX_KEYS = 5
META_VALUE_MAX = 64
ALLOWED_META_KEYS = frozenset(
    {"target", "affiliate", "surface", "onboarding", "sourceKind", "reason"}
)
ALLOWED_META_VALUES: dict[str, frozenset[str]] = {
    "target": frozenset(
        {
            "booking",
            "skyscanner",
            "getyourguide",
            "civitatis",
            "kayak",
            "stay22",
            "airbnb",
            "homeexchange",
            "discovercars",
            "other",
        }
    ),
    "affiliate": frozenset({"partner", "own", "none"}),
    "surface": frozenset(
        {
            "task_row",
            "budget_row",
            "route_card",
            "assistant",
            "flight_search",
            "inspiration",
            "manual_item",
        }
    ),
    "onboarding": frozenset({"completed", "skipped", "unseen"}),
    "sourceKind": frozenset({"instagram", "article"}),
    # Motivos del RegistrationGate. Deben coincidir con GateReason del frontend.
    "reason": frozenset(
        {
            "new-trip",
            "second-source",
            "home",
            "source-limit",
            "assistant-limit",
            "invite",
            "share-plan",
        }
    ),
}

_day: date | None = None
_ip_counts: dict[str, int] = {}

router = APIRouter()


class FunnelIn(BaseModel):
    name: str
    ref: str | None = None
    post_slug: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if raw.isdigit():
        return max(int(raw), 0)
    return default


def _config() -> tuple[str, str] | None:
    base = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not base or not key:
        return None
    return base, key


def _headers(key: str) -> dict[str, str]:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _client_ip(request: Request) -> str | None:
    fly = (request.headers.get("fly-client-ip") or "").strip()
    if fly:
        return fly
    if request.client and request.client.host:
        return request.client.host
    return None


def allow_funnel_ip(ip: str | None) -> bool:
    """Tope diario por IP en memoria. Env FUNNEL_MAX_IP_DAY (default 60)."""
    global _day, _ip_counts
    today = date.today()
    if _day != today:
        _day = today
        _ip_counts = {}

    limit = _env_int("FUNNEL_MAX_IP_DAY", 60)
    if limit == 0:
        return False

    key = (ip or "").strip() or "unknown"
    used = _ip_counts.get(key, 0)
    if used >= limit:
        return False
    _ip_counts[key] = used + 1
    return True


def clear_funnel_runtime_state() -> None:
    """Tests: vacía el tope IP."""
    global _day, _ip_counts
    _day = None
    _ip_counts = {}


def sanitize_name(raw: str | None) -> str | None:
    name = (raw or "").strip()
    return name if name in FUNNEL_NAMES else None


def sanitize_ref(raw: str | None) -> str | None:
    if raw is None:
        return None
    slug = raw.strip().lower()
    if not slug or not REF_RE.fullmatch(slug):
        return None
    return slug


def sanitize_post_slug(raw: str | None) -> str | None:
    if raw is None:
        return None
    slug = raw.strip().lower()
    if not slug or not POST_SLUG_RE.fullmatch(slug):
        return None
    if "://" in slug or "@" in slug or "/" in slug:
        return None
    return slug


def sanitize_meta(raw: dict[str, Any] | None) -> dict[str, str]:
    if not raw:
        return {}
    out: dict[str, str] = {}
    for key, value in raw.items():
        if len(out) >= META_MAX_KEYS:
            break
        if key not in ALLOWED_META_KEYS:
            continue
        if not isinstance(value, str):
            continue
        trimmed = value.strip()[:META_VALUE_MAX]
        allowed = ALLOWED_META_VALUES.get(key)
        if allowed is None or trimmed not in allowed:
            continue
        out[key] = trimmed
    return out


def normalize_funnel_event(
    name: str,
    ref: str | None,
    post_slug: str | None,
    meta: dict[str, Any] | None,
) -> dict[str, Any] | None:
    event_name = sanitize_name(name)
    if event_name is None:
        return None
    return {
        "name": event_name,
        "ref": sanitize_ref(ref),
        "post_slug": sanitize_post_slug(post_slug),
        "meta": sanitize_meta(meta),
    }


async def insert_funnel_event(row: dict[str, Any]) -> None:
    cfg = _config()
    if not cfg:
        return
    base, key = cfg
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(
                f"{base}/rest/v1/{TABLE}",
                headers={**_headers(key), "Prefer": "return=minimal"},
                json=row,
            )
            if r.status_code not in (200, 201, 204):
                log_kv(
                    logger,
                    event="funnel_record_failed",
                    name=row.get("name"),
                    status=r.status_code,
                )
    except Exception as e:
        log_kv(
            logger,
            event="funnel_record_failed",
            name=row.get("name"),
            error=type(e).__name__,
        )


async def ingest_funnel_event(
    *,
    name: str,
    ref: str | None,
    post_slug: str | None,
    meta: dict[str, Any] | None,
    ip: str | None,
) -> bool:
    """Normaliza e inserta. False si se rechaza (nombre, tope IP). Nunca lanza."""
    if not allow_funnel_ip(ip):
        return False
    row = normalize_funnel_event(name, ref, post_slug, meta)
    if row is None:
        return False
    await insert_funnel_event(row)
    return True


@router.post("/funnel", status_code=204)
async def post_funnel(http_request: Request, body: FunnelIn) -> Response:
    try:
        await ingest_funnel_event(
            name=body.name,
            ref=body.ref,
            post_slug=body.post_slug,
            meta=body.meta,
            ip=_client_ip(http_request),
        )
    except Exception:
        pass
    return Response(status_code=204)
