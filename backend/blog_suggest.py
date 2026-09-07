"""
GET /sources/blog-suggest — posts de un blog partner vía su WP REST.

Público (banner, sin sesión). Host fijado por catálogo. No gasta Tavily.
Espejo de `frontend/lib/blog-wp-search.ts` para filtro/ranking.
"""

from __future__ import annotations

import html
import logging
import os
import re
from datetime import date, datetime
from typing import Annotated, Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response

from article_fetch import normalize_article_url
from blog_landings import get_blog_landing
from extraction_cache import (
    classify_freshness,
    list_extraction_metas,
    suggest_row_looks_poisoned,
)
from obs import log_kv
from source_suggest import (
    MAX_LIMIT,
    MAX_RESULTS,
    SuggestHit,
    SuggestResponse,
    fold_text,
    get_cached_suggest_response,
    sanitize_suggest_query,
    set_cached_suggest_response,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["sources"])

WP_TIMEOUT_S = 6.0
WP_PER_PAGE = 20
WP_FETCH_FIELDS = "id,slug,link,title,excerpt,categories"
CACHE_SCOPE_PREFIX = "blog:"
MAX_EXCERPT_LEN = 140

_DENY_SLUG: tuple[re.Pattern[str], ...] = (
    re.compile(r"^seguro-"),
    re.compile(r"(^|-)(mejor-)?seguros?-(de-viaje|para-viajar|viaje)(-|$)"),
    re.compile(r"(^|-)esim(-|$)"),
    re.compile(r"^(como-tener-)?internet-en-"),
    re.compile(r"(^|-)heymondo(-|$)"),
    re.compile(r"(^|-)holafly(-|$)"),
    re.compile(r"(^|-)intermundial(-|$)"),
    re.compile(r"^descuentos?-"),
    re.compile(r"^opiniones-"),
    re.compile(r"(^|-)codigo-descuento(-|$)"),
    re.compile(r"(^|-)sorteos?(-|$)"),
)

_TAG = re.compile(r"<[^>]+>")
_HELLIP_BRACKETS = re.compile(r"\[\s*…\s*\]")
_WS = re.compile(r"\s+")

_day: date | None = None
_ip_counts: dict[str, int] = {}


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if raw.isdigit():
        return max(int(raw), 0)
    return default


def is_denied_guide_slug(slug: str) -> bool:
    folded = fold_text(slug).replace("_", "-")
    return any(pattern.search(folded) for pattern in _DENY_SLUG)


def has_excluded_category(
    categories: list[int] | None, exclude_ids: tuple[int, ...]
) -> bool:
    if not categories or not exclude_ids:
        return False
    banned = set(exclude_ids)
    return any(cid in banned for cid in categories)


def strip_html(raw: str) -> str:
    decoded = html.unescape(raw or "")
    text = _TAG.sub(" ", decoded)
    text = _HELLIP_BRACKETS.sub("…", text)
    return _WS.sub(" ", text).strip()


def _rendered(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        rendered = value.get("rendered")
        if isinstance(rendered, str):
            return rendered
    return ""


def _query_in(field: str, query: str) -> bool:
    needle = fold_text(query).strip()
    if not needle:
        return False
    return needle in fold_text(field)


def rank_score(query: str, slug: str, title: str) -> int:
    if _query_in(slug.replace("-", " "), query) or _query_in(slug, query):
        return 0
    if _query_in(title, query):
        return 1
    return 2


def map_wp_post_to_hit(post: dict[str, Any], host: str) -> SuggestHit | None:
    url = str(post.get("link") or "").strip()
    if not url:
        return None
    title = strip_html(_rendered(post.get("title")))
    excerpt = strip_html(_rendered(post.get("excerpt")))
    if excerpt and len(excerpt) > MAX_EXCERPT_LEN:
        excerpt = excerpt[: MAX_EXCERPT_LEN - 1] + "…"
    display_host = host.removeprefix("www.")
    return SuggestHit(
        url=url,
        title=title or display_host or url,
        destination=excerpt or None,
        total_days=None,
        host=display_host,
        origin="curated",
        instant=False,
    )


def _category_ids(raw: Any) -> list[int]:
    if not isinstance(raw, list):
        return []
    out: list[int] = []
    for item in raw:
        if isinstance(item, bool):
            continue
        if isinstance(item, int):
            out.append(item)
        elif isinstance(item, float) and item.is_integer():
            out.append(int(item))
    return out


def select_blog_hits(
    posts: list[dict[str, Any]],
    query: str,
    host: str,
    exclude_category_ids: tuple[int, ...],
    limit: int = MAX_RESULTS,
) -> list[SuggestHit]:
    kept: list[tuple[int, SuggestHit]] = []
    seen: set[str] = set()
    for post in posts:
        if not isinstance(post, dict):
            continue
        slug = str(post.get("slug") or "")
        if not slug or is_denied_guide_slug(slug):
            continue
        if has_excluded_category(_category_ids(post.get("categories")), exclude_category_ids):
            continue
        hit = map_wp_post_to_hit(post, host)
        if not hit:
            continue
        key = hit.url.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        kept.append((rank_score(query, slug, hit.title), hit))
    kept.sort(key=lambda row: row[0])
    cap = max(0, limit)
    return [hit for _, hit in kept[:cap]]


def _cache_key_scope(blog_slug: str) -> str:
    return f"{CACHE_SCOPE_PREFIX}{blog_slug}"


def allow_blog_suggest_ip(ip: str | None) -> bool:
    global _day, _ip_counts
    today = date.today()
    if _day != today:
        _day = today
        _ip_counts = {}
    limit = _env_int("BLOG_SUGGEST_MAX_IP_DAY", 40)
    if limit == 0:
        return False
    key = (ip or "").strip() or "unknown"
    used = _ip_counts.get(key, 0)
    if used >= limit:
        return False
    _ip_counts[key] = used + 1
    return True


def clear_blog_suggest_runtime_state() -> None:
    global _day, _ip_counts
    _day = None
    _ip_counts = {}


def wp_posts_url(host: str, query: str, *, title_only: bool) -> str:
    params: dict[str, str] = {
        "search": query,
        "per_page": str(WP_PER_PAGE),
        "_fields": WP_FETCH_FIELDS,
    }
    if title_only:
        params["search_columns"] = "post_title"
    return f"https://{host}/wp-json/wp/v2/posts?{urlencode(params)}"


async def fetch_wp_posts(host: str, query: str, *, title_only: bool) -> list[dict[str, Any]]:
    url = wp_posts_url(host, query, title_only=title_only)
    try:
        async with httpx.AsyncClient(timeout=WP_TIMEOUT_S, follow_redirects=True) as client:
            response = await client.get(
                url,
                headers={"Accept": "application/json", "User-Agent": "wanderplanner-api"},
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=502,
            detail="Ahora mismo no podemos buscar en el blog. Inténtalo de nuevo.",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Ahora mismo no podemos buscar en el blog. Inténtalo de nuevo.",
        ) from exc
    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail="Ahora mismo no podemos buscar en el blog. Inténtalo de nuevo.",
        )
    data = response.json()
    if not isinstance(data, list):
        return []
    return [row for row in data if isinstance(row, dict)]


