"""
Caché global del JSON destilado por país (`public.country_task_suggestions`).

PK lógica: (country_code, brief_sha256, content_version).
Solo service_role. Si faltan env vars, degrada a "sin caché".
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import httpx

TABLE = "country_task_suggestions"
# Bump al cambiar el prompt o el esquema de destilación.
CONTENT_VERSION = 1

_ROW_SELECT = "country_code,brief_sha256,content_version,payload,brief_fetched_at,distilled_at"


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


async def get_cached_country_tasks(
    country_code: str,
    brief_sha256: str,
    *,
    content_version: int = CONTENT_VERSION,
) -> dict[str, Any] | None:
    """Devuelve el payload jsonb cacheado o None."""
    cfg = _config()
    code = country_code.upper().strip()
    if not cfg or not code or not brief_sha256:
        return None
    base, key = cfg
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{base}/rest/v1/{TABLE}",
                params={
                    "country_code": f"eq.{code}",
                    "brief_sha256": f"eq.{brief_sha256}",
                    "content_version": f"eq.{content_version}",
                    "select": _ROW_SELECT,
                    "limit": "1",
                },
                headers=_headers(key),
            )
            if r.status_code != 200:
                return None
            rows = r.json()
            if not isinstance(rows, list) or not rows:
                return None
            payload = rows[0].get("payload")
            return payload if isinstance(payload, dict) else None
    except Exception:
        return None


async def store_country_tasks(
    country_code: str,
    brief_sha256: str,
    payload: dict[str, Any],
    *,
    brief_fetched_at: str | None = None,
    content_version: int = CONTENT_VERSION,
) -> None:
    """Upsert del destilado. Best-effort."""
    cfg = _config()
    code = country_code.upper().strip()
    if not cfg or not code or not brief_sha256:
        return
    base, key = cfg
    body = {
        "country_code": code,
        "brief_sha256": brief_sha256,
        "content_version": content_version,
        "payload": payload,
        "brief_fetched_at": brief_fetched_at or datetime.now(timezone.utc).isoformat(),
        "distilled_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.post(
                f"{base}/rest/v1/{TABLE}",
                params={"on_conflict": "country_code,brief_sha256,content_version"},
                headers={
                    **_headers(key),
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
                json=body,
            )
    except Exception:
        return
