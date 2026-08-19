"""
Límites de uso por usuario sobre APIs de pago (Claude, DeepSeek, Places).

Tabla `usage_events` vía service_role (mismo patrón que extraction_cache). Los contadores
no son atómicos respecto al registro: dos peticiones concurrentes pueden pasar el mismo
check. Se acepta (desviación máxima ~1); el front mitiga con UI en vuelo.

Kinds:
  - extraction / assistant_message / photo_lookup / day_summary / country_tasks:
    cuota de usuario (user_id obligatorio)
  - refresh: rate-limit de «Recargar» (user_id obligatorio)
  - system_revalidation: mantenimiento de caché en fondo (user_id null)
  - partner_prewarm: pre-síntesis desde /partners (user_id null; cap global durable)
  - landing_source_search: Tavily de GET /sources/suggest (landing; user_id null; cap global durable)
  - trip_source_search: Tavily de GET /sources/suggest desde Añadir fuente (user_id opcional; cap propio)
  - photo_paid: cache miss de pago de /thumb (Places) y /cover (Unsplash); user_id null; cap global durable
  - maps_resolve: unfurl de short links de Maps (POST /maps/resolve); no cuenta un hit de caché
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import HTTPException

from auth import AuthUser
from obs import log_kv

logger = logging.getLogger(__name__)

TABLE = "usage_events"

Kind = Literal[
    "extraction",
    "assistant_message",
    "photo_lookup",
    "refresh",
    "system_revalidation",
    "day_summary",
    "partner_prewarm",
    "country_tasks",
    "place_suggest",
    "transport_hub",
    "landing_source_search",
    "trip_source_search",
    "photo_paid",
    "maps_resolve",
]
_USERLESS_KINDS = frozenset(
    {
        "system_revalidation",
        "partner_prewarm",
        "landing_source_search",
        "trip_source_search",
        "photo_paid",
    }
)
LimitKind = Literal["guest", "daily", "monthly"]

_GUEST_DEFAULTS: dict[str, int] = {
    "extraction": 1,
    "assistant_message": 10,
    "photo_lookup": 30,
    "day_summary": 5,
    "country_tasks": 5,
    "place_suggest": 40,
    "transport_hub": 20,
    "maps_resolve": 40,
}
_GUEST_ENV: dict[str, str] = {
    "extraction": "GUEST_MAX_EXTRACTIONS",
    "assistant_message": "GUEST_MAX_ASSISTANT_MESSAGES",
    "photo_lookup": "GUEST_MAX_PHOTO_LOOKUPS",
    "day_summary": "GUEST_MAX_DAY_SUMMARIES",
    "country_tasks": "GUEST_MAX_COUNTRY_TASKS",
    "place_suggest": "GUEST_MAX_PLACE_SUGGESTS",
    "transport_hub": "GUEST_MAX_TRANSPORT_HUBS",
    "maps_resolve": "GUEST_MAX_MAPS_RESOLVES",
}

_MESSAGES: dict[tuple[str, LimitKind], str] = {
    ("extraction", "guest"): (
        "Has agotado el límite de extracciones de invitado. Crea una cuenta para continuar."
    ),
    ("extraction", "daily"): (
        "Has alcanzado el límite diario de extracciones. Vuelve mañana o reduce el ritmo."
    ),
    ("extraction", "monthly"): (
        "Has alcanzado el límite mensual de extracciones. Podrás seguir el mes que viene."
    ),
    ("assistant_message", "guest"): (
        "Has agotado los mensajes del asistente como invitado. Crea una cuenta para seguir."
    ),
    ("assistant_message", "daily"): (
        "Has alcanzado el límite diario de mensajes del asistente. Vuelve mañana."
    ),
    ("photo_lookup", "guest"): (
        "Has agotado el límite de miniaturas de invitado. Crea una cuenta para continuar."
    ),
    ("photo_lookup", "daily"): (
        "Has alcanzado el límite diario de miniaturas. Vuelve mañana."
    ),
    ("refresh", "guest"): (
        "Has agotado los recargas de invitado. Crea una cuenta para continuar."
    ),
    ("refresh", "daily"): (
        "Has alcanzado el límite diario de recargas. Vuelve mañana."
    ),
    ("day_summary", "guest"): (
        "Has agotado las descripciones por IA de invitado. Crea una cuenta para continuar."
    ),
    ("day_summary", "daily"): (
        "Has alcanzado el límite diario de descripciones por IA. Vuelve mañana."
    ),
    ("country_tasks", "guest"): (
        "Has agotado las consultas de trámites de invitado. Crea una cuenta para continuar."
    ),
    ("country_tasks", "daily"): (
        "Has alcanzado el límite diario de consultas de trámites. Vuelve mañana."
    ),
    ("place_suggest", "guest"): (
        "Has agotado las búsquedas de lugares de invitado. Crea una cuenta para continuar."
    ),
    ("place_suggest", "daily"): (
        "Has alcanzado el límite diario de búsquedas de lugares. Vuelve mañana."
    ),
    ("transport_hub", "guest"): (
        "Has agotado las búsquedas de aeropuertos/estaciones de invitado."
    ),
    ("transport_hub", "daily"): (
        "Has alcanzado el límite diario de búsquedas de aeropuertos/estaciones."
    ),
    ("maps_resolve", "guest"): (
        "Has agotado las resoluciones de mapas de invitado. Crea una cuenta para continuar."
    ),
    ("maps_resolve", "daily"): (
        "Has alcanzado el límite diario de resoluciones de mapas. Vuelve mañana."
    ),
}


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


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if raw.isdigit():
        return max(int(raw), 0)
    return default


def _guest_max(kind: str) -> int:
    return _env_int(_GUEST_ENV.get(kind, ""), _GUEST_DEFAULTS.get(kind, 0))


def _parse_count_strict(r: httpx.Response) -> int | None:
    """Total de `Prefer: count=exact`. None si el header no trae un entero."""
    cr = r.headers.get("content-range") or ""
    # content-range: 0-0/123  o  */0
    if "/" in cr:
        total = cr.rsplit("/", 1)[-1].strip()
        if total.isdigit():
            return int(total)
    return None


def _parse_count(r: httpx.Response) -> int:
    n = _parse_count_strict(r)
    if n is not None:
        return n
    rows = r.json()
    return len(rows) if isinstance(rows, list) else 0


async def count_events(
    user_id: str,
    kind: Kind,
    *,
    since: datetime | None = None,
) -> int:
    """Cuenta eventos del usuario (y kind) desde `since`, o lifetime si since es None."""
    cfg = _config()
    if not cfg or not user_id:
        return 0
    base, key = cfg
    params: dict[str, str] = {
        "user_id": f"eq.{user_id}",
        "kind": f"eq.{kind}",
        "select": "id",
    }
    if since is not None:
        if since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)
        params["created_at"] = f"gte.{since.astimezone(timezone.utc).isoformat()}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{base}/rest/v1/{TABLE}",
                params=params,
                headers={
                    **_headers(key),
                    "Prefer": "count=exact",
                    "Range": "0-0",
                },
            )
            if r.status_code not in (200, 206):
                return 0
            return _parse_count(r)
    except Exception:
        return 0


async def count_kind_events_strict(
    kind: Kind,
    *,
    since: datetime | None = None,
) -> int | None:
    """
    Cuenta eventos de un kind (cualquier user_id, incl. null) desde `since`.

    Distingue «cero eventos» de «no lo sé»: None si falta config, el GET falla
    o PostgREST no manda un `content-range` parseable. Los topes de factura
    (fotos) deben tratar None como cortar; Tavily sigue usando el wrapper
    fail-open `count_kind_events`.
    """
    cfg = _config()
    if not cfg:
        return None
    base, key = cfg
    params: dict[str, str] = {
        "kind": f"eq.{kind}",
        "select": "id",
    }
    if since is not None:
        if since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)
        params["created_at"] = f"gte.{since.astimezone(timezone.utc).isoformat()}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{base}/rest/v1/{TABLE}",
                params=params,
                headers={
                    **_headers(key),
                    "Prefer": "count=exact",
                    "Range": "0-0",
                },
            )
            if r.status_code not in (200, 206):
                return None
            return _parse_count_strict(r)
    except Exception:
        return None


async def count_kind_events(
    kind: Kind,
    *,
    since: datetime | None = None,
) -> int:
    """Cuenta eventos de un kind. Fail-open: 0 si no se puede leer."""
    n = await count_kind_events_strict(kind, since=since)
    return 0 if n is None else n


async def record_event(
    user_id: str | None,
    kind: Kind,
    cost_hint: float | int | None = None,
) -> None:
    """Inserta un evento. Best-effort: no tumba la petición del usuario."""
    cfg = _config()
    if not cfg:
        return
    if kind not in _USERLESS_KINDS and not user_id:
        return
    base, key = cfg
    body: dict[str, object] = {"kind": kind}
    if user_id is not None:
        body["user_id"] = user_id
    if cost_hint is not None:
        body["cost_hint"] = cost_hint
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                f"{base}/rest/v1/{TABLE}",
                headers={**_headers(key), "Prefer": "return=minimal"},
                json=body,
            )
            if r.status_code not in (200, 201, 204):
                log_kv(
                    logger,
                    event="usage_record_failed",
                    kind=kind,
                    status=r.status_code,
                )
    except Exception as e:
        log_kv(
            logger,
            event="usage_record_failed",
            kind=kind,
            error=type(e).__name__,
        )


def _raise_limit(user: AuthUser, kind: Kind, limit: LimitKind) -> None:
    message = _MESSAGES.get((kind, limit)) or "Has alcanzado el límite de uso."
    log_kv(
        logger,
        event="usage_blocked",
        kind=kind,
        limit=limit,
        anon=user.is_anonymous,
    )
    raise HTTPException(
        status_code=429,
        detail={"message": message, "limit": limit},
    )


async def enforce_usage(user: AuthUser | None, kind: Kind) -> None:
    """
    Comprueba la cuota del usuario y lanza HTTP 429 si la ha agotado.

    No registra el evento (eso va después de la API de pago). La comprobación y el
    registro no son atómicos: dos peticiones concurrentes pueden pasar el mismo
    check. Se acepta; la desviación máxima es ~1 unidad por carrera.
    Con `user is None` (auth opcional en local) no aplica límites.
    """
    if user is None:
        return
    if kind in _USERLESS_KINDS:
        return

    if user.is_anonymous:
        if kind == "refresh":
            used = await count_events(user.id, kind)
            if used >= _env_int("GUEST_MAX_REFRESHES", 3):
                _raise_limit(user, kind, "guest")
            return
        used = await count_events(user.id, kind)
        if used >= _guest_max(kind):
            _raise_limit(user, kind, "guest")
        return

    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(days=1)

    if kind == "extraction":
        day_used = await count_events(user.id, kind, since=day_ago)
        if day_used >= _env_int("USER_MAX_EXTRACTIONS_DAY", 10):
            _raise_limit(user, kind, "daily")
        month_used = await count_events(user.id, kind, since=now - timedelta(days=30))
        if month_used >= _env_int("USER_MAX_EXTRACTIONS_MONTH", 50):
            _raise_limit(user, kind, "monthly")
        return

    if kind == "assistant_message":
        used = await count_events(user.id, kind, since=day_ago)
        if used >= _env_int("USER_MAX_ASSISTANT_MESSAGES_DAY", 50):
            _raise_limit(user, kind, "daily")
        return

    if kind == "day_summary":
        used = await count_events(user.id, kind, since=day_ago)
        if used >= _env_int("USER_MAX_DAY_SUMMARIES_DAY", 60):
            _raise_limit(user, kind, "daily")
        return

    if kind == "country_tasks":
        used = await count_events(user.id, kind, since=day_ago)
        if used >= _env_int("USER_MAX_COUNTRY_TASKS_DAY", 30):
            _raise_limit(user, kind, "daily")
        return

    if kind == "refresh":
        used = await count_events(user.id, kind, since=day_ago)
        if used >= _env_int("USER_MAX_REFRESHES_DAY", 20):
            _raise_limit(user, kind, "daily")
        return

    if kind == "place_suggest":
        used = await count_events(user.id, kind, since=day_ago)
        if used >= _env_int("USER_MAX_PLACE_SUGGESTS_DAY", 200):
            _raise_limit(user, kind, "daily")
        return

    if kind == "transport_hub":
        used = await count_events(user.id, kind, since=day_ago)
        if used >= _env_int("USER_MAX_TRANSPORT_HUBS_DAY", 80):
            _raise_limit(user, kind, "daily")
        return

    if kind == "maps_resolve":
        used = await count_events(user.id, kind, since=day_ago)
        if used >= _env_int("USER_MAX_MAPS_RESOLVES_DAY", 200):
            _raise_limit(user, kind, "daily")
        return

    # photo_lookup
    used = await count_events(user.id, kind, since=day_ago)
    if used >= _env_int("USER_MAX_PHOTO_LOOKUPS_DAY", 300):
        _raise_limit(user, kind, "daily")
