"""
Detección de retos anti-bot (SiteGround, Cloudflare) y helpers WP compartidos.

Lo importan `article_fetch` y `reference_feed`. No importar esos módulos aquí:
`reference_feed → extraction_cache → article_fetch` formaría un ciclo.
"""

from __future__ import annotations

from typing import Any

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

_CHALLENGE_MARKERS = (
    b"sgcaptcha",
    b"just a moment",
    b"checking your browser",
    b"enable javascript and cookies",
)

# Los marcadores de reto a menudo van en un <script> del final, no en el <head>.
_CHALLENGE_SCAN_BYTES = 8192
# Una página de reto son KB. Un artículo real con un banner de cookies en
# <noscript> pasa de este tope y no se confunde con un WAF.
_CHALLENGE_MAX_BODY = 50_000


def browser_headers(accept: str) -> dict[str, str]:
    """UA de Chrome + Accept/idioma. Sin Accept-Encoding: httpx pone gzip, deflate."""
    return {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept": accept,
        "Accept-Language": "es-ES,es;q=0.9",
    }


def is_bot_challenge(status: int, body: bytes) -> bool:
    if status in {202, 403, 429}:
        return True
    raw = body or b""
    if len(raw) > _CHALLENGE_MAX_BODY:
        return False
    head = raw[:_CHALLENGE_SCAN_BYTES].lower()
    return any(marker in head for marker in _CHALLENGE_MARKERS)


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
