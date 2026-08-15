"""
GET /sources/suggest — artículos para la pestaña «Busca un destino».

Público (como /partners/prewarm). Cascada:
  1. article_extractions de host curado, fresh/stale (gratis, instantáneo)
  2. Tavily restringido a LANDING_SOURCE_DOMAINS
  3. Si 1+2 no dan ningún hit: Tavily abierto (mismo filtro de relevancia)

Kill switch global: SOURCE_SUGGEST_ENABLED=false
Kill switch del escalón 3: SOURCE_SUGGEST_WEB_ENABLED=false
"""
from __future__ import annotations

import logging
import os
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from time import monotonic
from typing import Annotated, Any, Literal
from urllib.parse import urlparse, urlunparse

from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from article_fetch import normalize_article_url
from auth import peek_user
from extraction_cache import classify_freshness, list_extraction_metas
from inspirational_source import is_inspirational_source_url
from landing_source_domains import LANDING_SOURCE_DOMAINS
from obs import log_kv
from usage import Kind, count_kind_events, record_event
from web_search import tavily_search

logger = logging.getLogger(__name__)
router = APIRouter(tags=["sources"])

Origin = Literal["cache", "curated", "web"]
SuggestScope = Literal["landing", "trip"]
MAX_RESULTS = 4
MAX_LIMIT = 8
MAX_HITS_PER_HOST = 2
# Huecos que se dejan a Tavily aunque la caché ya llene, para que no se retroalimente.
TAVILY_RESERVED_SLOTS = 2
# Tavily con include_domains a veces rellena con ruido; pedimos de más y filtramos.
TAVILY_FETCH = 8
MIN_QUERY_LEN = 3
MAX_QUERY_LEN = 60
# /feed y /amp se reescriben al artículo; el resto de archivos se descartan.
_JUNK_PATH = re.compile(
    r"/(?:tag|tags|category|categories|author|page|search)(?:/|$)",
    re.I,
)
_FEED_AMP_TAIL = re.compile(r"/(?:feed|amp)/?$", re.I)
_ARCHIVE_TITLE = re.compile(r"\b(?:archives?|archivos?)\b", re.I)
_GUIDE_SLUG = re.compile(r"^guia(?:-de)?-", re.I)
_REGION_SEGMENTS = frozenset(
    {
        "europa",
        "america",
        "asia",
        "africa",
        "oceania",
        "mundo",
        "viajes",
        "destinos",
        "norteamerica",
        "sudamerica",
        "centroamerica",
        "blog",
        "blogs",
        "guia",
        "guias",
    }
)
_SKIP_WEB_HOSTS = (
    "instagram.com",
    "tiktok.com",
    "facebook.com",
    "pinterest.com",
    "youtube.com",
    "youtu.be",
    "twitter.com",
    "x.com",
    "reddit.com",
)

_day: date | None = None
_ip_counts: dict[str, int] = {}

_Q_STRIP = re.compile(r"[^\w\s\-]", re.UNICODE)


class SuggestHit(BaseModel):
    url: str
    title: str
    destination: str | None = None
    total_days: int | None = None
    host: str
    origin: Origin
    instant: bool = False


class SuggestResponse(BaseModel):
    results: list[SuggestHit] = Field(default_factory=list)
    need_captcha: bool = False


_response_cache: dict[tuple[str, int, str], tuple[float, SuggestResponse]] = {}
MAX_RESPONSE_CACHE = 64


def _env_flag(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    if default:
        return raw not in {"0", "false", "off", "no"}
    return raw in {"1", "true", "on", "yes"}


def suggest_enabled() -> bool:
    return _env_flag("SOURCE_SUGGEST_ENABLED", True)


def suggest_web_enabled() -> bool:
    return _env_flag("SOURCE_SUGGEST_WEB_ENABLED", True)


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if raw.isdigit():
        return max(int(raw), 0)
    return default


def fold_text(value: str) -> str:
    nfkd = unicodedata.normalize("NFKD", value)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).casefold()


def sanitize_suggest_query(raw: str) -> str | None:
    """Letras (con acentos), dígitos, espacios y guiones. Mínimo 3, tope 60."""
    q = _Q_STRIP.sub("", (raw or "").strip())
    q = re.sub(r"\s+", " ", q).strip()
    if len(q) < MIN_QUERY_LEN:
        return None
    return q[:MAX_QUERY_LEN]


def host_from_url(url: str) -> str:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return ""
    return host.removeprefix("www.")


