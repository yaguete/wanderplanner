"""Pruebas de la política SWR de POST /itinerary (sin Claude real)."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from article_fetch import CONTENT_VERSION, ArticleFetchResult, content_hash
from extraction_cache import CacheEntry, classify_freshness
import main as main_mod


def _payload() -> dict:
    return {
        "title": "Austria",
        "area": "Austria",
        "author": "cosmo",
        "days": [],
        "basics": [],
        "article_html": "<p>old</p>",
        "og_image": None,
    }


def _entry(*, age_days: int = 1, **overrides) -> CacheEntry:
    now = datetime.now(timezone.utc)
    validated = now - timedelta(days=age_days)
    entry = CacheEntry(
        url="https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias/",
        canonical_url="https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias",
        payload=_payload(),
        fetched_at=validated,
        validated_at=validated,
        etag='"v1"',
        last_modified="Fri, 01 Aug 2026 10:00:00 GMT",
        article_modified_at=datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc),
        content_hash=content_hash("texto estable"),
        content_version=CONTENT_VERSION,
        freshness="fresh",
    )
    for k, v in overrides.items():
        setattr(entry, k, v)
    entry.freshness = classify_freshness(entry.validated_at)
    return entry


async def _collect_sse(agen):
    events = []
    async for chunk in agen:
        events.append(chunk)
    return "".join(events)


@pytest.mark.asyncio
async def test_fresh_hit_serves_cache_without_fetch():
    entry = _entry(age_days=1)
    with patch.object(main_mod, "fetch_article", new=AsyncMock()) as fetch:
        with patch.object(main_mod, "revalidate_in_background", new=AsyncMock()) as reval:
            body = await _collect_sse(
                main_mod._stream_itinerary(
                    entry.url, entry=entry, user=None, refresh=False
                )
            )
    assert "event: result" in body
    assert "Austria" in body
    fetch.assert_not_called()
    reval.assert_not_called()


@pytest.mark.asyncio
async def test_stale_hit_gets_and_skips_claude_when_hash_matches():
    entry = _entry(age_days=3)
    assert entry.freshness == "stale"
    fetched = ArticleFetchResult(
        plain_text="texto estable",
        cleaned_html="<p>x</p>",
        article_modified_at=entry.article_modified_at,
        content_hash=entry.content_hash,
        content_version=CONTENT_VERSION,
    )
    scheduled = []

    def fake_spawn(coro):
        scheduled.append(coro)
        coro.close()

    with patch.object(main_mod, "fetch_article", new=AsyncMock(return_value=fetched)) as fetch:
        with patch.object(main_mod, "_spawn_background", side_effect=fake_spawn):
            with patch.object(main_mod, "touch_validation", new=AsyncMock()) as touch:
                with patch.object(main_mod, "call_claude") as claude:
                    body = await _collect_sse(
                        main_mod._stream_itinerary(
                            entry.url, entry=entry, user=None, refresh=False
                        )
                    )
    assert "event: result" in body
    assert "Austria" in body
    fetch.assert_awaited()
    claude.assert_not_called()
    touch.assert_awaited()
    assert scheduled == []


@pytest.mark.asyncio
async def test_stale_hit_redistills_when_hash_changes():
    entry = _entry(age_days=3)
    fetched = ArticleFetchResult(
        plain_text="guía de 15 lugares",
        cleaned_html="<p>nuevo</p>",
        article_modified_at=entry.article_modified_at,
        content_hash=content_hash("guía de 15 lugares"),
        content_version=CONTENT_VERSION,
    )
    new_itinerary = {"title": "Costa Rica v2", "days": [], "basics": []}
    with patch.object(main_mod, "fetch_article", new=AsyncMock(return_value=fetched)):
        with patch.object(
            main_mod, "call_claude", return_value=(new_itinerary, 10, 20)
        ) as claude:
            with patch.object(main_mod, "enforce_usage", new=AsyncMock()):
                with patch.object(main_mod, "store_extraction", new=AsyncMock()) as store:
                    with patch.object(main_mod, "record_event", new=AsyncMock()):
                        body = await _collect_sse(
                            main_mod._stream_itinerary(
                                entry.url, entry=entry, user=None, refresh=False
                            )
                        )
    assert "Costa Rica v2" in body
    assert claude.call_count == 1
    store.assert_awaited()


@pytest.mark.asyncio
async def test_stale_fetch_error_keeps_cache():
    entry = _entry(age_days=3)
    with patch.object(
        main_mod, "fetch_article", new=AsyncMock(side_effect=RuntimeError("404"))
    ):
        with patch.object(main_mod, "call_claude") as claude:
            with patch.object(main_mod, "store_extraction", new=AsyncMock()) as store:
                body = await _collect_sse(
                    main_mod._stream_itinerary(
                        entry.url, entry=entry, user=None, refresh=False
                    )
                )
    assert "Austria" in body
    claude.assert_not_called()
    store.assert_not_awaited()


@pytest.mark.asyncio
async def test_idle_ten_days_gets_on_first_request():
    entry = _entry(age_days=10)
    assert entry.freshness == "stale"
    fetched = ArticleFetchResult(
        plain_text="texto estable",
        cleaned_html="<p>x</p>",
        content_hash=entry.content_hash,
        content_version=CONTENT_VERSION,
    )
    with patch.object(main_mod, "fetch_article", new=AsyncMock(return_value=fetched)) as fetch:
        with patch.object(main_mod, "touch_validation", new=AsyncMock()):
            with patch.object(main_mod, "call_claude") as claude:
                await _collect_sse(
                    main_mod._stream_itinerary(
                        entry.url, entry=entry, user=None, refresh=False
                    )
                )
    fetch.assert_awaited()
    claude.assert_not_called()


@pytest.mark.asyncio
async def test_same_date_different_hash_redistills():
    entry = _entry(age_days=1)
    fetched = ArticleFetchResult(
        plain_text="el post cambió y Yoast no movió dateModified",
        cleaned_html="<p>nuevo</p>",
        article_modified_at=entry.article_modified_at,
        content_hash=content_hash("el post cambió y Yoast no movió dateModified"),
        content_version=CONTENT_VERSION,
    )
    new_itinerary = {"title": "15 lugares", "days": [], "basics": []}
    with patch.object(main_mod, "fetch_article", new=AsyncMock(return_value=fetched)):
        with patch.object(
            main_mod, "call_claude", return_value=(new_itinerary, 8, 16)
        ) as claude:
            with patch.object(main_mod, "enforce_usage", new=AsyncMock()):
                with patch.object(main_mod, "store_extraction", new=AsyncMock()):
                    with patch.object(main_mod, "record_event", new=AsyncMock()):
                        body = await _collect_sse(
                            main_mod._stream_itinerary(
                                entry.url, entry=entry, user=None, refresh=True
                            )
                        )
    assert "15 lugares" in body
    claude.assert_called_once()


@pytest.mark.asyncio
async def test_newer_date_same_hash_skips_claude():
    entry = _entry(age_days=1)
    fetched = ArticleFetchResult(
        plain_text="texto estable",
        cleaned_html="<p>x</p>",
        article_modified_at=datetime(2026, 8, 23, 12, 0, tzinfo=timezone.utc),
        content_hash=entry.content_hash,
        content_version=CONTENT_VERSION,
    )
    with patch.object(main_mod, "fetch_article", new=AsyncMock(return_value=fetched)):
        with patch.object(main_mod, "touch_validation", new=AsyncMock()):
            with patch.object(main_mod, "call_claude") as claude:
                with patch.object(main_mod, "record_event", new=AsyncMock()):
                    await _collect_sse(
                        main_mod._stream_itinerary(
                            entry.url, entry=entry, user=None, refresh=True
                        )
                    )
    claude.assert_not_called()


@pytest.mark.asyncio
async def test_refresh_unchanged_skips_claude():
    entry = _entry(age_days=1)
    fetched = ArticleFetchResult(
        plain_text="texto estable",
        cleaned_html="<p>nuevo envoltorio</p>",
        og_image=None,
        etag='"v2"',
        last_modified="Sat, 02 Aug 2026 10:00:00 GMT",
        article_modified_at=entry.article_modified_at,
        content_hash=entry.content_hash,
        content_version=CONTENT_VERSION,
    )
    with patch.object(main_mod, "fetch_article", new=AsyncMock(return_value=fetched)):
        with patch.object(main_mod, "touch_validation", new=AsyncMock()) as touch:
            with patch.object(main_mod, "call_claude") as claude:
                with patch.object(main_mod, "record_event", new=AsyncMock()):
                    body = await _collect_sse(
                        main_mod._stream_itinerary(
                            entry.url, entry=entry, user=None, refresh=True
                        )
                    )
    assert "event: result" in body
    claude.assert_not_called()
    touch.assert_awaited()


@pytest.mark.asyncio
async def test_refresh_changed_calls_claude_once():
    entry = _entry(age_days=1)
    fetched = ArticleFetchResult(
        plain_text="texto distinto del artículo",
        cleaned_html="<p>nuevo</p>",
        og_image="https://cdn/x.jpg",
        etag='"v3"',
        last_modified=None,
        article_modified_at=datetime(2026, 8, 3, 12, 0, tzinfo=timezone.utc),
        content_hash=content_hash("texto distinto del artículo"),
        content_version=CONTENT_VERSION,
    )
    new_itinerary = {
        "title": "Austria v2",
        "days": [],
        "basics": [],
    }
    with patch.object(main_mod, "fetch_article", new=AsyncMock(return_value=fetched)):
        with patch.object(
            main_mod, "call_claude", return_value=(new_itinerary, 10, 20)
        ) as claude:
            with patch.object(main_mod, "enforce_usage", new=AsyncMock()):
                with patch.object(main_mod, "store_extraction", new=AsyncMock()) as store:
                    with patch.object(main_mod, "record_event", new=AsyncMock()):
                        body = await _collect_sse(
                            main_mod._stream_itinerary(
                                entry.url, entry=entry, user=None, refresh=True
                            )
                        )
    assert "Austria v2" in body
    assert claude.call_count == 1
    store.assert_awaited()


@pytest.mark.asyncio
async def test_revalidate_not_modified_only_touches():
    entry = _entry(age_days=20)
    fetched = ArticleFetchResult(
        not_modified=True,
        etag='"v1"',
        last_modified=entry.last_modified,
        content_version=CONTENT_VERSION,
    )
    with patch.object(main_mod, "fetch_article", new=AsyncMock(return_value=fetched)):
        with patch.object(main_mod, "touch_validation", new=AsyncMock()) as touch:
            with patch.object(main_mod, "call_claude") as claude:
                with patch.object(main_mod, "record_event", new=AsyncMock()) as record:
                    await main_mod.revalidate_in_background(entry.url, entry)
    touch.assert_awaited()
    claude.assert_not_called()
    record.assert_not_awaited()


@pytest.mark.asyncio
async def test_revalidate_network_error_keeps_payload():
    entry = _entry(age_days=20)
    with patch.object(
        main_mod, "fetch_article", new=AsyncMock(side_effect=RuntimeError("down"))
    ):
        with patch.object(main_mod, "store_extraction", new=AsyncMock()) as store:
            with patch.object(main_mod, "touch_validation", new=AsyncMock()) as touch:
                await main_mod.revalidate_in_background(entry.url, entry)
    store.assert_not_awaited()
    touch.assert_not_awaited()


@pytest.mark.asyncio
async def test_content_version_bump_without_redistill():
    entry = _entry(age_days=20, content_version=CONTENT_VERSION - 1 if CONTENT_VERSION > 0 else 0)
    # Simular versión antigua: mismo hash → no redestilar.
    entry.content_version = 0
    fetched = ArticleFetchResult(
        plain_text="texto estable",
        cleaned_html="<p>x</p>",
        article_modified_at=entry.article_modified_at,
        content_hash=entry.content_hash,
        content_version=CONTENT_VERSION,
        etag='"v1"',
    )
    with patch.object(main_mod, "fetch_article", new=AsyncMock(return_value=fetched)):
        with patch.object(main_mod, "touch_validation", new=AsyncMock()) as touch:
            with patch.object(main_mod, "call_claude") as claude:
                await main_mod.revalidate_in_background(entry.url, entry)
    touch.assert_awaited()
    claude.assert_not_called()


@pytest.mark.asyncio
async def test_single_flight_dedupes_concurrent_distill():
    calls = {"n": 0}

    async def slow_fetch(*_a, **_k):
        calls["n"] += 1
        await asyncio.sleep(0.05)
        return ArticleFetchResult(
            plain_text="solo una vez",
            cleaned_html="<p>x</p>",
            content_hash=content_hash("solo una vez"),
            content_version=CONTENT_VERSION,
        )

    with patch.object(main_mod, "fetch_article", side_effect=slow_fetch):
        with patch.object(
            main_mod, "call_claude", return_value=({"title": "ok", "days": [], "basics": []}, 1, 2)
        ) as claude:
            with patch.object(main_mod, "store_extraction", new=AsyncMock()):
                with patch.object(main_mod, "record_event", new=AsyncMock()):
                    a = asyncio.create_task(main_mod._distill_sync("https://ex.com/a", user=None))
                    b = asyncio.create_task(main_mod._distill_sync("https://ex.com/a", user=None))
                    results = await asyncio.gather(a, b)
    assert results[0]["title"] == "ok"
    assert results[1]["title"] == "ok"
    assert calls["n"] == 1
    assert claude.call_count == 1