def apply_instant_from_cache(
    hits: list[SuggestHit], rows: list[dict[str, Any]]
) -> list[SuggestHit]:
    by_key: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        url = str(row.get("url") or "").strip()
        canonical = row.get("canonical_url")
        keys = [normalize_article_url(url)] if url else []
        if isinstance(canonical, str) and canonical.strip():
            keys.append(canonical.strip())
        validated = row.get("validated_at") or row.get("fetched_at")
        stamp = None
        if isinstance(validated, str):
            try:
                stamp = datetime.fromisoformat(validated.replace("Z", "+00:00"))
            except ValueError:
                stamp = None
        if classify_freshness(stamp) not in {"fresh", "stale"}:
            continue
        if suggest_row_looks_poisoned(row):
            continue
        for key in keys:
            if key:
                by_key[key] = row
    out: list[SuggestHit] = []
    for hit in hits:
        key = normalize_article_url(hit.url)
        row = by_key.get(key) if key else None
        if row is not None:
            og = row.get("og_title")
            heading = og.strip() if isinstance(og, str) else ""
            updates: dict[str, Any] = {"origin": "cache", "instant": True}
            if heading:
                updates["title"] = heading
            out.append(hit.model_copy(update=updates))
        else:
            out.append(hit)
    return out


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    fly = request.headers.get("fly-client-ip")
    if fly:
        return fly
    if request.client and request.client.host:
        return request.client.host
    return None


@router.get("/sources/blog-suggest", response_model=SuggestResponse)
async def sources_blog_suggest(
    request: Request,
    response: Response,
    blog: str = Query(..., min_length=1, max_length=80),
    q: str = Query(..., min_length=1, max_length=120),
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = MAX_RESULTS,
) -> SuggestResponse:
    landing = get_blog_landing(blog)
    if landing is None or not landing.enabled:
        raise HTTPException(status_code=404, detail="Este blog no tiene buscador")

    query = sanitize_suggest_query(q)
    if not query:
        raise HTTPException(
            status_code=400,
            detail="Escribe al menos 3 letras del destino.",
        )

    cap = max(1, min(limit, MAX_LIMIT))
    scope = _cache_key_scope(landing.slug)
    cached = get_cached_suggest_response(query, cap, scope)
    if cached is not None:
        response.headers["Cache-Control"] = "public, s-maxage=600, stale-while-revalidate=3600"
        log_kv(
            logger,
            event="blog_suggest",
            origin="response_cache",
            blog=landing.slug,
            n=len(cached.results),
            q_len=len(query),
        )
        return cached

    if not allow_blog_suggest_ip(_client_ip(request)):
        raise HTTPException(
            status_code=429,
            detail="Has buscado demasiado seguido. Prueba en un rato.",
        )

    posts = await fetch_wp_posts(landing.host, query, title_only=True)
    title_only = True
    if not posts:
        posts = await fetch_wp_posts(landing.host, query, title_only=False)
        title_only = False

    hits = select_blog_hits(
        posts,
        query,
        landing.host,
        landing.exclude_category_ids,
        limit=cap,
    )
    try:
        rows = await list_extraction_metas(limit=400)
        hits = apply_instant_from_cache(hits, rows)
    except Exception:
        log_kv(logger, event="blog_suggest_cache", err="list_extraction_metas")

    payload = SuggestResponse(results=hits, need_captcha=False)
    set_cached_suggest_response(query, cap, scope, payload)
    response.headers["Cache-Control"] = "public, s-maxage=600, stale-while-revalidate=3600"
    log_kv(
        logger,
        event="blog_suggest",
        blog=landing.host,
        n=len(hits),
        q_len=len(query),
        title_only=title_only,
        instant=sum(1 for h in hits if h.instant),
    )
    return payload
