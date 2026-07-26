"""
Caché global de extracciones por URL (`public.article_extractions` en Supabase).

Evita repagar Claude cuando varios usuarios añaden el mismo artículo y hace instantáneo
el CTA de los blogs partner. Se accede con `service_role` vía PostgREST: la tabla no tiene
políticas RLS, así que es inaccesible desde el navegador.

Si faltan las variables de entorno, todas las funciones degradan a "sin caché".
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

TABLE = "article_extractions"
DEFAULT_TTL_DAYS = 30


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


def _ttl_days() -> int:
    raw = (os.getenv("EXTRACTION_CACHE_TTL_DAYS") or "").strip()
    if raw.isdigit():
        return max(int(raw), 0)
    return DEFAULT_TTL_DAYS


def _is_fresh(fetched_at: str | None) -> bool:
    ttl = _ttl_days()
    if ttl == 0:
        return True
    if not fetched_at:
        return False
    try:
        stamp = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - stamp < timedelta(days=ttl)


async def get_cached_extraction(url: str) -> dict[str, Any] | None:
    cfg = _config()
    if not cfg or not url:
        return None
    base, key = cfg
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{base}/rest/v1/{TABLE}",
                params={"url": f"eq.{url}", "select": "payload,fetched_at", "limit": "1"},
                headers=_headers(key),
            )
            if r.status_code != 200:
                return None
            rows = r.json()
    except Exception:
        return None

    if not isinstance(rows, list) or not rows:
        return None
    row = rows[0]
    if not isinstance(row, dict) or not _is_fresh(row.get("fetched_at")):
        return None
    payload = row.get("payload")
    return payload if isinstance(payload, dict) else None


async def store_extraction(url: str, payload: dict[str, Any]) -> None:
    cfg = _config()
    if not cfg or not url:
        return
    base, key = cfg
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.post(
                f"{base}/rest/v1/{TABLE}",
                params={"on_conflict": "url"},
                headers={
                    **_headers(key),
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
                json={
                    "url": url,
                    "payload": payload,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                },
            )
    except Exception:
        # La caché es best-effort: un fallo aquí no debe romper la extracción.
        return
