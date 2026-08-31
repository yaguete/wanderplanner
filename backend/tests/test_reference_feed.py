"""Mapeo WP, respaldo RSS, denylist y tope de GET /sources/reference-feed."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from blog_landings import get_blog_landing_by_host
from inspirational_source import host_is_feedable
from reference_feed import (
    FeedItem,
    WP_FEED_FIELDS,
    clear_reference_feed_runtime_state,
    featured_media_url,
    map_wp_post_to_item,
    mark_instant,
    normalize_feed_host,
    parse_feed_bytes,
    parse_wp_gmt,
    select_wp_feed_items,
    slug_from_url,
    sources_reference_feed,
    wp_latest_posts_url,
)
from source_suggest import url_has_junk_path


def _fresh_iso(days: int = 1) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def setup_function() -> None:
    clear_reference_feed_runtime_state()


def test_normalize_feed_host_strips_www_and_scheme():
    assert normalize_feed_host("https://www.lacosmopolilla.com/ruta/") == "lacosmopolilla.com"
    assert normalize_feed_host("SINMAPA.net") == "sinmapa.net"
    assert normalize_feed_host("not a host") is None
    assert normalize_feed_host("localhost") is None
    assert normalize_feed_host("169.254.169.254") == "169.254.169.254"


def test_host_is_feedable_rejects_otas_and_instagram():
    assert host_is_feedable("lacosmopolilla.com") is True
    assert host_is_feedable("sinmapa.net") is True
    assert host_is_feedable("booking.com") is False
    assert host_is_feedable("instagram.com") is False
    assert host_is_feedable("exteriores.gob.es") is False


def test_catalog_host_lookup():
    blog = get_blog_landing_by_host("www.lacosmopolilla.com")
    assert blog is not None
    assert blog.slug == "lacosmopolilla"
    assert get_blog_landing_by_host("sinmapa.net") is None


def test_wp_latest_url_includes_embed_fields():
    url = wp_latest_posts_url("sinmapa.net")
    assert "_embed=wp%3Afeaturedmedia" in url or "_embed=wp:featuredmedia" in url
    assert "_links" in WP_FEED_FIELDS
    assert "_embedded" in WP_FEED_FIELDS
    assert "date_gmt" in WP_FEED_FIELDS


def test_featured_media_prefers_medium_then_source():
    post = {
        "_embedded": {
            "wp:featuredmedia": [
                {
                    "source_url": "https://cdn.example/full.jpg",
                    "media_details": {
                        "sizes": {
                            "medium": {"source_url": "https://cdn.example/medium.jpg"},
                            "full": {"source_url": "https://cdn.example/full.jpg"},
                        }
                    },
                }
            ]
        }
    }
    assert featured_media_url(post) == "https://cdn.example/medium.jpg"
    assert featured_media_url({"jetpack_featured_media_url": "https://i0.wp.com/x.jpg"}) == (
        "https://i0.wp.com/x.jpg"
    )
    assert featured_media_url({"_embedded": {}}) is None
    assert featured_media_url({}) is None


def _wp_post(
    slug: str,
    *,
    date_gmt: str = "2026-08-15T10:00:00",
    categories: list[int] | None = None,
    embed: bool = True,
) -> dict:
    post: dict = {
        "slug": slug,
        "link": f"https://sinmapa.net/{slug}/",
        "title": {"rendered": slug.replace("-", " ")},
        "date_gmt": date_gmt,
        "categories": categories or [1],
    }
    if embed:
        post["_embedded"] = {
            "wp:featuredmedia": [{"source_url": f"https://cdn.example/{slug}.jpg"}]
        }
    return post


def test_map_wp_drops_denied_slug_and_junk_path():
    item = map_wp_post_to_item(_wp_post("ruta-islandia-en-10-dias"), "sinmapa.net")
    assert item is not None
    assert item.published_at == "2026-08-15T10:00:00Z"
    assert item.image_url == "https://cdn.example/ruta-islandia-en-10-dias.jpg"

    assert map_wp_post_to_item(_wp_post("opiniones-heymondo-seguros-de-viaje"), "sinmapa.net") is None
    junk = _wp_post("islandia")
    junk["link"] = "https://sinmapa.net/category/islandia/"
    assert map_wp_post_to_item(junk, "sinmapa.net") is None
    assert url_has_junk_path("https://sinmapa.net/tag/japon/") is True


def test_select_caps_at_five_and_excludes_catalog_categories():
    posts = [_wp_post(f"guia-{i}") for i in range(8)]
    posts.insert(0, _wp_post("playlist-verano", categories=[3787]))
    kept = select_wp_feed_items(posts, "lacosmopolilla.com", (3787,), limit=5)
    assert len(kept) == 5
    assert all(not item.url.endswith("playlist-verano/") for item in kept)


def test_parse_wp_gmt_naive_is_utc():
    assert parse_wp_gmt("2026-08-15T10:00:00") == "2026-08-15T10:00:00Z"
    assert parse_wp_gmt("2026-08-15T10:00:00+02:00") == "2026-08-15T08:00:00Z"


def test_rss_fallback_parses_title_date_and_media():
    xml = b"""<?xml version="1.0"?>
    <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
      <channel>
        <item>
          <title>Ruta por Islandia</title>
          <link>https://sinmapa.net/ruta-islandia/</link>
          <pubDate>Fri, 15 Aug 2026 10:00:00 +0000</pubDate>
          <media:thumbnail url="https://cdn.example/islandia.jpg"/>
        </item>
        <item>
          <title>Seguro de viaje</title>
          <link>https://sinmapa.net/seguro-para-viajar-a-islandia/</link>
          <pubDate>Thu, 14 Aug 2026 10:00:00 +0000</pubDate>
        </item>
        <item>
          <title>Archivo</title>
          <link>https://sinmapa.net/category/islandia/</link>
        </item>
      </channel>
    </rss>
    """
    items = parse_feed_bytes(xml, "sinmapa.net")
    assert len(items) == 1
    assert items[0].title == "Ruta por Islandia"
    assert items[0].published_at == "2026-08-15T10:00:00Z"
    assert items[0].image_url == "https://cdn.example/islandia.jpg"


def test_slug_from_url():
    assert slug_from_url("https://sinmapa.net/ruta-islandia/") == "ruta-islandia"
    assert slug_from_url("https://sinmapa.net/") == ""


def test_mark_instant_from_extraction_cache():
    items = [
        FeedItem(url="https://sinmapa.net/ruta-islandia/", title="Islandia", published_at=None),
        FeedItem(url="https://sinmapa.net/otra/", title="Otra", published_at=None),
    ]
    rows = [
        {
            "url": "https://sinmapa.net/ruta-islandia/",
            "canonical_url": None,
            "validated_at": _fresh_iso(1),
        }
    ]
    marked = mark_instant(items, rows)
    assert marked[0].instant is True
    assert marked[1].instant is False


@pytest.mark.asyncio
async def test_endpoint_rejects_non_blog_without_fetch():
    request = type("Req", (), {"headers": {}, "client": None})()
    with patch("reference_feed.load_feed_items", new_callable=AsyncMock) as fetch:
        payload = await sources_reference_feed(request, domain="booking.com")
    fetch.assert_not_called()
    assert payload.items == []
    assert payload.reason == "not_blog"


@pytest.mark.asyncio
async def test_endpoint_ssrf_returns_empty_not_500():
    request = type("Req", (), {"headers": {}, "client": None})()
    with (
        patch("reference_feed.allow_reference_feed_ip", return_value=True),
        patch("reference_feed.list_extraction_metas", new_callable=AsyncMock, return_value=[]),
        patch("reference_feed.fetch_wp_latest", new_callable=AsyncMock, return_value=None),
        patch("reference_feed.fetch_rss_items", new_callable=AsyncMock, return_value=[]),
    ):
        payload = await sources_reference_feed(request, domain="lacosmopolilla.com")
    assert payload.items == []
    assert payload.reason in {"unavailable", "empty"}


@pytest.mark.asyncio
async def test_endpoint_returns_wp_items():
    request = type("Req", (), {"headers": {}, "client": None})()
    posts = [_wp_post("ruta-japon-20-dias")]
    with (
        patch("reference_feed.allow_reference_feed_ip", return_value=True),
        patch("reference_feed.fetch_wp_latest", new_callable=AsyncMock, return_value=posts),
        patch("reference_feed.list_extraction_metas", new_callable=AsyncMock, return_value=[]),
    ):
        payload = await sources_reference_feed(request, domain="sinmapa.net")
    assert len(payload.items) == 1
    assert payload.items[0].title == "ruta japon 20 dias"
    assert payload.reason is None
