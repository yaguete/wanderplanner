"""Filtro, ranking y host fijado de GET /sources/blog-suggest."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from starlette.responses import Response

import blog_suggest as mod
from blog_landings import get_blog_landing
from blog_suggest import (
    apply_instant_from_cache,
    is_denied_guide_slug,
    select_blog_hits,
    sources_blog_suggest,
    strip_html,
    wp_posts_url,
)
from source_suggest import SuggestHit, clear_suggest_runtime_state


def _fresh_iso(days: int = 1) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def test_catalog_lacosmopolilla_slug_is_ref():
    blog = get_blog_landing("lacosmopolilla")
    assert blog is not None
    assert blog.host == "lacosmopolilla.com"
    assert blog.enabled is True
    assert get_blog_landing("no-existe") is None


def test_denied_slugs():
    drop = [
        "opiniones-heymondo-seguros-de-viaje",
        "descuento-en-heymondo-seguros",
        "seguro-para-viajar-a-islandia-cual-elijo",
        "mejor-seguro-de-viaje-para-republica-checa",
        "internet-en-japon-la-mejor-esim",
        "internet-en-canada",
    ]
    keep = [
        "ruta-islandia-en-10-dias",
        "es-seguro-viajar-a-sudafrica",
        "que-ver-en-el-norte-de-islandia",
    ]
    for slug in drop:
        assert is_denied_guide_slug(slug), slug
    for slug in keep:
        assert not is_denied_guide_slug(slug), slug


def test_strip_html_decodes_entities():
    assert strip_html("Guía y Consejos clave (2026) &#x2b50;") == "Guía y Consejos clave (2026) ⭐"
    assert strip_html("<p>Islandia es fuego [&hellip;]</p>\n") == "Islandia es fuego …"


def _post(slug: str, categories: list[int] | None = None, title: str | None = None) -> dict:
    return {
        "slug": slug,
        "link": f"https://lacosmopolilla.com/{slug}/",
        "title": {"rendered": title or slug.replace("-", " ")},
        "excerpt": {"rendered": f"<p>Extracto de {slug}</p>"},
        "categories": categories or [26],
    }


def test_select_drops_affiliates_keeps_guides():
    blog = get_blog_landing("lacosmopolilla")
    assert blog is not None
    posts = [
        _post("opiniones-heymondo-seguros-de-viaje", [41, 39]),
        _post("seguro-para-viajar-a-islandia-cual-elijo", [26, 33]),
        _post("internet-en-japon-la-mejor-esim", [2, 41, 2949]),
        _post("libres-y-felices-mujeres-que-viajan-solas", [41]),
        _post("ruta-islandia-en-10-dias", title="Ruta por Islandia en 10 días"),
        _post("es-seguro-viajar-a-sudafrica", title="¿Es seguro viajar a Sudáfrica?"),
        _post("que-ver-en-el-norte-de-islandia", title="Qué ver en el norte de Islandia"),
    ]
    hits = select_blog_hits(posts, "islandia", blog.host, blog.exclude_category_ids)
    urls = [h.url for h in hits]
    assert not any("heymondo" in u or "seguro-para-viajar" in u or "esim" in u for u in urls)
    assert any("ruta-islandia-en-10-dias" in u for u in urls)
    assert any("que-ver-en-el-norte-de-islandia" in u for u in urls)
    assert not any("libres-y-felices" in u for u in urls)

    sudafrica = select_blog_hits(posts, "sudafrica", blog.host, blog.exclude_category_ids)
    assert any("es-seguro-viajar-a-sudafrica" in h.url for h in sudafrica)


def test_rank_prefers_query_in_slug_with_accents():
    blog = get_blog_landing("lacosmopolilla")
    assert blog is not None
    posts = [
        _post("petra-en-jordania", title="Petra en Jordania"),
        _post("que-ver-en-japon-en-20-dias", title="Qué ver en Japón en 20 días"),
    ]
    hits = select_blog_hits(posts, "japon", blog.host, blog.exclude_category_ids)
    assert "japon" in hits[0].url


def test_wp_url_pins_catalog_host_and_title_search():
    url = wp_posts_url("lacosmopolilla.com", "islandia", title_only=True)
    assert url.startswith("https://lacosmopolilla.com/wp-json/wp/v2/posts?")
    assert "search=islandia" in url
    assert "search_columns=post_title" in url
    assert "evil.example" not in url
    fallback = wp_posts_url("lacosmopolilla.com", "islandia", title_only=False)
    assert "search_columns" not in fallback


def test_emoji_url_survives_normalize():
    from article_fetch import normalize_article_url

    url = (
        "https://lacosmopolilla.com/guia-para-viajar-a-islandia-por-libre-"
        "%e2%ad%90-la-isla-del-hielo-y-el-fuego/"
    )
    assert normalize_article_url(url).startswith("https://lacosmopolilla.com/guia-para-viajar-a-islandia")


def test_apply_instant_marks_cached_extraction():
    url = "https://lacosmopolilla.com/ruta-islandia-en-10-dias/"
    hits = [
        SuggestHit(
            url=url,
            title="Ruta Islandia",
            host="lacosmopolilla.com",
            origin="curated",
            instant=False,
        )
    ]
    rows = [
        {
            "url": url,
            "canonical_url": "https://lacosmopolilla.com/ruta-islandia-en-10-dias",
            "validated_at": _fresh_iso(),
            "og_title": "Ruta Islandia",
            "destination": "Islandia",
            "total_days": 10,
        }
    ]
    marked = apply_instant_from_cache(hits, rows)
    assert marked[0].instant is True
    assert marked[0].origin == "cache"
    assert marked[0].title == "Ruta Islandia"


def test_apply_instant_skips_poisoned_cache_row():
    url = "https://lacosmopolilla.com/ruta-islandia-en-10-dias/"
    hits = [
        SuggestHit(
            url=url,
            title="Ruta Islandia",
            host="lacosmopolilla.com",
            origin="curated",
            instant=False,
        )
    ]
    rows = [
        {
            "url": url,
            "validated_at": _fresh_iso(),
            "og_title": None,
            "destination": None,
            "total_days": None,
        }
    ]
    marked = apply_instant_from_cache(hits, rows)
    assert marked[0].instant is False
    assert marked[0].origin == "curated"


class _Req:
    def __init__(self, ip: str = "203.0.113.9") -> None:
        self.headers = {"x-forwarded-for": ip}
        self.client = None


@pytest.fixture(autouse=True)
def _reset_runtime():
    clear_suggest_runtime_state()
    mod.clear_blog_suggest_runtime_state()
    yield
    clear_suggest_runtime_state()
    mod.clear_blog_suggest_runtime_state()


@pytest.mark.asyncio
async def test_endpoint_unknown_blog_404():
    with pytest.raises(HTTPException) as exc:
        await sources_blog_suggest(
            _Req(),  # type: ignore[arg-type]
            Response(),
            blog="no-existe",
            q="islandia",
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_endpoint_short_query_400():
    with pytest.raises(HTTPException) as exc:
        await sources_blog_suggest(
            _Req(),  # type: ignore[arg-type]
            Response(),
            blog="lacosmopolilla",
            q="ab",
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_endpoint_maps_wp_posts_and_fallback():
    posts = [
        _post("ruta-islandia-en-10-dias", title="Ruta por Islandia en 10 días"),
        _post("seguro-para-viajar-a-islandia-cual-elijo", [26, 33]),
    ]

    async def fake_fetch(host: str, query: str, *, title_only: bool):
        assert host == "lacosmopolilla.com"
        if title_only:
            return []
        return posts

    with (
        patch.object(mod, "fetch_wp_posts", new=fake_fetch),
        patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=[])),
    ):
        resp = await sources_blog_suggest(
            _Req(),  # type: ignore[arg-type]
            Response(),
            blog="lacosmopolilla",
            q="islandia",
        )
    assert len(resp.results) == 1
    assert "ruta-islandia-en-10-dias" in resp.results[0].url
    assert resp.need_captcha is False
