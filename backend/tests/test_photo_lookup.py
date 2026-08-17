"""Tope global durable photo_paid: fail-closed, memo ~60 s, sobrevive a cold start."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from photo_lookup import (
    PHOTO_PAID_MEMO_SEC,
    allow_paid_lookup,
    reset_paid_lookup_memo_for_tests,
)
from usage import count_kind_events, count_kind_events_strict


@pytest.fixture(autouse=True)
def _reset_memo():
    reset_paid_lookup_memo_for_tests()
    yield
    reset_paid_lookup_memo_for_tests()


@pytest.mark.asyncio
async def test_cap_zero_blocks_without_reading(monkeypatch):
    monkeypatch.setenv("MAX_PHOTO_LOOKUPS_DAY", "0")
    count = AsyncMock(return_value=0)
    rec = AsyncMock()
    with patch("photo_lookup.count_kind_events_strict", new=count):
        with patch("photo_lookup.record_event", new=rec):
            assert await allow_paid_lookup() is False
    count.assert_not_awaited()
    rec.assert_not_awaited()


@pytest.mark.asyncio
async def test_below_cap_allows_and_records(monkeypatch):
    monkeypatch.setenv("MAX_PHOTO_LOOKUPS_DAY", "10")
    rec = AsyncMock()
    with patch("photo_lookup.count_kind_events_strict", new=AsyncMock(return_value=3)):
        with patch("photo_lookup.record_event", new=rec):
            assert await allow_paid_lookup() is True
    rec.assert_awaited_once()
    assert rec.await_args.args[:2] == (None, "photo_paid")


@pytest.mark.asyncio
async def test_at_cap_blocks(monkeypatch):
    monkeypatch.setenv("MAX_PHOTO_LOOKUPS_DAY", "10")
    rec = AsyncMock()
    with patch("photo_lookup.count_kind_events_strict", new=AsyncMock(return_value=10)):
        with patch("photo_lookup.record_event", new=rec):
            assert await allow_paid_lookup() is False
    rec.assert_not_awaited()


@pytest.mark.asyncio
async def test_count_raises_is_fail_closed(monkeypatch):
    monkeypatch.setenv("MAX_PHOTO_LOOKUPS_DAY", "2000")
    rec = AsyncMock()
    with patch(
        "photo_lookup.count_kind_events_strict",
        new=AsyncMock(side_effect=RuntimeError("down")),
    ):
        with patch("photo_lookup.record_event", new=rec):
            assert await allow_paid_lookup() is False
    rec.assert_not_awaited()


@pytest.mark.asyncio
async def test_count_unknown_is_fail_closed(monkeypatch):
    monkeypatch.setenv("MAX_PHOTO_LOOKUPS_DAY", "2000")
    rec = AsyncMock()
    with patch("photo_lookup.count_kind_events_strict", new=AsyncMock(return_value=None)):
        with patch("photo_lookup.record_event", new=rec):
            assert await allow_paid_lookup() is False
    rec.assert_not_awaited()


@pytest.mark.asyncio
async def test_memo_reuses_count_within_window(monkeypatch):
    monkeypatch.setenv("MAX_PHOTO_LOOKUPS_DAY", "10")
    count = AsyncMock(return_value=1)
    rec = AsyncMock()
    with patch("photo_lookup.count_kind_events_strict", new=count):
        with patch("photo_lookup.record_event", new=rec):
            assert await allow_paid_lookup() is True
            assert await allow_paid_lookup() is True
    assert count.await_count == 1
    assert rec.await_count == 2


@pytest.mark.asyncio
async def test_memo_refreshes_after_window(monkeypatch):
    monkeypatch.setenv("MAX_PHOTO_LOOKUPS_DAY", "10")
    count = AsyncMock(side_effect=[1, 2])
    rec = AsyncMock()
    ticks = iter([0.0, PHOTO_PAID_MEMO_SEC + 1])
    with patch("photo_lookup.time.monotonic", side_effect=lambda: next(ticks)):
        with patch("photo_lookup.count_kind_events_strict", new=count):
            with patch("photo_lookup.record_event", new=rec):
                assert await allow_paid_lookup() is True
                assert await allow_paid_lookup() is True
    assert count.await_count == 2


@pytest.mark.asyncio
async def test_cold_start_reads_db_floor(monkeypatch):
    monkeypatch.setenv("MAX_PHOTO_LOOKUPS_DAY", "2000")
    rec = AsyncMock()
    with patch("photo_lookup.count_kind_events_strict", new=AsyncMock(return_value=2000)):
        with patch("photo_lookup.record_event", new=rec):
            assert await allow_paid_lookup() is False
    rec.assert_not_awaited()


@pytest.mark.asyncio
async def test_count_kind_events_strict_none_on_http_error(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://sb.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")

    class Boom:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            raise RuntimeError("down")

        async def __aexit__(self, *a):
            return False

    with patch("usage.httpx.AsyncClient", Boom):
        assert await count_kind_events_strict("photo_paid") is None
        assert await count_kind_events("photo_paid") == 0


@pytest.mark.asyncio
async def test_count_kind_events_strict_none_without_config(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    assert await count_kind_events_strict("photo_paid") is None
    assert await count_kind_events("photo_paid") == 0
