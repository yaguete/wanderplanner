"""Mapeo WP, respaldo RSS, denylist y tope de GET /sources/reference-feed."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from blog_landings import get_blog_landing_by_host
from inspirational_source import host_is_feedable
from reference_feed import (
    FAILURE_CACHE_TTL_SEC,
    MAX_BODY_BYTES,
    SITEMAP_TAIL_BYTES,
    FeedItem,
    FeedResponse,
    MAX_SEARCH_HOSTS,
    WP_FEED_FIELDS,
    WP_SEARCH_FIELDS,
    clear_reference_feed_runtime_state,
    featured_media_url,
    fetch_wp_latest,
    fetch_wp_search_posts,
    get_cached_feed,
    is_bot_challenge,
    load_feed_items,
    map_sitemap_entries_to_items,
    map_wp_post_to_item,
    mark_instant,
    merge_ranked_feed_items,
    normalize_feed_host,
    parse_feed_bytes,
    parse_search_hosts,
    parse_sitemap_index,
    parse_sitemap_url_entries,
    parse_wp_gmt,
    pick_post_sitemap,
    select_search_items,
    select_wp_feed_items,
    set_cached_feed,
    sitemap_tail_matches_index,
    slug_from_url,
    sources_reference_feed,
    sources_reference_search,
    title_from_slug,
    wp_latest_posts_rest_route_url,
    wp_latest_posts_url,
    wp_search_posts_url,
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
    assert item.host == "sinmapa.net"

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
            "og_title": "Ruta por Islandia",
            "destination": "Islandia",
            "total_days": 10,
        }
    ]
    marked = mark_instant(items, rows)
    assert marked[0].instant is True
    assert marked[0].title == "Ruta por Islandia"
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
        patch("reference_feed.fetch_sitemap_items", new_callable=AsyncMock, return_value=[]),
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


def test_parse_search_hosts_skips_otas_dedupes_and_caps():
    assert MAX_SEARCH_HOSTS == 8
    hosts = parse_search_hosts(
        [
            "https://www.lacosmopolilla.com/ruta/",
            "booking.com",
            "SINMAPA.net",
            "lacosmopolilla.com",
            "instagram.com",
            *[f"blog{i}.com" for i in range(10)],
        ]
    )
    assert hosts[0] == "lacosmopolilla.com"
    assert hosts[1] == "sinmapa.net"
    assert "booking.com" not in hosts
    assert "instagram.com" not in hosts
    assert len(hosts) == MAX_SEARCH_HOSTS


def test_wp_search_url_title_only_and_dates():
    url = wp_search_posts_url("sinmapa.net", "islandia", title_only=True)
    assert "search=islandia" in url
    assert "search_columns=post_title" in url
    assert "date_gmt" in WP_SEARCH_FIELDS
    wide = wp_search_posts_url("sinmapa.net", "islandia", title_only=False)
    assert "search_columns" not in wide


def test_select_search_ranks_slug_over_title_and_drops_denied():
    posts = [
        _wp_post("opiniones-heymondo-seguros-de-viaje"),
        _wp_post("verano-en-el-norte", date_gmt="2026-08-01T10:00:00"),
        _wp_post("ruta-islandia-en-10-dias"),
    ]
    posts[1]["title"] = {"rendered": "Qué ver en Islandia"}
    ranked = select_search_items(posts, "islandia", "sinmapa.net", (), limit=4)
    assert [item.url for _, item in ranked] == [
        "https://sinmapa.net/ruta-islandia-en-10-dias/",
        "https://sinmapa.net/verano-en-el-norte/",
    ]
    assert ranked[0][0] == 0
    assert ranked[1][0] == 1


def test_merge_ranked_feed_items_caps_and_dedupes():
    a = FeedItem(url="https://a.com/ruta-islandia/", title="Otra", host="a.com")
    b = FeedItem(url="https://b.com/verano/", title="Islandia en verano", host="b.com")
    dup = FeedItem(url="https://a.com/ruta-islandia/", title="Dup", host="a.com")
    c = FeedItem(url="https://c.com/filler/", title="Filler", host="c.com")
    merged = merge_ranked_feed_items(
        [[(0, a), (2, dup)], [(1, b)], [(2, c)]],
        limit=2,
    )
    assert [item.url for item in merged] == [a.url, b.url]


@pytest.mark.asyncio
async def test_search_short_query_400():
    request = type("Req", (), {"headers": {}, "client": None})()
    with pytest.raises(HTTPException) as exc:
        await sources_reference_search(request, q="ab", domain=["sinmapa.net"])
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_search_skips_non_blogs_without_fetch():
    request = type("Req", (), {"headers": {}, "client": None})()
    with patch("reference_feed.search_one_host", new_callable=AsyncMock) as fetch:
        payload = await sources_reference_search(
            request, q="islandia", domain=["booking.com", "instagram.com"]
        )
    fetch.assert_not_called()
    assert payload.items == []


@pytest.mark.asyncio
async def test_search_merges_hosts_and_survives_one_failure():
    request = type("Req", (), {"headers": {}, "client": None})()

    async def fake_fetch(host: str, query: str, *, title_only: bool):
        assert query == "islandia"
        if host == "sinmapa.net":
            raise RuntimeError("boom")
        if host == "lacosmopolilla.com":
            return [
                {
                    "slug": "ruta-islandia-en-10-dias",
                    "link": "https://lacosmopolilla.com/ruta-islandia-en-10-dias/",
                    "title": {"rendered": "Ruta por Islandia en 10 días"},
                    "date_gmt": "2026-08-01T10:00:00",
                    "categories": [26],
                }
            ]
        return []

    with (
        patch("reference_feed.allow_reference_search_ip", return_value=True),
        patch("reference_feed.fetch_wp_search_posts", new_callable=AsyncMock, side_effect=fake_fetch),
        patch("reference_feed.list_extraction_metas", new_callable=AsyncMock, return_value=[]),
    ):
        payload = await sources_reference_search(
            request,
            q="islandia",
            domain=["booking.com", "lacosmopolilla.com", "sinmapa.net"],
        )
    assert [item.url for item in payload.items] == [
        "https://lacosmopolilla.com/ruta-islandia-en-10-dias/"
    ]
    assert payload.items[0].host == "lacosmopolilla.com"


@pytest.mark.asyncio
async def test_search_429_when_ip_exhausted():
    request = type("Req", (), {"headers": {}, "client": None})()
    with (
        patch("reference_feed.allow_reference_search_ip", return_value=False),
        patch("reference_feed.search_one_host", new_callable=AsyncMock) as fetch,
    ):
        with pytest.raises(HTTPException) as exc:
            await sources_reference_search(
                request, q="islandia", domain=["sinmapa.net"]
            )
    assert exc.value.status_code == 429
    fetch.assert_not_called()


def test_siteground_captcha_is_a_bot_challenge():
    html = b'<html><head><meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=%2Fwp-json"></head></html>'
    assert is_bot_challenge(202, html) is True
    assert is_bot_challenge(200, html) is True
    assert is_bot_challenge(200, b'[{"id":1}]') is False
    assert FAILURE_CACHE_TTL_SEC == 120


def test_empty_feed_cache_expires_faster_than_hits():
    from time import monotonic as real_mono

    clear_reference_feed_runtime_state()
    t0 = real_mono()
    empty = FeedResponse(host="losviajesdeclaudia.com", items=[], reason="unavailable")
    set_cached_feed("losviajesdeclaudia.com", empty)
    with patch("reference_feed.monotonic", return_value=t0 + FAILURE_CACHE_TTL_SEC + 1):
        assert get_cached_feed("losviajesdeclaudia.com") is None

    hit = FeedResponse(
        host="sinmapa.net",
        items=[FeedItem(url="https://sinmapa.net/ruta/", title="Ruta", host="sinmapa.net")],
    )
    set_cached_feed("sinmapa.net", hit)
    with patch("reference_feed.monotonic", return_value=t0 + FAILURE_CACHE_TTL_SEC + 1):
        cached = get_cached_feed("sinmapa.net")
    assert cached is not None
    assert len(cached.items) == 1


def test_bot_challenge_scans_eight_kb():
    near = b"x" * 3000 + b"sgcaptcha"
    assert is_bot_challenge(200, near) is True
    far = b"x" * 9000 + b"sgcaptcha"
    assert is_bot_challenge(200, far) is False


def test_cookie_banner_in_large_article_is_not_a_challenge():
    marker = b"<noscript>enable javascript and cookies</noscript>"
    body = marker + (b"viaje " * 40_000)
    assert len(body) > 50_000
    assert is_bot_challenge(200, body) is False


def test_title_from_slug():
    assert title_from_slug("que-ver-en-edimburgo-que-hacer").startswith("Que ver")


def test_parse_yoast_index_picks_latest_post_sitemap():
    xml = b"""<?xml version="1.0"?>
    <sitemapindex>
      <sitemap>
        <loc>https://sinmapa.net/page-sitemap.xml</loc>
        <lastmod>2026-09-06</lastmod>
      </sitemap>
      <sitemap>
        <loc>https://sinmapa.net/post-sitemap.xml</loc>
        <lastmod>2026-09-06T12:00:00+00:00</lastmod>
      </sitemap>
      <sitemap>
        <loc>https://sinmapa.net/post-sitemap2.xml</loc>
        <lastmod>2025-01-01</lastmod>
      </sitemap>
    </sitemapindex>
    """
    picked = pick_post_sitemap(parse_sitemap_index(xml))
    assert picked is not None
    assert picked[0].endswith("/post-sitemap.xml")


def test_sitemap_image_loc_and_slug_title():
    xml = (
        b"<urlset>"
        b"<url><loc>https://sinmapa.net/que-ver-en-edimburgo-que-hacer/</loc>"
        b"<lastmod>2026-09-06</lastmod>"
        b"<image:image><image:loc>https://cdn.example/edi.jpg</image:loc></image:image>"
        b"</url></urlset>"
    )
    entries = parse_sitemap_url_entries(xml)
    items = map_sitemap_entries_to_items(entries, "sinmapa.net")
    assert len(items) == 1
    assert items[0].image_url == "https://cdn.example/edi.jpg"
    assert "edimburgo" in items[0].title.lower()


def test_sitemap_tail_over_max_body_keeps_latest():
    old = (
        b"<url><loc>https://sinmapa.net/old-post-with-a-long-slug-xxxxxxxx/</loc>"
        b"<lastmod>2018-01-01T00:00:00+00:00</lastmod></url>"
    )
    newest = (
        b"<url><loc>https://sinmapa.net/que-ver-en-edimburgo-que-hacer/</loc>"
        b"<lastmod>2026-09-06T10:00:00+00:00</lastmod>"
        b"<image:image><image:loc>https://cdn.example/edi.jpg</image:loc></image:image>"
        b"</url>"
    )
    body = b"<urlset>" + old * 5000 + newest + b"</urlset>"
    assert len(body) > MAX_BODY_BYTES
    tail = body[-SITEMAP_TAIL_BYTES:]
    assert len(tail) == SITEMAP_TAIL_BYTES
    entries = parse_sitemap_url_entries(tail)
    items = map_sitemap_entries_to_items(entries, "sinmapa.net")
    assert any("edimburgo" in item.url for item in items)
    assert sitemap_tail_matches_index("2026-09-06T10:00:00+00:00", entries) is True


def test_unordered_sitemap_tail_does_not_match_index():
    entries = parse_sitemap_url_entries(
        b"<url><loc>https://sinmapa.net/old/</loc><lastmod>2018-01-01</lastmod></url>"
    )
    assert sitemap_tail_matches_index("2026-09-06", entries) is False


@pytest.mark.asyncio
async def test_load_feed_wp_ok_skips_rss_and_sitemap():
    posts = [_wp_post("ruta-japon-20-dias")]
    with (
        patch("reference_feed.fetch_wp_latest", new_callable=AsyncMock, return_value=posts),
        patch("reference_feed.fetch_rss_items", new_callable=AsyncMock) as rss,
        patch("reference_feed.fetch_sitemap_items", new_callable=AsyncMock) as sm,
    ):
        items, origin = await load_feed_items("sinmapa.net")
    assert origin == "wp"
    assert len(items) == 1
    rss.assert_not_called()
    sm.assert_not_called()


@pytest.mark.asyncio
async def test_load_feed_rest_route_after_wp_json_challenge():
    posts = [_wp_post("ruta-japon-20-dias")]

    async def fake_get(url: str, accept: str):
        if "/wp-json/" in url:
            return 202, b"<html>sgcaptcha</html>"
        if "rest_route=" in url:
            import json

            return 200, json.dumps(posts).encode()
        return 404, b""

    with (
        patch("reference_feed._http_get", side_effect=fake_get),
        patch("reference_feed.fetch_rss_items", new_callable=AsyncMock) as rss,
        patch("reference_feed.fetch_sitemap_items", new_callable=AsyncMock) as sm,
    ):
        items, origin = await load_feed_items("sinmapa.net")
    assert origin == "wp"
    assert len(items) == 1
    rss.assert_not_called()
    sm.assert_not_called()
    assert "rest_route=" in wp_latest_posts_rest_route_url("sinmapa.net")


@pytest.mark.asyncio
async def test_load_feed_sitemap_when_rest_and_rss_empty():
    index = b"""<?xml version="1.0"?>
    <sitemapindex>
      <sitemap>
        <loc>https://sinmapa.net/post-sitemap.xml</loc>
        <lastmod>2026-09-06T10:00:00+00:00</lastmod>
      </sitemap>
    </sitemapindex>
    """
    tail = (
        b"<urlset><url>"
        b"<loc>https://sinmapa.net/que-ver-en-edimburgo-que-hacer/</loc>"
        b"<lastmod>2026-09-06T10:00:00+00:00</lastmod>"
        b"<image:image><image:loc>https://cdn.example/edi.jpg</image:loc></image:image>"
        b"</url></urlset>"
    )

    async def fake_get(url: str, accept: str):
        if url.endswith("/sitemap_index.xml"):
            return 200, index
        return None

    with (
        patch("reference_feed.fetch_wp_latest", new_callable=AsyncMock, return_value=None),
        patch("reference_feed.fetch_rss_items", new_callable=AsyncMock, return_value=[]),
        patch("reference_feed._http_get", side_effect=fake_get),
        patch("reference_feed._http_get_sitemap_tail", new_callable=AsyncMock, return_value=tail),
        patch("reference_feed._http_get_sitemap_full", new_callable=AsyncMock) as full,
    ):
        items, origin = await load_feed_items("sinmapa.net")
    assert origin == "sitemap"
    assert len(items) == 1
    assert items[0].image_url == "https://cdn.example/edi.jpg"
    full.assert_not_called()


@pytest.mark.asyncio
async def test_sitemap_unordered_triggers_full_pass():
    index = b"""<?xml version="1.0"?>
    <sitemapindex>
      <sitemap>
        <loc>https://sinmapa.net/post-sitemap.xml</loc>
        <lastmod>2026-09-06</lastmod>
      </sitemap>
    </sitemapindex>
    """
    stale_tail = (
        b"<url><loc>https://sinmapa.net/old-post/</loc>"
        b"<lastmod>2018-01-01</lastmod></url>"
    )
    full_body = (
        b"<urlset>"
        + stale_tail
        + b"<url><loc>https://sinmapa.net/que-ver-en-edimburgo-que-hacer/</loc>"
        b"<lastmod>2026-09-06</lastmod></url></urlset>"
    )

    async def fake_get(url: str, accept: str):
        if url.endswith("/sitemap_index.xml"):
            return 200, index
        return None

    with (
        patch("reference_feed._http_get", side_effect=fake_get),
        patch(
            "reference_feed._http_get_sitemap_tail",
            new_callable=AsyncMock,
            return_value=stale_tail,
        ),
        patch(
            "reference_feed._http_get_sitemap_full",
            new_callable=AsyncMock,
            return_value=full_body,
        ) as full,
    ):
        from reference_feed import fetch_sitemap_items

        items = await fetch_sitemap_items("sinmapa.net")
    full.assert_awaited()
    assert any("edimburgo" in item.url for item in items)


def test_pick_native_wp_sitemap_posts():
    xml = b"""<?xml version="1.0"?>
    <sitemapindex>
      <sitemap>
        <loc>https://sinmapa.net/wp-sitemap-posts-post-1.xml</loc>
        <lastmod>2026-09-06</lastmod>
      </sitemap>
      <sitemap>
        <loc>https://sinmapa.net/wp-sitemap-posts-page-1.xml</loc>
        <lastmod>2026-09-06</lastmod>
      </sitemap>
    </sitemapindex>
    """
    picked = pick_post_sitemap(parse_sitemap_index(xml))
    assert picked is not None
    assert "wp-sitemap-posts-post-1" in picked[0]


@pytest.mark.asyncio
async def test_fetch_wp_latest_404_does_not_try_rest_route():
    calls: list[str] = []

    async def fake_get(url: str, accept: str):
        calls.append(url)
        return 404, b"nope"

    with patch("reference_feed._http_get", side_effect=fake_get):
        posts = await fetch_wp_latest("sinmapa.net")
    assert posts is None
    assert len(calls) == 1
    assert "/wp-json/" in calls[0]
    assert "rest_route=" not in calls[0]


@pytest.mark.asyncio
async def test_fetch_wp_search_404_does_not_try_rest_route():
    calls: list[str] = []

    async def fake_get(url: str, accept: str):
        calls.append(url)
        return 404, b"nope"

    with patch("reference_feed._http_get", side_effect=fake_get):
        posts = await fetch_wp_search_posts("sinmapa.net", "islandia", title_only=True)
    assert posts is None
    assert len(calls) == 1
    assert "/wp-json/" in calls[0]
    assert "rest_route=" not in calls[0]

