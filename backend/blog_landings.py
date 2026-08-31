"""
Catálogo de landings de blog (`/lacosmopolilla`, …).

El slug es el `ref` del CTA. El host WP está fijado: el proxy nunca
acepta una URL libre (SSRF). Espejo de `frontend/lib/blog-landings.ts`.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BlogLanding:
    slug: str
    host: str
    enabled: bool
    exclude_category_ids: tuple[int, ...]


BLOG_LANDINGS: tuple[BlogLanding, ...] = (
    BlogLanding(
        slug="lacosmopolilla",
        host="lacosmopolilla.com",
        enabled=True,
        exclude_category_ids=(
            41,  # consejos-viajeros
            44,  # sorteos
            3787,  # playlist
            2771,  # podcast
            43,  # mis-listas
            8,  # videos
            45,  # viajar-y-comer
            1,  # sin-categoria
        ),
    ),
)

_BY_SLUG = {blog.slug: blog for blog in BLOG_LANDINGS}
_BY_HOST = {
    blog.host.lower().removeprefix("www."): blog for blog in BLOG_LANDINGS
}


def get_blog_landing(slug: str) -> BlogLanding | None:
    key = (slug or "").strip().lower()
    return _BY_SLUG.get(key)


def get_blog_landing_by_host(host: str) -> BlogLanding | None:
    key = (host or "").strip().lower().removeprefix("www.")
    return _BY_HOST.get(key)
