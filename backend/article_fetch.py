"""
Descarga y limpia HTML de un artículo: texto con enlaces para el LLM y HTML filtrado para el lector.
Usado por `main.py` (extracción de itinerario) y por el asistente (`fetch_url`).

También expone señales de frescura para la caché stale-while-revalidate:
`article_modified_at`, ETag/Last-Modified y un hash versionado del texto limpio.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup, NavigableString, Tag

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

_MIN_CONTENT_LEN = 500

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
}

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


@dataclass
class ArticleFetchResult:
    """Resultado de descarga. `not_modified=True` implica 304 (sin body)."""

    not_modified: bool = False
    plain_text: str = ""
    cleaned_html: str = ""
    og_image: str | None = None
    etag: str | None = None
    last_modified: str | None = None
    article_modified_at: datetime | None = None
    content_hash: str | None = None
    content_version: int = CONTENT_VERSION


def normalize_article_url(raw: str) -> str:
    """Clave canónica: sin fragmento, sin tracking params, host en minúsculas, sin / final."""
    raw = (raw or "").strip()
    if not raw:
        return ""
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
        article_modified_at=article_modified_at,
        content_hash=content_hash(plain_text),
        content_version=CONTENT_VERSION,
    )


async def fetch_article(
    url: str,
    *,
    etag: str | None = None,
    last_modified: str | None = None,
) -> ArticleFetchResult:
    """
    Descarga el artículo. Si el servidor responde 304, `not_modified=True` y el resto vacío.
    Compatible con el uso legacy: `plain_text, cleaned_html, og_image = await fetch_article(url)`
    ya no funciona (dataclass); los callers deben usar `.plain_text` etc.
    """
    headers = {"User-Agent": _USER_AGENT}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        response = await client.get(url, headers=headers)

    response_etag = response.headers.get("etag")
    response_last_modified = response.headers.get("last-modified")

    if response.status_code == 304:
        return ArticleFetchResult(
            not_modified=True,
            etag=response_etag or etag,
            last_modified=response_last_modified or last_modified,
            content_version=CONTENT_VERSION,
        )

    response.raise_for_status()
    result = parse_article_html(response.text, url)
    result.etag = response_etag
    result.last_modified = response_last_modified
    return result
