"""Pruebas de GET /sources/suggest (sanitización, cascada, curados, cap)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

import source_suggest as mod
from source_suggest import (
    SuggestHit,
    cache_hits_for_query,
    hit_from_cache_row,
    hit_from_tavily,
    host_is_curated,
    merge_hits,
    sanitize_suggest_query,
    sources_suggest,
    text_matches,
)


def _fresh_iso(days: int = 1) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def test_sanitize_rejects_short_and_strips_syntax():
    assert sanitize_suggest_query("ab") is None
    assert sanitize_suggest_query("  ja  ") is None
    assert sanitize_suggest_query("vietnam") == "vietnam"
    assert sanitize_suggest_query("Costa Rica") == "Costa Rica"
    assert sanitize_suggest_query("japón") == "japón"
    assert sanitize_suggest_query("viet*nam,()") == "vietnam"
    assert sanitize_suggest_query("a" * 80) == "a" * 60


def test_host_is_curated_matches_subdomains():
    assert host_is_curated("unblogdeviajes.com")
    assert host_is_curated("www.unblogdeviajes.com")
    assert host_is_curated("www.japonismo.com")
    assert host_is_curated("blog.japonismo.com")
    assert host_is_curated("evil.example") is False
    assert host_is_curated("exteriores.gob.es") is False


def test_text_matches_folds_accents():
    assert text_matches("japon", "Japón en 15 días")
    assert text_matches("Japón", "Itinerario por japon")
    assert text_matches("costa rica", "Costa Rica, Centroamérica")
    assert text_matches("islandia", "Ruta por Vietnam") is False


def test_cache_row_skips_private_hosts_and_expired():
    row = {
        "url": "https://mi-blog-secreto.example/japon/",
        "og_title": "Japón",
        "destination": "Japón",
        "validated_at": _fresh_iso(1),
    }
    assert hit_from_cache_row(row) is None

    expired = {
        "url": "https://unblogdeviajes.com/japon/",
        "og_title": "Japón",
        "destination": "Japón",
        "validated_at": _fresh_iso(400),
    }
    assert hit_from_cache_row(expired) is None

    ok = {
        "url": "https://unblogdeviajes.com/japon/",
        "og_title": "Japón en 15 días",
        "destination": "Japón",
        "total_days": 15,
        "validated_at": _fresh_iso(1),
    }
    hit = hit_from_cache_row(ok)
    assert hit is not None
    assert hit.origin == "cache"
    assert hit.instant is True
    assert hit.host == "unblogdeviajes.com"


def test_tavily_drops_institutional():
    assert (
        hit_from_tavily(
            {"url": "https://www.exteriores.gob.es/japon", "title": "MAE"},
            origin="web",
        )
        is None
    )
    hit = hit_from_tavily(
        {
            "url": "https://unblogdeviajes.com/vietnam/",
            "title": "Vietnam",
            "content": "12 días",
        },
        origin="curated",
    )
    assert hit is not None
    assert hit.instant is False
    assert hit.origin == "curated"


def test_merge_hits_dedupes_and_caps_at_four():
    def hit(url: str, origin: str = "cache") -> SuggestHit:
        return SuggestHit(
            url=url,
            title=url,
            host="unblogdeviajes.com",
            origin=origin,  # type: ignore[arg-type]
            instant=origin == "cache",
        )

    merged = merge_hits(
        [hit("https://unblogdeviajes.com/a"), hit("https://unblogdeviajes.com/a/")],
        [
            hit("https://unblogdeviajes.com/b", "curated"),
            hit("https://unblogdeviajes.com/c", "curated"),
            hit("https://unblogdeviajes.com/d", "web"),
            hit("https://unblogdeviajes.com/e", "web"),
        ],
    )
    assert len(merged) == 4
    assert merged[0].url.endswith("/a")
    assert merged[-1].url.endswith("/d")


def test_cache_hits_for_query_filters_by_destination():
    rows = [
        {
            "url": "https://unblogdeviajes.com/japon/",
            "og_title": "Japón en 15 días",
            "destination": "Japón",
            "validated_at": _fresh_iso(1),
        },
        {
            "url": "https://unblogdeviajes.com/vietnam/",
            "og_title": "Vietnam",
            "destination": "Vietnam",
            "validated_at": _fresh_iso(1),
        },
    ]
    hits = cache_hits_for_query(rows, "japon")
    assert len(hits) == 1
    assert "japon" in hits[0].url


class _Req:
    def __init__(self) -> None:
        self.headers = {}
        self.client = None


@pytest.mark.asyncio
async def test_endpoint_cache_hit_skips_tavily(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "false")
    rows = [
        {
            "url": f"https://unblogdeviajes.com/japon-{i}/",
            "og_title": f"Japón {i}",
            "destination": "Japón",
            "validated_at": _fresh_iso(1),
        }
        for i in range(4)
    ]
    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=rows)):
        with patch.object(mod, "tavily_search", new=AsyncMock()) as tavily:
            with patch.object(mod, "record_event", new=AsyncMock()) as record:
                resp = await sources_suggest(_Req(), q="japón")  # type: ignore[arg-type]
    assert len(resp.results) == 4
    assert all(h.origin == "cache" and h.instant for h in resp.results)
    tavily.assert_not_awaited()
    record.assert_not_awaited()


@pytest.mark.asyncio
async def test_endpoint_fills_with_curated_tavily(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "false")
    monkeypatch.setenv("LANDING_SOURCE_SEARCH_MAX_IP_DAY", "20")
    mod._ip_counts = {}
    mod._day = None
    rows = [
        {
            "url": "https://unblogdeviajes.com/japon/",
            "og_title": "Japón",
            "destination": "Japón",
            "validated_at": _fresh_iso(1),
        }
    ]
    tavily_payload = {
        "results": [
            {"url": "https://japonismo.com/itinerario-15", "title": "15 días"},
            {"url": "https://viajablog.com/japon", "title": "Japón viajablog"},
            {"url": "https://www.exteriores.gob.es/jp", "title": "MAE"},
        ]
    }
    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=rows)):
        with patch.object(mod, "tavily_search", new=AsyncMock(return_value=tavily_payload)) as tavily:
            with patch.object(mod, "allow_suggest_tavily_global", new=AsyncMock(return_value=True)):
                with patch.object(mod, "record_event", new=AsyncMock()) as record:
                    resp = await sources_suggest(_Req(), q="japon")  # type: ignore[arg-type]
    assert tavily.await_args.kwargs["strict"] is True
    assert record.await_count == 1
    origins = {h.origin for h in resp.results}
    assert "cache" in origins
    assert "curated" in origins
    assert all("gob.es" not in h.url for h in resp.results)
    assert len(resp.results) <= 4


@pytest.mark.asyncio
async def test_endpoint_web_step_asks_captcha(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "true")
    mod._ip_counts = {}
    mod._day = None
    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=[])):
        with patch.object(mod, "tavily_search", new=AsyncMock(return_value={"results": []})):
            with patch.object(mod, "allow_suggest_tavily_global", new=AsyncMock(return_value=True)):
                with patch.object(mod, "verify_turnstile", new=AsyncMock(return_value=False)):
                    with patch.object(mod, "record_event", new=AsyncMock()):
                        resp = await sources_suggest(_Req(), q="alaska")  # type: ignore[arg-type]
    assert resp.need_captcha is True


@pytest.mark.asyncio
async def test_endpoint_disabled(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "false")
    with pytest.raises(HTTPException) as exc:
        await sources_suggest(_Req(), q="japon")  # type: ignore[arg-type]
    assert exc.value.status_code == 404
