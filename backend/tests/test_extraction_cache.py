"""Pruebas de frescura, lookup canónico y metadatos de article_extractions."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from article_fetch import CONTENT_VERSION, normalize_article_url
from extraction_cache import (
    CacheEntry,
    classify_freshness,
    get_cached_extraction,
    hard_ttl_days,
    payload_looks_poisoned,
    revalidate_days,
    suggest_row_looks_poisoned,
)


def _entry(**overrides) -> CacheEntry:
    now = datetime.now(timezone.utc)
    base = CacheEntry(
        url="https://example.com/post",
        canonical_url="https://example.com/post",
        payload={"title": "t", "days": [], "basics": []},
        fetched_at=now,
        validated_at=now,
        etag='"abc"',
        last_modified="Mon, 01 Aug 2026 10:00:00 GMT",
        article_modified_at=datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc),
        content_hash="deadbeef",
        content_version=CONTENT_VERSION,
        freshness="fresh",
    )
    for k, v in overrides.items():
        setattr(base, k, v)
    base.freshness = classify_freshness(base.validated_at)
    return base


def test_classify_fresh_stale_expired(monkeypatch):
    monkeypatch.setenv("EXTRACTION_REVALIDATE_DAYS", "15")
    monkeypatch.setenv("EXTRACTION_HARD_TTL_DAYS", "90")
    now = datetime.now(timezone.utc)
    assert classify_freshness(now - timedelta(days=1), now=now) == "fresh"
    assert classify_freshness(now - timedelta(days=20), now=now) == "stale"
    assert classify_freshness(now - timedelta(days=100), now=now) == "expired"
    assert classify_freshness(None, now=now) == "expired"


def test_hard_ttl_falls_back_to_legacy_env(monkeypatch):
    monkeypatch.delenv("EXTRACTION_HARD_TTL_DAYS", raising=False)
    monkeypatch.setenv("EXTRACTION_CACHE_TTL_DAYS", "45")
    assert hard_ttl_days() == 45
    assert revalidate_days() == 2


def test_default_revalidate_window_is_two_days(monkeypatch):
    monkeypatch.delenv("EXTRACTION_REVALIDATE_DAYS", raising=False)
    now = datetime.now(timezone.utc)
    assert revalidate_days() == 2
    assert classify_freshness(now - timedelta(days=1), now=now) == "fresh"
    assert classify_freshness(now - timedelta(days=3), now=now) == "stale"


@pytest.mark.asyncio
async def test_get_cached_extraction_falls_back_to_canonical(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://sb.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")

    raw = "https://Example.com/post/?utm_source=x"
    canonical = normalize_article_url(raw)
    row = {
        "url": "https://example.com/post",
        "canonical_url": canonical,
        "payload": {
            "title": "cached",
            "destination": "Austria",
            "days": [{"activities": [{"name": "castillo"}]}],
            "basics": [],
        },
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "etag": None,
        "last_modified": None,
        "article_modified_at": None,
        "content_hash": "abc",
        "content_version": CONTENT_VERSION,
    }

    async def fake_fetch_rows(params):
        if params.get("url", "").startswith("eq."):
            return []
        if params.get("canonical_url") == f"eq.{canonical}":
            return [row]
        return []

    with patch("extraction_cache._fetch_rows", side_effect=fake_fetch_rows):
        entry = await get_cached_extraction(raw)
    assert entry is not None
    assert entry.payload["title"] == "cached"
    assert entry.freshness == "fresh"


@pytest.mark.asyncio
async def test_get_cached_extraction_canonical_when_incoming_already_clean(monkeypatch):
    """Landing envía sin barra; la PK se guardó con barra. Antes se saltaba canonical_url."""
    monkeypatch.setenv("SUPABASE_URL", "https://sb.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")

    incoming = "https://losviajesdeclaudia.com/japon/guia-ruta-por-japon-3-semanas-21-dias"
    stored_pk = incoming + "/"
    canonical = normalize_article_url(incoming)
    assert canonical == incoming
    row = {
        "url": stored_pk,
        "canonical_url": canonical,
        "payload": {
            "title": "Japón 21 días",
            "destination": "Japón",
            "days": [{"activities": [{"name": "Tokio"}]}],
            "basics": [],
        },
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "etag": None,
        "last_modified": None,
        "article_modified_at": None,
        "content_hash": "abc",
        "content_version": CONTENT_VERSION,
    }
    seen: list[dict] = []

    async def fake_fetch_rows(params):
        seen.append(params)
        if params.get("url") == f"eq.{incoming}":
            return []
        if params.get("canonical_url") == f"eq.{canonical}":
            return [row]
        return []

    with patch("extraction_cache._fetch_rows", side_effect=fake_fetch_rows):
        entry = await get_cached_extraction(incoming)
    assert entry is not None
    assert entry.payload["title"] == "Japón 21 días"
    assert any("canonical_url" in p for p in seen)


@pytest.mark.asyncio
async def test_get_cached_extraction_miss(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://sb.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    with patch("extraction_cache._fetch_rows", new=AsyncMock(return_value=[])):
        assert await get_cached_extraction("https://example.com/missing") is None


def test_payload_looks_poisoned_empty_and_dummy_destination():
    assert payload_looks_poisoned({"days": [], "basics": []}) is True
    assert payload_looks_poisoned(
        {"destination": "No article provided", "days": [], "basics": [], "total_days": 0}
    ) is True
    assert payload_looks_poisoned(
        {
            "destination": "Edimburgo",
            "og_title": "Qué ver",
            "days": [],
            "basics": [],
        }
    ) is False
    assert payload_looks_poisoned(
        {
            "destination": "",
            "days": [{"activities": [{"name": "castillo"}]}],
            "basics": [],
        }
    ) is False


def test_suggest_row_looks_poisoned_without_title_and_days():
    assert suggest_row_looks_poisoned(
        {"destination": None, "og_title": None, "total_days": None}
    ) is True
    assert suggest_row_looks_poisoned(
        {
            "destination": "No article provided",
            "og_title": None,
            "total_days": 0,
        }
    ) is True
    assert suggest_row_looks_poisoned(
        {
            "destination": "Japón",
            "og_title": "Japón en 15 días",
            "total_days": 15,
        }
    ) is False
    assert suggest_row_looks_poisoned(
        {
            "destination": "Escocia, Reino Unido",
            "og_title": None,
            "total_days": 0,
        }
    ) is False
    assert suggest_row_looks_poisoned(
        {
            "destination": "Omán",
            "og_title": "",
            "total_days": None,
        }
    ) is False


@pytest.mark.asyncio
async def test_get_cached_extraction_treats_poisoned_as_miss(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://sb.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    row = {
        "url": "https://losviajesdeclaudia.com/escocia/",
        "canonical_url": "https://losviajesdeclaudia.com/escocia",
        "payload": {
            "destination": "No article provided",
            "days": [],
            "basics": [],
            "total_days": 0,
        },
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "etag": None,
        "last_modified": None,
        "article_modified_at": None,
        "content_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "content_version": CONTENT_VERSION,
    }
    with patch("extraction_cache._fetch_rows", new=AsyncMock(return_value=[row])):
        entry = await get_cached_extraction(row["url"])
    assert entry is not None
    assert entry.freshness == "miss"
    assert entry.url == row["url"]