def host_is_curated(host: str, domains: tuple[str, ...] = LANDING_SOURCE_DOMAINS) -> bool:
    h = (host or "").lower().removeprefix("www.")
    if not h:
        return False
    for domain in domains:
        d = domain.lower().removeprefix("www.")
        if h == d or h.endswith("." + d):
            return True
    return False


def text_matches(query: str, *fields: str | None) -> bool:
    needle = fold_text(query)
    if not needle:
        return False
    return any(field and needle in fold_text(field) for field in fields)


def _client_ip(request: Request) -> str | None:
    fly = (request.headers.get("fly-client-ip") or "").strip()
    if fly:
        return fly
    if request.client and request.client.host:
        return request.client.host
    return None


def allow_suggest_tavily_ip(ip: str | None, scope: SuggestScope = "landing") -> bool:
    """Tope diario por IP en memoria. Cubos separados por scope."""
    global _day, _ip_counts
    today = date.today()
    if _day != today:
        _day = today
        _ip_counts = {}

    if scope == "trip":
        limit = _env_int("TRIP_SOURCE_SEARCH_MAX_IP_DAY", 40)
    else:
        limit = _env_int("LANDING_SOURCE_SEARCH_MAX_IP_DAY", 20)
    if limit == 0:
        return False

    key = f"{scope}:{(ip or '').strip() or 'unknown'}"
    used = _ip_counts.get(key, 0)
    if used >= limit:
        return False
    _ip_counts[key] = used + 1
    return True


def _response_ttl_sec() -> float:
    return float(_env_int("SOURCE_SUGGEST_RESPONSE_TTL_SEC", 6 * 3600))


def _response_cache_key(query: str, cap: int, scope: SuggestScope) -> tuple[str, int, str]:
    return (fold_text(query), cap, scope)


def get_cached_suggest_response(
    query: str, cap: int, scope: SuggestScope
) -> SuggestResponse | None:
    key = _response_cache_key(query, cap, scope)
    entry = _response_cache.get(key)
    if entry is None:
        return None
    ts, resp = entry
    if monotonic() - ts > _response_ttl_sec():
        _response_cache.pop(key, None)
        return None
    return resp.model_copy(deep=True)


def set_cached_suggest_response(
    query: str, cap: int, scope: SuggestScope, resp: SuggestResponse
) -> None:
    key = _response_cache_key(query, cap, scope)
    _response_cache[key] = (monotonic(), resp.model_copy(deep=True))
    while len(_response_cache) > MAX_RESPONSE_CACHE:
        oldest = min(_response_cache, key=lambda k: _response_cache[k][0])
        _response_cache.pop(oldest, None)


def clear_suggest_runtime_state() -> None:
    """Tests: vacía tope IP y caché de respuesta."""
    global _day, _ip_counts
    _day = None
    _ip_counts = {}
    _response_cache.clear()


def _tavily_kind(scope: SuggestScope) -> Kind:
    return "trip_source_search" if scope == "trip" else "landing_source_search"


async def allow_suggest_tavily_global(scope: SuggestScope = "landing") -> bool:
    kind = _tavily_kind(scope)
    if kind == "trip_source_search":
        cap = _env_int("TRIP_SOURCE_SEARCH_MAX_DAY", 400)
    else:
        cap = _env_int("LANDING_SOURCE_SEARCH_MAX_DAY", 200)
    if cap == 0:
        return False
    since = datetime.now(timezone.utc) - timedelta(days=1)
    used = await count_kind_events(kind, since=since)
    return used < cap


def _parse_total_days(raw: Any) -> int | None:
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        return raw if raw > 0 else None
    if isinstance(raw, float) and raw.is_integer():
        return int(raw) if raw > 0 else None
    if isinstance(raw, str) and raw.strip().isdigit():
        n = int(raw.strip())
        return n if n > 0 else None
    return None


def hit_from_cache_row(row: dict[str, Any], query: str | None = None) -> SuggestHit | None:
    url = str(row.get("url") or "").strip()
    if not url or not is_inspirational_source_url(url):
        return None
    host = host_from_url(url)
    if not host_is_curated(host):
        return None
    validated = row.get("validated_at") or row.get("fetched_at")
    stamp = None
    if isinstance(validated, str):
        try:
            stamp = datetime.fromisoformat(validated.replace("Z", "+00:00"))
        except ValueError:
            stamp = None
    freshness = classify_freshness(stamp)
    if freshness not in {"fresh", "stale"}:
        return None
    destination = row.get("destination")
    title = row.get("og_title")
    dest = destination if isinstance(destination, str) and destination.strip() else None
    heading = title if isinstance(title, str) and title.strip() else None
    if query and is_destination_index(url, heading, query):
        return None
    return SuggestHit(
        url=url,
        title=heading or dest or host,
        destination=dest,
        total_days=_parse_total_days(row.get("total_days")),
        host=host,
        origin="cache",
        instant=True,
    )


