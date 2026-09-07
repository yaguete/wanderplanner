"""
Descarga y limpia HTML de un artículo: texto con enlaces para el LLM y HTML filtrado para el lector.
Usado por `main.py` (extracción de itinerario) y por el asistente (`fetch_url`).

También expone señales de frescura para la caché stale-while-revalidate:
`article_modified_at`, ETag/Last-Modified y un hash versionado del texto limpio.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Literal
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup, NavigableString, Tag

from partners import is_public_http_url
from waf_challenge import (
    BROWSER_USER_AGENT,
    browser_headers,
    featured_media_url,
    is_bot_challenge,
)

logger = logging.getLogger(__name__)

# Subir a mano al cambiar selectores / junk-stripping. Evita tormentas de redestilación.
CONTENT_VERSION = 1

ALLOWED_TAGS = {
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "img", "strong",
    "em", "a", "ul", "ol", "li", "blockquote", "figure",
    "figcaption", "br",
}

_JUNK_ATTRS_RE = re.compile(
    r'comment|respond|reply|disqus|'
    r'author-bio|author-box|author-info|byline|vcard|entry-meta|post-meta|'
    r'sharedaddy|share-button|jp-relatedposts|'
    r'social-share|related-posts|newsletter|post-nav|'
    r'related_posts|recommended|viajes-recomendados|enlazatom',
    re.I,
)

_TAIL_HEADING_RE = re.compile(
    r'preguntas?\s+frecuentes|(?:^|\b)faq(?:\b|$)|frequently\s+asked|'
    r'\d+\s*comentarios?|^comentarios?$|^comments?$|'
    r'leave\s+a\s+(?:reply|comment)|deja\s+un\s+comentario|'
    r'viajes\s+recomendados|related\s+posts|art[ií]culos?\s+relacionados',
    re.I,
)

_CONTENT_SELECTORS = [
    "[itemprop='articleBody']",
    "div.entry-content",
    "div.post-content",
    "div.article-content",
    "div.td-post-content",
    "div.elementor-widget-theme-post-content",
    "div.tdb-block-inner",
    "div.single-content",
]

MIN_CONTENT_LEN = 500
_MIN_CONTENT_LEN = MIN_CONTENT_LEN

FetchPath = Literal["html", "wp-rest", "rest-route"]

_WP_REST_FIELDS = "title,content,modified_gmt,link"
_WP_REST_EMBED = "wp:featuredmedia"

# Mantener en espejo con frontend/lib/partner-button.ts (TRACKING_PARAMS).
_TRACKING_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "ref",
    "igsh",
    "igsi",
    "img_index",
    "igshid",
}

# Alias público: el feed y los tests importan el mismo UA.
_USER_AGENT = BROWSER_USER_AGENT


class ArticleUnavailable(httpx.HTTPError):
    """El HTML y el fallback WP REST no dieron texto usable. No destilar ni cachear."""

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        reason: str = "empty",
        tried: tuple[str, ...] | list[str] = (),
        fetch_path: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.reason = reason
        self.tried = tuple(tried)
        self.fetch_path = fetch_path


@dataclass
class ArticleFetchResult:
    """Resultado de descarga. `not_modified=True` implica 304 (sin body)."""

    not_modified: bool = False
    plain_text: str = ""
    cleaned_html: str = ""
    og_image: str | None = None
    og_title: str | None = None
    etag: str | None = None
    last_modified: str | None = None
    article_modified_at: datetime | None = None
    content_hash: str | None = None
    content_version: int = CONTENT_VERSION
    fetch_path: FetchPath = "html"


def _clean_og_title(raw: str | None) -> str | None:
    if not raw or not isinstance(raw, str):
        return None
    text = " ".join(raw.split()).strip()
    if not text:
        return None
    # Quitar sufijos típicos de plantilla ("… | Blog", "… - Autor").
    for sep in (" | ", " — ", " – ", " - "):
        if sep in text:
            left, right = text.rsplit(sep, 1)
            if len(left.strip()) >= 12 and len(right.strip()) <= 40:
                text = left.strip()
                break
    return text or None


def extract_og_title(soup: BeautifulSoup) -> str | None:
    """og:title / twitter:title / <title> del documento."""
    for prop in ("og:title", "twitter:title"):
        tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
        if tag:
            cleaned = _clean_og_title(tag.get("content"))
            if cleaned:
                return cleaned
    title_tag = soup.find("title")
    if title_tag:
        return _clean_og_title(title_tag.get_text())
    return None


def normalize_article_url(raw: str) -> str:
    """Clave canónica: sin fragmento, sin tracking params, host en minúsculas, sin / final."""
    raw = (raw or "").strip()
    if not raw:
        return ""
    # Import local para no crear un ciclo con instagram.py (que importa content_hash).
    from instagram_url import canonical_instagram_url

    ig = canonical_instagram_url(raw)
    if ig:
        return ig
    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        return raw.rstrip("#").rstrip("/")

    query_pairs = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=True)
        if k.lower() not in _TRACKING_PARAMS
    ]
    path = parsed.path.rstrip("/") or ""
    return urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            path,
            "",
            urlencode(query_pairs, doseq=True),
            "",
        )
    )


def content_hash(plain_text: str) -> str:
    """sha256 del texto limpio que entra a Claude."""
    return hashlib.sha256((plain_text or "").encode("utf-8")).hexdigest()


def _parse_datetime(raw: str | None) -> datetime | None:
    if not raw or not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        stamp = datetime.fromisoformat(text)
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        return stamp.astimezone(timezone.utc)
    except ValueError:
        pass
    try:
        stamp = parsedate_to_datetime(raw)
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        return stamp.astimezone(timezone.utc)
    except (TypeError, ValueError, IndexError):
        return None


def _walk_json_ld(node: Any, out: list[datetime]) -> None:
    if isinstance(node, dict):
        raw = node.get("dateModified")
        if isinstance(raw, str):
            stamp = _parse_datetime(raw)
            if stamp is not None:
                out.append(stamp)
                return
        for value in node.values():
            _walk_json_ld(value, out)
    elif isinstance(node, list):
        for item in node:
            _walk_json_ld(item, out)


def extract_article_modified_at(soup: BeautifulSoup) -> datetime | None:
    """
    Señal semántica de WordPress/blogs: meta og/article + JSON-LD dateModified.

    Solo señales de MODIFICACIÓN: la fecha de publicación no cambia al editar y
    `_content_unchanged` corta cuando las fechas coinciden, así que usarla como
    fallback haría invisible cualquier actualización del artículo.
    """
    meta_props = (
        "article:modified_time",
        "og:updated_time",
    )
    for prop in meta_props:
        tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
        if tag:
            stamp = _parse_datetime(tag.get("content"))
            if stamp is not None:
                return stamp

    stamps: list[datetime] = []
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = script.string or script.get_text() or ""
        raw = raw.strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        _walk_json_ld(data, stamps)
        if stamps:
            return stamps[0]
    return None


def _find_content(soup):
    """Locate the main article content using multiple strategies."""
    main = soup.find("main")
    if main and len(main.get_text(strip=True)) > _MIN_CONTENT_LEN:
        return main

    for selector in _CONTENT_SELECTORS:
        el = soup.select_one(selector)
        if el and len(el.get_text(strip=True)) > _MIN_CONTENT_LEN:
            return el

    articles = soup.find_all("article")
    if articles:
        best = max(articles, key=lambda a: len(a.get_text(strip=True)))
        if len(best.get_text(strip=True)) > _MIN_CONTENT_LEN:
            return best

    # SPA fallback: para apps que reparten el artículo en <section> bajo #__next / #app / #root.
    spa_root = soup.find(id="__next") or soup.find(id="app") or soup.find(id="root")
    if spa_root:
        children = spa_root.find_all(True, recursive=False)
        wrapper = max(children, key=lambda c: len(c.get_text(strip=True))) if children else spa_root

        sections = wrapper.find_all("section", recursive=False)
        rich = [s for s in sections if len(s.find_all("p")) >= 2]
        if rich:
            container = BeautifulSoup("<div></div>", "lxml").find("div")
            for s in rich:
                container.append(s)
            if len(container.get_text(strip=True)) > _MIN_CONTENT_LEN:
                return container

    return soup.find("body")


def _text_with_links_for_llm(root, page_url: str) -> str:
    """
    Text for the LLM: like visible text, but <a> becomes [label](absolute_url)
    so affiliate/booking links can be extracted.
    """
    if root is None:
        return ""

    def walk(node) -> str:
        if isinstance(node, NavigableString):
            return str(node)
        if not isinstance(node, Tag):
            return ""
        if node.name == "br":
            return "\n"
        if node.name == "a":
            label = node.get_text(strip=True) or "enlace"
            href = (node.get("href") or "").strip()
            if href and not href.startswith(("#", "javascript:", "mailto:")):
                abs_href = urljoin(page_url, href)
                return f"[{label}]({abs_href})"
            return label
        parts: list[str] = []
        for child in node.children:
            parts.append(walk(child))
        inner = "".join(parts)
        if node.name in (
            "p", "h1", "h2", "h3", "h4", "h5", "h6", "li",
            "tr", "blockquote", "div", "ul", "ol", "section", "table",
        ):
            if inner and not inner.endswith("\n"):
                return inner + "\n"
        return inner

    raw = walk(root).strip()
    lines = [line for line in raw.splitlines() if line.strip()]
    return "\n".join(lines)


def _strip_junk(root):
    """Remove author boxes, comment sections, FAQ blocks and other non-article noise."""
    for el in list(root.find_all(id=_JUNK_ATTRS_RE)):
        el.decompose()
    for el in list(root.find_all(class_=_JUNK_ATTRS_RE)):
        el.decompose()

    for heading in root.find_all(re.compile(r'^h[1-6]$')):
        if _TAIL_HEADING_RE.search(heading.get_text(strip=True)):
            for sib in list(heading.find_next_siblings()):
                sib.decompose()
            heading.decompose()
            break


def _clean_html(main, soup: BeautifulSoup, page_url: str) -> str:
    html_root = BeautifulSoup(str(main), "lxml").body if main else soup
    for tag in html_root.find_all(True):
        if tag.name not in ALLOWED_TAGS:
            tag.unwrap()
        elif tag.name == "img":
            src = (
                tag.get("data-lazy-src")
                or tag.get("data-src")
                or tag.get("data-original")
                or tag.get("src")
                or ""
            )
            if src.startswith("data:"):
                src = tag.get("data-lazy-src") or tag.get("data-src") or ""
            srcset = tag.get("data-lazy-srcset") or tag.get("srcset") or ""
            attrs: dict[str, str] = {"src": urljoin(page_url, src), "alt": tag.get("alt", "")}
            if srcset:
                attrs["srcset"] = srcset
                sizes = tag.get("data-lazy-sizes") or tag.get("sizes") or ""
                if sizes:
                    attrs["sizes"] = sizes
            tag.attrs = attrs
        elif tag.name == "a":
            href = tag.get("href", "")
            tag.attrs = {
                "href": urljoin(page_url, href),
                "target": "_blank",
                "rel": "noopener noreferrer",
            }
        else:
            tag.attrs = {}
    return html_root.decode_contents()


def parse_article_html(html: str, page_url: str) -> ArticleFetchResult:
    """Parsea HTML ya descargado (útil en tests)."""
    soup = BeautifulSoup(html, "lxml")
    article_modified_at = extract_article_modified_at(soup)

    og_image = None
    og_tag = soup.find("meta", property="og:image") or soup.find(
        "meta", attrs={"name": "twitter:image"}
    )
    if og_tag:
        og_image = og_tag.get("content")

    og_title = extract_og_title(soup)

    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
        tag.decompose()

    main = _find_content(soup)
    if main:
        _strip_junk(main)

    if main:
        plain_text = _text_with_links_for_llm(main, page_url)
    else:
        text = soup.get_text(separator="\n", strip=True)
        lines_fb = [line for line in text.splitlines() if line.strip()]
        plain_text = "\n".join(lines_fb)

    cleaned_html = _clean_html(main, soup, page_url)
    return ArticleFetchResult(
        plain_text=plain_text,
        cleaned_html=cleaned_html,
        og_image=og_image,
        og_title=og_title,
        article_modified_at=article_modified_at,
        content_hash=content_hash(plain_text),
        content_version=CONTENT_VERSION,
    )


def html_result_usable(result: ArticleFetchResult) -> bool:
    """Texto largo, o corto con titular: un post breve real siempre trae <title>."""
    if len((result.plain_text or "").strip()) >= _MIN_CONTENT_LEN:
        return True
    return bool((result.og_title or "").strip())


def slug_from_article_url(url: str) -> str | None:
    try:
        path = urlparse(url).path or ""
    except Exception:
        return None
    segs = [s for s in path.strip("/").split("/") if s]
    if not segs:
        return None
    slug = segs[-1]
    if not slug or len(slug) > 200:
        return None
    return slug


def _slugs_to_try(original_url: str, final_url: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in (final_url, original_url):
        slug = slug_from_article_url(raw)
        if slug and slug not in seen:
            seen.add(slug)
            out.append(slug)
    return out


def _wp_json_posts_url(host: str, slug: str) -> str:
    params = {
        "slug": slug,
        "_fields": _WP_REST_FIELDS,
        "_embed": _WP_REST_EMBED,
    }
    return f"https://{host}/wp-json/wp/v2/posts?{urlencode(params)}"


def _wp_rest_route_posts_url(host: str, slug: str) -> str:
    params = {
        "rest_route": "/wp/v2/posts",
        "slug": slug,
        "_fields": _WP_REST_FIELDS,
        "_embed": _WP_REST_EMBED,
    }
    return f"https://{host}/?{urlencode(params)}"


def _host_from_url(url: str) -> str | None:
    try:
        host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    except Exception:
        return None
    return host or None


def _rendered_wp_field(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        rendered = value.get("rendered")
        if isinstance(rendered, str):
            return rendered
    return ""


def _result_from_wp_post(
    post: dict[str, Any],
    page_url: str,
    *,
    fetch_path: FetchPath,
) -> ArticleFetchResult | None:
    html = _rendered_wp_field(post.get("content"))
    if not html.strip():
        return None
    parsed = parse_article_html(html, page_url)
    raw_title = _rendered_wp_field(post.get("title"))
    if raw_title:
        title = _clean_og_title(
            BeautifulSoup(raw_title, "lxml").get_text(" ", strip=True)
        )
        if title:
            parsed.og_title = title
    image = featured_media_url(post)
    if image:
        parsed.og_image = image
    modified = _parse_datetime(str(post.get("modified_gmt") or "") or None)
    if modified is not None:
        parsed.article_modified_at = modified
    parsed.fetch_path = fetch_path
    if not html_result_usable(parsed):
        return None
    return parsed


def _is_wp_rest_no_route(response: httpx.Response) -> bool:
    if response.status_code not in {404, 410}:
        return False
    try:
        data = response.json()
    except ValueError:
        return True
    return isinstance(data, dict) and data.get("code") == "rest_no_route"


async def _get_public(url: str, accept: str) -> httpx.Response | None:
    ok = await asyncio.to_thread(is_public_http_url, url)
    if not ok:
        return None
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            return await client.get(url, headers=browser_headers(accept))
    except httpx.HTTPError:
        return None


async def _fetch_via_wordpress_rest(
    original_url: str,
    final_url: str,
    tried: list[str],
) -> ArticleFetchResult | None:
    """GET /wp-json/wp/v2/posts?slug=… y, si hay reto, ?rest_route=."""
    page_url = final_url or original_url
    host = _host_from_url(page_url) or _host_from_url(original_url)
    if not host:
        return None
    slugs = _slugs_to_try(original_url, page_url)
    if not slugs:
        return None

    paths: list[tuple[FetchPath, Any]] = [
        ("wp-rest", _wp_json_posts_url),
        ("rest-route", _wp_rest_route_posts_url),
    ]
    for fetch_path, builder in paths:
        for slug in slugs:
            rest_url = builder(host, slug)
            response = await _get_public(rest_url, "application/json")
            if response is None:
                continue
            tried.append(fetch_path)
            if is_bot_challenge(response.status_code, response.content):
                logger.info(
                    "article_wp_rest challenge path=%s status=%s host=%s",
                    fetch_path,
                    response.status_code,
                    host,
                )
                break
            if _is_wp_rest_no_route(response):
                break
            if response.status_code != 200:
                continue
            try:
                data = response.json()
            except ValueError:
                continue
            if not isinstance(data, list) or not data:
                continue
            post = data[0]
            if not isinstance(post, dict):
                continue
            parsed = _result_from_wp_post(post, page_url, fetch_path=fetch_path)
            if parsed is not None:
                return parsed
    return None


async def fetch_article(
    url: str,
    *,
    etag: str | None = None,
    last_modified: str | None = None,
) -> ArticleFetchResult:
    """
    Descarga el artículo. Si el servidor responde 304, `not_modified=True` y el resto vacío.
    HTML usable → lo de siempre. Si hay reto, 202/403/429 o texto vacío, WP REST por slug.
    404/410 no entran al fallback. Si tampoco hay texto, `ArticleUnavailable`.
    """
    headers = browser_headers("text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        response = await client.get(url, headers=headers)

    response_etag = response.headers.get("etag")
    response_last_modified = response.headers.get("last-modified")
    final_url = str(response.url) if response.url else url
    tried: list[str] = ["html"]

    if response.status_code == 304:
        return ArticleFetchResult(
            not_modified=True,
            etag=response_etag or etag,
            last_modified=response_last_modified or last_modified,
            content_version=CONTENT_VERSION,
            fetch_path="html",
        )

    challenged = is_bot_challenge(response.status_code, response.content)
    html_usable = False
    parsed: ArticleFetchResult | None = None
    if response.status_code == 200 and not challenged:
        # URL original: delta cero en content_hash del camino feliz (hrefs relativos).
        parsed = parse_article_html(response.text, url)
        parsed.etag = response_etag
        parsed.last_modified = response_last_modified
        parsed.fetch_path = "html"
        html_usable = html_result_usable(parsed)

    if html_usable and parsed is not None:
        return parsed

    skip_rest = response.status_code in {404, 410} and not challenged
    if not skip_rest:
        rest = await _fetch_via_wordpress_rest(url, final_url, tried)
        if rest is not None:
            rest.etag = rest.etag or response_etag
            rest.last_modified = rest.last_modified or response_last_modified
            return rest

    if challenged:
        reason = "challenge"
    elif response.status_code != 200:
        reason = "http-error"
    else:
        reason = "empty"
    raise ArticleUnavailable(
        f"article unavailable: {url}",
        status=response.status_code,
        reason=reason,
        tried=tried,
        fetch_path=tried[-1] if tried else "html",
    )
