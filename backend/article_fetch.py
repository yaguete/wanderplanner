"""
Descarga y limpia HTML de un artículo: texto con enlaces para el LLM y HTML filtrado para el lector.
Usado por `main.py` (extracción de itinerario) y por el asistente (`fetch_url`).
"""
import re
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup, NavigableString, Tag

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


async def fetch_article(url: str) -> tuple[str, str, str | None]:
    """Returns (plain_text, cleaned_html, og_image)."""
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()

    soup = BeautifulSoup(response.text, "lxml")

    og_image = None
    og_tag = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "twitter:image"})
    if og_tag:
        og_image = og_tag.get("content")

    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
        tag.decompose()

    main = _find_content(soup)
    if main:
        _strip_junk(main)

    # Text for Claude (with [text](url) for links) or fallback
    if main:
        plain_text = _text_with_links_for_llm(main, url)
    else:
        text = soup.get_text(separator="\n", strip=True)
        lines_fb = [line for line in text.splitlines() if line.strip()]
        plain_text = "\n".join(lines_fb)

    # HTML limitado a ALLOWED_TAGS para el lector (Crónica); distinto del texto con enlaces para el LLM.
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
            attrs: dict[str, str] = {"src": urljoin(url, src), "alt": tag.get("alt", "")}
            if srcset:
                attrs["srcset"] = srcset
                sizes = tag.get("data-lazy-sizes") or tag.get("sizes") or ""
                if sizes:
                    attrs["sizes"] = sizes
            tag.attrs = attrs
        elif tag.name == "a":
            href = tag.get("href", "")
            tag.attrs = {"href": urljoin(url, href), "target": "_blank", "rel": "noopener noreferrer"}
        else:
            tag.attrs = {}
    cleaned_html = html_root.decode_contents()

    return plain_text, cleaned_html, og_image