def curated_search_query(query: str) -> str:
    """Solo el destino. «itinerario» diluye el ranking de Tavily (0/8 on-topic)."""
    return query


def rewrite_feed_amp_url(url: str) -> str:
    """Convierte …/articulo/feed y …/articulo/amp en el artículo canónico."""
    parsed = urlparse(url)
    path = parsed.path or ""
    new_path = _FEED_AMP_TAIL.sub("", path)
    if new_path == path:
        return url
    return urlunparse(
        (parsed.scheme, parsed.netloc, new_path or "/", parsed.params, parsed.query, "")
    )


def is_destination_index(url: str, title: str | None, query: str) -> bool:
    """Portada de país / archivo: no es una ruta extraíble."""
    heading = (title or "").strip()
    if heading and _ARCHIVE_TITLE.search(heading):
        return True
    segs = [s for s in (urlparse(url).path or "").strip("/").split("/") if s]
    if not segs:
        return True
    q = fold_text(query)
    last = segs[-1]
    last_norm = fold_text(last.replace("-", " "))
    if last_norm in {f"guia de {q}", f"guia {q}"} or (
        _GUIDE_SLUG.match(last) and q in last_norm.split()
    ):
        return True
    prefixes = segs[:-1]
    if any(fold_text(s.replace("-", " ")) not in _REGION_SEGMENTS for s in prefixes):
        return False
    return last_norm == q


def hit_from_tavily(
    item: dict[str, Any],
    *,
    origin: Origin,
    query: str,
) -> SuggestHit | None:
    url = rewrite_feed_amp_url(str(item.get("url") or "").strip())
    if not url or not is_inspirational_source_url(url):
        return None
    parsed = urlparse(url)
    if _JUNK_PATH.search(parsed.path or ""):
        return None
    query_s = (parsed.query or "").lower()
    if "s=" in query_s or "search=" in query_s:
        return None
    host = host_from_url(url)
    if origin == "curated" and not host_is_curated(host):
        return None
    if origin == "web" and any(host == d or host.endswith("." + d) for d in _SKIP_WEB_HOSTS):
        return None
    title = item.get("title")
    content = item.get("content")
    heading = title.strip() if isinstance(title, str) and title.strip() else ""
    if is_destination_index(url, heading or None, query):
        return None
    display = heading or host
    raw_body = content.strip() if isinstance(content, str) and content.strip() else None
    # Título o slug: el snippet de Tavily cita posts relacionados y cuela destinos ajenos.
    if not text_matches(query, display, parsed.path, (parsed.path or "").replace("-", " ")):
        return None
    dest = raw_body
    if dest and dest.lower().startswith("ir al contenido"):
        dest = None
    if dest and len(dest) > 140:
        dest = dest[:137] + "…"
    return SuggestHit(
        url=url,
        title=display,
        destination=dest,
        total_days=None,
        host=host,
        origin=origin,
        instant=False,
    )


def _hit_dedupe_key(hit: SuggestHit, row: dict[str, Any] | None = None) -> str:
    if row:
        canonical = row.get("canonical_url")
        if isinstance(canonical, str) and canonical.strip():
            return canonical.strip()
    return normalize_article_url(hit.url) or hit.url


def merge_hits(*groups: list[SuggestHit], limit: int = MAX_RESULTS) -> list[SuggestHit]:
    seen: set[str] = set()
    host_counts: dict[str, int] = {}
    out: list[SuggestHit] = []
    cap = max(1, min(limit, MAX_LIMIT))
    for group in groups:
        for hit in group:
            key = _hit_dedupe_key(hit)
            if key in seen:
                continue
            host = (hit.host or host_from_url(hit.url)).removeprefix("www.")
            if host and host_counts.get(host, 0) >= MAX_HITS_PER_HOST:
                continue
            seen.add(key)
            if host:
                host_counts[host] = host_counts.get(host, 0) + 1
            out.append(hit)
            if len(out) >= cap:
                return out
    return out


