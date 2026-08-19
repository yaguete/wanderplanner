"""Parseo y canónica de URLs de Instagram. Espejo de frontend/lib/instagram-url.ts.

Módulo pequeño a propósito: `article_fetch.normalize_article_url` lo importa sin
circular con el resolver (`instagram.py`).
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

_SHORTCODE_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_MEDIA_KINDS = frozenset({"p", "reel", "reels"})
_RESERVED_FIRST = frozenset(
    {
        "p",
        "reel",
        "reels",
        "stories",
        "explore",
        "accounts",
        "about",
        "legal",
        "tv",
        "share",
        "direct",
        "tags",
    }
)


def _bare_host(host: str) -> str:
    return host.lower().removeprefix("www.")


def is_instagram_host(host: str) -> bool:
    h = _bare_host(host)
    return h == "instagram.com" or h.endswith(".instagram.com") or h == "instagr.am"


def parse_instagram_shortcode(url: str) -> str | None:
    raw = (url or "").strip()
    if not raw.startswith(("http://", "https://")):
        return None
    try:
        parsed = urlparse(raw)
    except Exception:
        return None
    host = parsed.hostname or ""
    if not is_instagram_host(host):
        return None
    segs = [s for s in (parsed.path or "/").split("/") if s]
    if len(segs) >= 2 and segs[0].lower() in _MEDIA_KINDS:
        code = segs[1]
        return code if _SHORTCODE_RE.match(code) else None
    if (
        len(segs) >= 3
        and segs[0].lower() not in _RESERVED_FIRST
        and segs[1].lower() in {"p", "reel"}
    ):
        code = segs[2]
        return code if _SHORTCODE_RE.match(code) else None
    return None


def is_instagram_media_url(url: str) -> bool:
    return parse_instagram_shortcode(url) is not None


def canonical_instagram_url(url: str) -> str | None:
    code = parse_instagram_shortcode(url)
    if not code:
        return None
    return f"https://www.instagram.com/p/{code}"
