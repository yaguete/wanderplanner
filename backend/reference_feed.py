"""
GET /sources/reference-feed — últimos artículos de un blog de referencia.
GET /sources/reference-search — búsqueda WP en las referencias del usuario.

Un host por petición de feed (cacheable; el fallo de un blog no arrastra a los demás).
La búsqueda recorre hasta 8 hosts en paralelo, fail-open. WP REST; no gasta Tavily.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime
from time import monotonic
from typing import Annotated, Any, Literal
from urllib.parse import urlencode, urljoin, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from lxml import etree
from pydantic import BaseModel, Field

from auth import AuthUser, require_user
from blog_landings import get_blog_landing_by_host
from blog_suggest import (
    WP_TIMEOUT_S,
    apply_instant_from_cache,
    has_excluded_category,
    is_denied_guide_slug,
    rank_score,
    strip_html,
)
from extraction_cache import list_extraction_metas
from inspirational_source import host_is_feedable
from obs import log_kv
from partners import is_public_http_url
from source_suggest import (
    SuggestHit,
    fold_text,
    rewrite_feed_amp_url,
    sanitize_suggest_query,
    url_has_junk_path,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["sources"])

POSTS_PER_HOST = 5
WP_FETCH_PER_PAGE = 20
MAX_BODY_BYTES = 512_000
MAX_FEED_CACHE = 64
MAX_SEARCH_CACHE = 64
MAX_SEARCH_HOSTS = 8
PER_HOST_SEARCH = 4
MAX_SEARCH_RESULTS = 8
CACHE_SCOPE_PREFIX = "feed:"
SEARCH_CACHE_PREFIX = "refsearch:"
WP_FEED_FIELDS = "id,slug,link,title,date,date_gmt,categories,_links,_embedded"
WP_SEARCH_FIELDS = "id,slug,link,title,date,date_gmt,categories"

FeedReason = Literal["not_blog", "unavailable", "empty"] | None

_HOST_RE = re.compile(r"^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$")
_IMG_SRC = re.compile(r"""<img[^>]+src=["']([^"']+)["']""", re.I)
_DAY: date | None = None
_ip_counts: dict[str, int] = {}
_search_day: date | None = None
_search_ip_counts: dict[str, int] = {}
_feed_cache: dict[str, tuple[float, "FeedResponse"]] = {}
_search_cache: dict[str, tuple[float, "SearchResponse"]] = {}


class FeedItem(BaseModel):
    url: str
    title: str
    published_at: str | None = None
    image_url: str | None = None
    instant: bool = False
    host: str = ""


class SearchResponse(BaseModel):
    items: list[FeedItem] = Field(default_factory=list)


class FeedResponse(BaseModel):
    host: str
    items: list[FeedItem] = Field(default_factory=list)
    reason: FeedReason = None


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if raw.isdigit():
        return max(int(raw), 0)
    return default


def _response_ttl_sec() -> float:
    return float(_env_int("SOURCE_SUGGEST_RESPONSE_TTL_SEC", 6 * 3600))


def normalize_feed_host(raw: str) -> str | None:
    h = (raw or "").strip().lower()
    h = h.removeprefix("https://").removeprefix("http://")
    h = h.split("/")[0].split(":")[0].split("@")[-1]
    h = h.removeprefix("www.")
    if not h or "." not in h or len(h) > 80:
        return None
    if not _HOST_RE.fullmatch(h):
        return None
    return h


def slug_from_url(url: str) -> str:
    try:
        path = urlparse(url).path or ""
    except Exception:
        return ""
    segs = [s for s in path.strip("/").split("/") if s]
    return segs[-1] if segs else ""


def to_utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_wp_gmt(raw: Any) -> str | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    s = raw.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    return to_utc_iso(dt)


def parse_rss_date(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        dt = parsedate_to_datetime(text)
        return to_utc_iso(dt)
    except (TypeError, ValueError, IndexError):
        pass
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return to_utc_iso(dt)
    except ValueError:
        return None


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


def featured_media_url(post: dict[str, Any]) -> str | None:
    jetpack = post.get("jetpack_featured_media_url")
    if isinstance(jetpack, str) and jetpack.startswith("http"):
        return jetpack
    embedded = post.get("_embedded")
    if not isinstance(embedded, dict):
        return None
    media = embedded.get("wp:featuredmedia")
    if not isinstance(media, list) or not media:
        return None
    first = media[0]
    if not isinstance(first, dict):
        return None
    details = first.get("media_details")
    if isinstance(details, dict):
        sizes = details.get("sizes")
        if isinstance(sizes, dict):
            for key in ("medium", "medium_large", "thumbnail", "full"):
                size = sizes.get(key)
                if isinstance(size, dict):
                    src = size.get("source_url")
                    if isinstance(src, str) and src.startswith("http"):
                        return src
    src = first.get("source_url")
    if isinstance(src, str) and src.startswith("http"):
        return src
    return None


def _rendered(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        rendered = value.get("rendered")
        if isinstance(rendered, str):
            return rendered
    return ""


def map_wp_post_to_item(post: dict[str, Any], host: str) -> FeedItem | None:
    url = rewrite_feed_amp_url(str(post.get("link") or "").strip())
    if not url or url_has_junk_path(url):
        return None
    slug = str(post.get("slug") or "") or slug_from_url(url)
    if not slug or is_denied_guide_slug(slug):
        return None
    title = strip_html(_rendered(post.get("title")))
    published = parse_wp_gmt(post.get("date_gmt")) or parse_wp_gmt(post.get("date"))
    image = featured_media_url(post)
    display_host = host.removeprefix("www.")
    return FeedItem(
        url=url,
        title=title or display_host or url,
        published_at=published,
        image_url=image,
        instant=False,
        host=display_host,
    )


def select_wp_feed_items(
    posts: list[dict[str, Any]],
    host: str,
    exclude_category_ids: tuple[int, ...],
    limit: int = POSTS_PER_HOST,
) -> list[FeedItem]:
    kept: list[FeedItem] = []
    seen: set[str] = set()
    for post in posts:
        if not isinstance(post, dict):
            continue
        if has_excluded_category(_category_ids(post.get("categories")), exclude_category_ids):
            continue
        item = map_wp_post_to_item(post, host)
        if not item:
            continue
        key = item.url.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        kept.append(item)
        if len(kept) >= max(0, limit):
            break
    return kept


def wp_latest_posts_url(host: str) -> str:
    params = {
        "per_page": str(WP_FETCH_PER_PAGE),
        "orderby": "date",
        "order": "desc",
        "_embed": "wp:featuredmedia",
        "_fields": WP_FEED_FIELDS,
    }
    return f"https://{host}/wp-json/wp/v2/posts?{urlencode(params)}"


def _local_tag(tag: Any) -> str:
    if not isinstance(tag, str):
        return ""
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _child_text(el: etree._Element, *names: str) -> str | None:
    want = {n.lower() for n in names}
    for child in el:
        if _local_tag(child.tag).lower() in want:
            text = (child.text or "").strip()
            if text:
                return text
    return None


def _link_href(el: etree._Element) -> str | None:
    text = _child_text(el, "link")
    if text:
        return text
    for child in el:
        if _local_tag(child.tag).lower() != "link":
            continue
        href = child.get("href")
        if isinstance(href, str) and href.strip():
            rel = (child.get("rel") or "alternate").lower()
            if rel in {"alternate", ""} or "alternate" in rel:
                return href.strip()
    return None


def _entry_image(el: etree._Element) -> str | None:
    for child in el:
        local = _local_tag(child.tag).lower()
        if local in {"thumbnail", "content"}:
            url = child.get("url")
            medium = (child.get("medium") or "").lower()
            typ = (child.get("type") or "").lower()
            if isinstance(url, str) and url.startswith("http"):
                if local == "thumbnail":
                    return url
                if medium == "image" or typ.startswith("image/"):
                    return url
        if local == "enclosure":
            url = child.get("url")
            typ = (child.get("type") or "").lower()
            if isinstance(url, str) and url.startswith("http") and typ.startswith("image/"):
                return url
    encoded = _child_text(el, "encoded")
    if encoded:
        match = _IMG_SRC.search(encoded)
        if match and match.group(1).startswith("http"):
            return match.group(1)
    return None


def parse_feed_bytes(content: bytes, host: str, limit: int = POSTS_PER_HOST) -> list[FeedItem]:
    try:
        root = etree.fromstring(content)
    except etree.XMLSyntaxError:
        return []
    entries: list[etree._Element] = []
    for el in root.iter():
        if _local_tag(el.tag).lower() in {"item", "entry"}:
            entries.append(el)
    kept: list[FeedItem] = []
    seen: set[str] = set()
    display_host = host.removeprefix("www.")
    for entry in entries:
        raw_url = _link_href(entry)
        if not raw_url:
            continue
        url = rewrite_feed_amp_url(raw_url.strip())
        if not url or url_has_junk_path(url):
            continue
        slug = slug_from_url(url)
        if slug and is_denied_guide_slug(slug):
            continue
        title = strip_html(_child_text(entry, "title") or "")
        published = parse_rss_date(
            _child_text(entry, "pubDate", "published", "updated", "date")
        )
        key = url.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        kept.append(
            FeedItem(
                url=url,
                title=title or display_host or url,
                published_at=published,
                image_url=_entry_image(entry),
                instant=False,
                host=display_host,
            )
        )
        if len(kept) >= max(0, limit):
            break
    return kept


def mark_instant(items: list[FeedItem], rows: list[dict[str, Any]]) -> list[FeedItem]:
    if not items:
        return items
    hits = [
        SuggestHit(url=item.url, title=item.title, host="", origin="curated", instant=False)
        for item in items
    ]
    marked = apply_instant_from_cache(hits, rows)
    by_url = {hit.url: hit.instant for hit in marked}
    return [
        item.model_copy(update={"instant": by_url.get(item.url, False)}) for item in items
    ]


def get_cached_feed(host: str) -> FeedResponse | None:
    key = f"{CACHE_SCOPE_PREFIX}{host}"
    entry = _feed_cache.get(key)
    if entry is None:
        return None
    ts, resp = entry
    if monotonic() - ts > _response_ttl_sec():
        _feed_cache.pop(key, None)
        return None
    return resp.model_copy(deep=True)


def set_cached_feed(host: str, resp: FeedResponse) -> None:
    key = f"{CACHE_SCOPE_PREFIX}{host}"
    stored = resp.model_copy(deep=True)
    stored.items = [item.model_copy(update={"instant": False}) for item in stored.items]
    _feed_cache[key] = (monotonic(), stored)
    while len(_feed_cache) > MAX_FEED_CACHE:
        oldest = min(_feed_cache, key=lambda k: _feed_cache[k][0])
        _feed_cache.pop(oldest, None)


def _search_cache_key(query: str, hosts: list[str], cap: int) -> str:
    return f"{SEARCH_CACHE_PREFIX}{fold_text(query)}:{','.join(hosts)}:{cap}"


def get_cached_search(query: str, hosts: list[str], cap: int) -> SearchResponse | None:
    key = _search_cache_key(query, hosts, cap)
    entry = _search_cache.get(key)
    if entry is None:
        return None
    ts, resp = entry
    if monotonic() - ts > _response_ttl_sec():
        _search_cache.pop(key, None)
        return None
    return resp.model_copy(deep=True)


def set_cached_search(query: str, hosts: list[str], cap: int, resp: SearchResponse) -> None:
    key = _search_cache_key(query, hosts, cap)
    stored = resp.model_copy(deep=True)
    stored.items = [item.model_copy(update={"instant": False}) for item in stored.items]
    _search_cache[key] = (monotonic(), stored)
    while len(_search_cache) > MAX_SEARCH_CACHE:
        oldest = min(_search_cache, key=lambda k: _search_cache[k][0])
        _search_cache.pop(oldest, None)


def allow_reference_feed_ip(ip: str | None) -> bool:
    global _DAY, _ip_counts
    today = date.today()
    if _DAY != today:
        _DAY = today
        _ip_counts = {}
    limit = _env_int("REFERENCE_FEED_MAX_IP_DAY", 80)
    if limit == 0:
        return False
    key = (ip or "").strip() or "unknown"
    used = _ip_counts.get(key, 0)
    if used >= limit:
        return False
    _ip_counts[key] = used + 1
    return True


def allow_reference_search_ip(ip: str | None) -> bool:
    global _search_day, _search_ip_counts
    today = date.today()
    if _search_day != today:
        _search_day = today
        _search_ip_counts = {}
    limit = _env_int("REFERENCE_SEARCH_MAX_IP_DAY", 40)
    if limit == 0:
        return False
    key = (ip or "").strip() or "unknown"
    used = _search_ip_counts.get(key, 0)
    if used >= limit:
        return False
    _search_ip_counts[key] = used + 1
    return True


def clear_reference_feed_runtime_state() -> None:
    global _DAY, _ip_counts, _search_day, _search_ip_counts
    _DAY = None
    _ip_counts = {}
    _search_day = None
    _search_ip_counts = {}
    _feed_cache.clear()
    _search_cache.clear()


def _client_ip(request: Request) -> str | None:
    fly = (request.headers.get("fly-client-ip") or "").strip()
    if fly:
        return fly
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    if request.client and request.client.host:
        return request.client.host
    return None


async def _http_get(url: str, accept: str) -> tuple[int, bytes] | None:
    ok = await asyncio.to_thread(is_public_http_url, url)
    if not ok:
        return None
    try:
        async with httpx.AsyncClient(timeout=WP_TIMEOUT_S, follow_redirects=True) as client:
            response = await client.get(
                url,
                headers={"Accept": accept, "User-Agent": "wanderplanner-api"},
            )
    except httpx.HTTPError:
        return None
    if len(response.content) > MAX_BODY_BYTES:
        return None
    return response.status_code, response.content


def _alternate_feed_hrefs(html: bytes, base: str) -> list[str]:
    try:
        root = etree.HTML(html)
    except Exception:
        return []
    if root is None:
        return []
    out: list[str] = []
    for link in root.iter("link"):
        rel_raw = link.get("rel")
        if isinstance(rel_raw, list):
            rel = " ".join(str(p) for p in rel_raw).lower()
        else:
            rel = (rel_raw or "").lower()
        typ = (link.get("type") or "").lower()
        href = link.get("href")
        if not href or not isinstance(href, str):
            continue
        if "alternate" not in rel:
            continue
        if "rss" not in typ and "atom" not in typ and "xml" not in typ:
            continue
        out.append(urljoin(base, href.strip()))
    return out


async def fetch_wp_latest(host: str) -> list[dict[str, Any]] | None:
    fetched = await _http_get(wp_latest_posts_url(host), "application/json")
    if fetched is None:
        return None
    status, body = fetched
    if status != 200:
        return None
    try:
        data = json.loads(body)
    except ValueError:
        return None
    if not isinstance(data, list):
        return None
    return [row for row in data if isinstance(row, dict)]


async def fetch_rss_items(host: str) -> list[FeedItem]:
    origins = [
        f"https://{host}/feed",
        f"https://{host}/rss.xml",
        f"https://{host}/atom.xml",
    ]
    for url in origins:
        fetched = await _http_get(url, "application/rss+xml, application/atom+xml, application/xml, text/xml")
        if fetched is None:
            continue
        status, body = fetched
        if status != 200:
            continue
        items = parse_feed_bytes(body, host)
        if items:
            return items
    home = f"https://{host}/"
    fetched = await _http_get(home, "text/html")
    if fetched is None:
        return []
    status, body = fetched
    if status != 200:
        return []
    for href in _alternate_feed_hrefs(body, home):
        alt = await _http_get(
            href, "application/rss+xml, application/atom+xml, application/xml, text/xml"
        )
        if alt is None:
            continue
        alt_status, alt_body = alt
        if alt_status != 200:
            continue
        items = parse_feed_bytes(alt_body, host)
        if items:
            return items
    return []


async def load_feed_items(host: str) -> tuple[list[FeedItem], str]:
    """Devuelve (items, origin) con origin wp|rss|none."""
    landing = get_blog_landing_by_host(host)
    exclude = landing.exclude_category_ids if landing and landing.enabled else ()
    posts = await fetch_wp_latest(host)
    if posts is not None:
        return select_wp_feed_items(posts, host, exclude), "wp"
    items = await fetch_rss_items(host)
    return items, ("rss" if items else "none")


def parse_search_hosts(raw: list[str] | None) -> list[str]:
    """Normaliza, descarta OTAs/no-blogs y recorta al tope de referencias."""
    seen: set[str] = set()
    out: list[str] = []
    for item in raw or []:
        host = normalize_feed_host(item)
        if not host or host in seen:
            continue
        if not host_is_feedable(host):
            continue
        seen.add(host)
        out.append(host)
        if len(out) >= MAX_SEARCH_HOSTS:
            break
    return out


def wp_search_posts_url(host: str, query: str, *, title_only: bool) -> str:
    params: dict[str, str] = {
        "search": query,
        "per_page": str(WP_FETCH_PER_PAGE),
        "_fields": WP_SEARCH_FIELDS,
    }
    if title_only:
        params["search_columns"] = "post_title"
    return f"https://{host}/wp-json/wp/v2/posts?{urlencode(params)}"


def select_search_items(
    posts: list[dict[str, Any]],
    query: str,
    host: str,
    exclude_category_ids: tuple[int, ...],
    limit: int = PER_HOST_SEARCH,
) -> list[tuple[int, FeedItem]]:
    kept: list[tuple[int, FeedItem]] = []
    seen: set[str] = set()
    for post in posts:
        if not isinstance(post, dict):
            continue
        if has_excluded_category(_category_ids(post.get("categories")), exclude_category_ids):
            continue
        item = map_wp_post_to_item(post, host)
        if not item:
            continue
        key = item.url.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        slug = str(post.get("slug") or "") or slug_from_url(item.url)
        kept.append((rank_score(query, slug, item.title), item))
    kept.sort(key=lambda row: row[0])
    return kept[: max(0, limit)]


def merge_ranked_feed_items(
    groups: list[list[tuple[int, FeedItem]]],
    limit: int = MAX_SEARCH_RESULTS,
) -> list[FeedItem]:
    flat: list[tuple[int, str, FeedItem]] = []
    seen: set[str] = set()
    for group in groups:
        for score, item in group:
            key = item.url.rstrip("/")
            if key in seen:
                continue
            seen.add(key)
            flat.append((score, item.host or "", item))
    flat.sort(key=lambda row: (row[0], row[1], row[2].title.casefold()))
    return [item for _, _, item in flat[: max(0, limit)]]


async def fetch_wp_search_posts(
    host: str, query: str, *, title_only: bool
) -> list[dict[str, Any]] | None:
    fetched = await _http_get(wp_search_posts_url(host, query, title_only=title_only), "application/json")
    if fetched is None:
        return None
    status, body = fetched
    if status != 200:
        return None
    try:
        data = json.loads(body)
    except ValueError:
        return None
    if not isinstance(data, list):
        return None
    return [row for row in data if isinstance(row, dict)]


async def search_one_host(host: str, query: str) -> list[tuple[int, FeedItem]]:
    try:
        landing = get_blog_landing_by_host(host)
        exclude = landing.exclude_category_ids if landing and landing.enabled else ()
        posts = await fetch_wp_search_posts(host, query, title_only=True)
        if not posts:
            posts = await fetch_wp_search_posts(host, query, title_only=False)
        if not posts:
            return []
        return select_search_items(posts, query, host, exclude, PER_HOST_SEARCH)
    except Exception:
        log_kv(logger, event="reference_search", err="host", host=host)
        return []


@router.get("/sources/reference-feed", response_model=FeedResponse)
async def sources_reference_feed(
    request: Request,
    domain: str = Query(..., min_length=1, max_length=80),
    _user: AuthUser | None = Depends(require_user),
) -> FeedResponse:
    host = normalize_feed_host(domain)
    if not host:
        return FeedResponse(host=(domain or "").strip(), items=[], reason="unavailable")
    if not host_is_feedable(host):
        return FeedResponse(host=host, items=[], reason="not_blog")

    cached = get_cached_feed(host)
    payload = cached
    origin = "response_cache"
    if payload is None:
        if not allow_reference_feed_ip(_client_ip(request)):
            return FeedResponse(host=host, items=[], reason="unavailable")
        try:
            items, origin = await load_feed_items(host)
        except Exception:
            log_kv(logger, event="reference_feed", err="fetch")
            items, origin = [], "none"
        reason: FeedReason = None if items else "empty"
        if origin == "none" and not items:
            reason = "unavailable"
        payload = FeedResponse(host=host, items=items, reason=reason)
        set_cached_feed(host, payload)

    try:
        rows = await list_extraction_metas(limit=400)
        payload = payload.model_copy(
            update={"items": mark_instant(payload.items, rows)}
        )
    except Exception:
        log_kv(logger, event="reference_feed_cache", err="list_extraction_metas")

    log_kv(
        logger,
        event="reference_feed",
        n=len(payload.items),
        origin=origin,
        instant=sum(1 for item in payload.items if item.instant),
    )
    return payload


@router.get("/sources/reference-search", response_model=SearchResponse)
async def sources_reference_search(
    request: Request,
    q: str = Query(..., min_length=1, max_length=120),
    domain: Annotated[list[str] | None, Query()] = None,
    _user: AuthUser | None = Depends(require_user),
) -> SearchResponse:
    query = sanitize_suggest_query(q)
    if not query:
        raise HTTPException(
            status_code=400,
            detail="Escribe al menos 3 letras del destino.",
        )

    hosts = parse_search_hosts(domain)
    if not hosts:
        return SearchResponse(items=[])

    cached = get_cached_search(query, hosts, MAX_SEARCH_RESULTS)
    payload = cached
    origin = "response_cache"
    if payload is None:
        if not allow_reference_search_ip(_client_ip(request)):
            raise HTTPException(
                status_code=429,
                detail="Has buscado demasiado seguido. Prueba en un rato.",
            )
        groups = await asyncio.gather(
            *(search_one_host(host, query) for host in hosts),
            return_exceptions=True,
        )
        ranked: list[list[tuple[int, FeedItem]]] = []
        for host, group in zip(hosts, groups, strict=True):
            if isinstance(group, BaseException):
                log_kv(logger, event="reference_search", err="host", host=host)
                ranked.append([])
            else:
                ranked.append(group)
        items = merge_ranked_feed_items(ranked, MAX_SEARCH_RESULTS)
        payload = SearchResponse(items=items)
        set_cached_search(query, hosts, MAX_SEARCH_RESULTS, payload)
        origin = "wp"

    try:
        rows = await list_extraction_metas(limit=400)
        payload = payload.model_copy(update={"items": mark_instant(payload.items, rows)})
    except Exception:
        log_kv(logger, event="reference_search_cache", err="list_extraction_metas")

    log_kv(
        logger,
        event="reference_search",
        n=len(payload.items),
        hosts=len(hosts),
        origin=origin,
        q_len=len(query),
        instant=sum(1 for item in payload.items if item.instant),
    )
    return payload