def cache_hits_for_query(
    rows: list[dict[str, Any]],
    query: str,
    *,
    limit: int = MAX_RESULTS,
) -> list[SuggestHit]:
    hits: list[SuggestHit] = []
    seen: set[str] = set()
    cap = max(1, min(limit, MAX_LIMIT))
    for row in rows:
        if not isinstance(row, dict):
            continue
        dest = row.get("destination") if isinstance(row.get("destination"), str) else None
        title = row.get("og_title") if isinstance(row.get("og_title"), str) else None
        if not text_matches(query, dest, title, str(row.get("url") or "")):
            continue
        hit = hit_from_cache_row(row, query)
        if not hit:
            continue
        key = _hit_dedupe_key(hit, row)
        if key in seen:
            continue
        seen.add(key)
        hits.append(hit)
        if len(hits) >= cap:
            break
    return hits


@router.get("/sources/suggest", response_model=SuggestResponse)
async def sources_suggest(
    request: Request,
    q: str = Query(..., min_length=1, max_length=120),
    captcha_token: Annotated[str | None, Query()] = None,
    scope: Annotated[SuggestScope, Query()] = "landing",
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = MAX_RESULTS,
    fresh: Annotated[bool, Query()] = False,
    authorization: Annotated[str | None, Header()] = None,
) -> SuggestResponse:
    if not suggest_enabled():
        raise HTTPException(status_code=404, detail="Búsqueda de fuentes desactivada")

    query = sanitize_suggest_query(q)
    if not query:
        raise HTTPException(
            status_code=400,
            detail="Escribe al menos 3 letras del destino.",
        )

    cap = max(1, min(limit, MAX_LIMIT))
    user = await peek_user(authorization)
    effective_scope: SuggestScope = scope
    if scope == "trip" and user is None:
        effective_scope = "landing"
    kind = _tavily_kind(effective_scope)
    client_ip = _client_ip(request)

    if not fresh:
        cached_resp = get_cached_suggest_response(query, cap, effective_scope)
        if cached_resp is not None:
            log_kv(
                logger,
                event="source_suggest",
                origin="response_cache",
                n=len(cached_resp.results),
                q_len=len(query),
                scope=effective_scope,
            )
            return cached_resp

    can_tavily = allow_suggest_tavily_ip(client_ip, effective_scope)
    if can_tavily:
        can_tavily = await allow_suggest_tavily_global(effective_scope)

    cache_limit = max(1, cap - TAVILY_RESERVED_SLOTS) if can_tavily else cap
    rows = await list_extraction_metas(limit=400)
    cached = cache_hits_for_query(rows, query, limit=cache_limit)

    curated: list[SuggestHit] = []
    web: list[SuggestHit] = []
    tavily_used = False

    if can_tavily:
        tavily_used = True
        data = await tavily_search(
            curated_search_query(query),
            max_results=TAVILY_FETCH,
            include_raw_content=False,
            preferred_domains=list(LANDING_SOURCE_DOMAINS),
            strict=True,
        )
        if data.get("error"):
            log_kv(logger, event="source_suggest_tavily", step="curated", err=str(data["error"])[:180])
        for item in data.get("results") or []:
            if not isinstance(item, dict):
                continue
            hit = hit_from_tavily(item, origin="curated", query=query)
            if hit:
                curated.append(hit)

    merged = merge_hits(cached, curated, limit=cap)

    # Solo si los blogueros no trajeron nada: no rellenar huecos con la web abierta.
    if len(merged) == 0 and suggest_web_enabled() and can_tavily:
        tavily_used = True
        data = await tavily_search(
            f"{query} blog",
            max_results=TAVILY_FETCH,
            include_raw_content=False,
            preferred_domains=None,
            strict=False,
        )
        if data.get("error"):
            log_kv(logger, event="source_suggest_tavily", step="web", err=str(data["error"])[:180])
        for item in data.get("results") or []:
            if not isinstance(item, dict):
                continue
            hit = hit_from_tavily(item, origin="web", query=query)
            if hit:
                web.append(hit)

    if tavily_used:
        await record_event(user.id if effective_scope == "trip" and user else None, kind)

    results = merge_hits(cached, curated, web, limit=cap)
    resp = SuggestResponse(results=results, need_captcha=False)
    set_cached_suggest_response(query, cap, effective_scope, resp)
    log_kv(
        logger,
        event="source_suggest",
        cache=len(cached),
        curated=len(curated),
        web=len(web),
        n=len(results),
        q_len=len(query),
        scope=effective_scope,
    )
    return resp
