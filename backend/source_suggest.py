"""
GET /sources/suggest — artículos para la pestaña «Busca un destino».

Público (como /partners/prewarm). Cascada:
  1. article_extractions de host curado, fresh/stale (gratis, instantáneo)
  2. Tavily restringido a LANDING_SOURCE_DOMAINS
  3. Tavily abierto, detrás de SOURCE_SUGGEST_WEB_ENABLED + Turnstile

Kill switch: SOURCE_SUGGEST_ENABLED=false
El escalón 3: SOURCE_SUGGEST_WEB_ENABLED=true (default apagado).
"""
from __future__ import annotations

import logging
import os
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from article_fetch import normalize_article_url
from extraction_cache import classify_freshness, list_extraction_metas
from inspirational_source import is_inspirational_source_url
from landing_source_domains import LANDING_SOURCE_DOMAINS
from obs import log_kv
from partners import TurnstileUnavailable, verify_turnstile
from usage import count_kind_events, record_event
from web_search import tavily_search

logger = logging.getLogger(__name__)
router = APIRouter(tags=["sources"])

Origin = Literal["cache", "curated", "web"]
MAX_RESULTS = 4
# Tavily con include_domains a veces rellena con ruido; pedimos de más y filtramos.
TAVILY_FETCH = 8
MIN_QUERY_LEN = 3
MAX_QUERY_LEN = 60
_JUNK_PATH = re.compile(r"/(?:feed|amp)(?:/|$)", re.I)

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
    return _env_flag("SOURCE_SUGGEST_WEB_ENABLED", False)


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


def allow_suggest_tavily_ip(ip: str | None) -> bool:
    """Tope diario por IP en memoria. Env LANDING_SOURCE_SEARCH_MAX_IP_DAY (default 20)."""
    global _day, _ip_counts
    today = date.today()
    if _day != today:
        _day = today
        _ip_counts = {}

    limit = _env_int("LANDING_SOURCE_SEARCH_MAX_IP_DAY", 20)
    if limit == 0:
        return False

    key = (ip or "").strip() or "unknown"
    used = _ip_counts.get(key, 0)
    if used >= limit:
        return False
    _ip_counts[key] = used + 1
    return True


async def allow_suggest_tavily_global() -> bool:
    limit = _env_int("LANDING_SOURCE_SEARCH_MAX_DAY", 200)
    if limit == 0:
        return False
    since = datetime.now(timezone.utc) - timedelta(days=1)
    used = await count_kind_events("landing_source_search", since=since)
    return used < limit


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


def hit_from_cache_row(row: dict[str, Any]) -> SuggestHit | None:
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
    """El destino va primero: si no, Tavily rankea diccionarios de 'itinerario'."""
    return f"{query} itinerario"


def hit_from_tavily(item: dict[str, Any], *, origin: Origin) -> SuggestHit | None:
    url = str(item.get("url") or "").strip()
    if not url or not is_inspirational_source_url(url):
        return None
    if _JUNK_PATH.search(urlparse(url).path or ""):
        return None
    host = host_from_url(url)
    if origin == "curated" and not host_is_curated(host):
        return None
    title = item.get("title")
    content = item.get("content")
    heading = title if isinstance(title, str) and title.strip() else host
    dest = content.strip() if isinstance(content, str) and content.strip() else None
    if dest and len(dest) > 140:
        dest = dest[:137] + "…"
    return SuggestHit(
        url=url,
        title=heading or host,
        destination=dest,
        total_days=None,
        host=host,
        origin=origin,
        instant=False,
    )


def merge_hits(*groups: list[SuggestHit]) -> list[SuggestHit]:
    seen: set[str] = set()
    out: list[SuggestHit] = []
    for group in groups:
        for hit in group:
            key = normalize_article_url(hit.url) or hit.url
            if key in seen:
                continue
            seen.add(key)
            out.append(hit)
            if len(out) >= MAX_RESULTS:
                return out
    return out


def cache_hits_for_query(rows: list[dict[str, Any]], query: str) -> list[SuggestHit]:
    hits: list[SuggestHit] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        dest = row.get("destination") if isinstance(row.get("destination"), str) else None
        title = row.get("og_title") if isinstance(row.get("og_title"), str) else None
        if not text_matches(query, dest, title, str(row.get("url") or "")):
            continue
        hit = hit_from_cache_row(row)
        if hit:
            hits.append(hit)
        if len(hits) >= MAX_RESULTS:
            break
    return hits


@router.get("/sources/suggest", response_model=SuggestResponse)
async def sources_suggest(
    request: Request,
    q: str = Query(..., min_length=1, max_length=120),
    captcha_token: str | None = Query(None),
) -> SuggestResponse:
    if not suggest_enabled():
        raise HTTPException(status_code=404, detail="Búsqueda de fuentes desactivada")

    query = sanitize_suggest_query(q)
    if not query:
        raise HTTPException(
            status_code=400,
            detail="Escribe al menos 3 letras del destino.",
        )

    rows = await list_extraction_metas(limit=400)
    cached = cache_hits_for_query(rows, query)
    if len(cached) >= MAX_RESULTS:
        log_kv(logger, event="source_suggest", origin="cache", n=len(cached), q_len=len(query))
        return SuggestResponse(results=cached[:MAX_RESULTS], need_captcha=False)

    remaining = MAX_RESULTS - len(cached)
    curated: list[SuggestHit] = []
    web: list[SuggestHit] = []
    need_captcha = False
    tavily_used = False
    client_ip = _client_ip(request)
    can_tavily = remaining > 0 and allow_suggest_tavily_ip(client_ip)
    if can_tavily:
        can_tavily = await allow_suggest_tavily_global()

    if remaining > 0 and can_tavily:
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
            hit = hit_from_tavily(item, origin="curated")
            if hit:
                curated.append(hit)

    merged = merge_hits(cached, curated)
    remaining = MAX_RESULTS - len(merged)

    if remaining > 0 and suggest_web_enabled():
        token_ok = False
        try:
            token_ok = await verify_turnstile(captcha_token, client_ip)
        except TurnstileUnavailable:
            token_ok = False
        if not token_ok:
            need_captcha = True
        elif can_tavily:
            tavily_used = True
            data = await tavily_search(
                f"{query} itinerario blog",
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
                hit = hit_from_tavily(item, origin="web")
                if hit:
                    web.append(hit)

    if tavily_used:
        await record_event(None, "landing_source_search")

    results = merge_hits(cached, curated, web)
    log_kv(
        logger,
        event="source_suggest",
        cache=len(cached),
        curated=len(curated),
        web=len(web),
        n=len(results),
        q_len=len(query),
    )
    return SuggestResponse(results=results, need_captcha=need_captcha)
