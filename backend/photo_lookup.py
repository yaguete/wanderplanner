"""
Utilidades compartidas para GET /thumb y GET /cover: normalización de query, tope diario
de cache misses (Places + Unsplash) y single-flight por consulta.

El tope `MAX_PHOTO_LOOKUPS_DAY` es durable vía `usage_events.kind=photo_paid` (sobrevive
a cold starts de Fly). Wikimedia no cuenta.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, TypeVar

from usage import count_kind_events_strict, record_event

logger = logging.getLogger(__name__)

QUERY_MAX_LEN = 200
MISS_TTL_DAYS = 30
# Conservador: Places documenta photoUri como short-lived (docs julio 2026).
PHOTO_URI_TTL_SECONDS = 45 * 60
PHOTO_PAID_MEMO_SEC = 60

T = TypeVar("T")

_locks: dict[str, asyncio.Lock] = {}
_locks_guard = asyncio.Lock()
_inflight: dict[str, asyncio.Future[Any]] = {}

_memo_lock = asyncio.Lock()
_memo_count: int | None = None
_memo_at: float | None = None


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


def reset_paid_lookup_memo_for_tests() -> None:
    """Vacía el memo en proceso del tope photo_paid."""
    global _memo_count, _memo_at
    _memo_count = None
    _memo_at = None


async def allow_paid_lookup() -> bool:
    """
    Tope global durable de cache misses de /thumb (Places) y /cover (Unsplash).

    Lee `usage_events.kind=photo_paid` (fail-closed) y memoíza el recuento ~60 s,
    incrementando en memoria entre refrescos. Al permitir, escribe un evento.
    Wikimedia no pasa por aquí.
    """
    global _memo_count, _memo_at
    limit = _max_lookups_day()
    if limit == 0:
        return False

    async with _memo_lock:
        now = time.monotonic()
        stale = (
            _memo_count is None
            or _memo_at is None
            or (now - _memo_at) >= PHOTO_PAID_MEMO_SEC
        )
        if stale:
            since = datetime.now(timezone.utc) - timedelta(days=1)
            try:
                used = await count_kind_events_strict("photo_paid", since=since)
            except Exception:
                used = None
            if used is None:
                logger.warning(
                    "MAX_PHOTO_LOOKUPS_DAY: no se pudo leer usage_events; cortando",
                )
                return False
            _memo_count = used
            _memo_at = now
        if _memo_count >= limit:
            logger.warning(
                "MAX_PHOTO_LOOKUPS_DAY (%s) alcanzado; devolviendo null sin llamar al proveedor",
                limit,
            )
            return False
        _memo_count += 1

    await record_event(None, "photo_paid", cost_hint=1)
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
        # Si nadie más esperaba, consume la excepción para no loguear
        # "Future exception was never retrieved" (p. ej. un 429 de cuota).
        if waiter.done() and not waiter.cancelled():
            waiter.exception()
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
