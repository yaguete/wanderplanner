"""
Utilidades compartidas para GET /thumb y GET /cover: normalización de query, tope diario
de cache misses y single-flight por consulta.

No desplegar a producción sin T1.2 (metering de uso). Este módulo solo ofrece un cinturón
mínimo (longitud de q + tope diario en memoria) mientras tanto.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import date
from typing import Any, Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

QUERY_MAX_LEN = 200
MISS_TTL_DAYS = 30
# Conservador: Places documenta photoUri como short-lived (docs julio 2026).
PHOTO_URI_TTL_SECONDS = 45 * 60

T = TypeVar("T")

_locks: dict[str, asyncio.Lock] = {}
_locks_guard = asyncio.Lock()
_inflight: dict[str, asyncio.Future[Any]] = {}

_day: date | None = None
_lookups_today = 0


def normalize_query(q: str | None) -> str | None:
    if not q:
        return None
    cleaned = " ".join(q.strip().lower().split())
    if not cleaned or len(cleaned) > QUERY_MAX_LEN:
        return None
    return cleaned


def _max_lookups_day() -> int:
    raw = (os.getenv("MAX_PHOTO_LOOKUPS_DAY") or "").strip()
    if raw.isdigit():
        return max(int(raw), 0)
    return 2000


def allow_paid_lookup() -> bool:
    """Incrementa y comprueba el tope diario global de cache misses (en memoria)."""
    global _day, _lookups_today
    today = date.today()
    if _day != today:
        _day = today
        _lookups_today = 0
    limit = _max_lookups_day()
    if limit == 0:
        return False
    if _lookups_today >= limit:
        logger.warning(
            "MAX_PHOTO_LOOKUPS_DAY (%s) alcanzado; devolviendo null sin llamar al proveedor",
            limit,
        )
        return False
    _lookups_today += 1
    return True


async def single_flight(key: str, coro_factory: Callable[[], Awaitable[T]]) -> T:
    """Un solo worker por key; el resto espera y reutiliza el mismo Future."""
    async with _locks_guard:
        existing = _inflight.get(key)
        if existing is not None:
            waiter: asyncio.Future[Any] = existing
        else:
            loop = asyncio.get_running_loop()
            waiter = loop.create_future()
            _inflight[key] = waiter
            existing = None

    if existing is not None:
        return await asyncio.shield(waiter)

    try:
        result = await coro_factory()
    except BaseException as e:
        if not waiter.done():
            waiter.set_exception(e)
        async with _locks_guard:
            if _inflight.get(key) is waiter:
                _inflight.pop(key, None)
        raise
    else:
        if not waiter.done():
            waiter.set_result(result)
        async with _locks_guard:
            if _inflight.get(key) is waiter:
                _inflight.pop(key, None)
        return result


def supabase_config() -> tuple[str, str] | None:
    base = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not base or not key:
        return None
    return base, key


def supabase_headers(key: str) -> dict[str, str]:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def is_miss_fresh(resolved_at: str | None, ttl_days: int = MISS_TTL_DAYS) -> bool:
    if not resolved_at:
        return False
    from datetime import datetime, timedelta, timezone

    try:
        stamp = datetime.fromisoformat(resolved_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - stamp < timedelta(days=ttl_days)


def uri_still_fresh(expires_at: str | None) -> bool:
    if not expires_at:
        return False
    from datetime import datetime, timezone

    try:
        stamp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) < stamp


def photo_uri_expiry_iso() -> str:
    from datetime import datetime, timedelta, timezone

    return (datetime.now(timezone.utc) + timedelta(seconds=PHOTO_URI_TTL_SECONDS)).isoformat()


def now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
