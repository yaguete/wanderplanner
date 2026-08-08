"""Tests unitarios de travel_briefs (TTL + extracción HTML)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from travel_briefs import (
    _extract_html_text,
    _is_stale,
    ensure_travel_briefs,
    recommendation_url,
)


def test_recommendation_url_thailand():
    url = recommendation_url("TH")
    assert url is not None
    assert "trc=Tailandia" in url or "trc=Tailandia" in url.replace("%20", " ")


def test_recommendation_url_unknown():
    assert recommendation_url("ZZ") is None


def test_extract_html_text_strips_chrome():
    html = """
    <html><head><script>evil()</script><style>.x{}</style></head>
    <body>
      <nav>menu</nav>
      <main>
        <h1>Tailandia</h1>
        <p>Tarjeta digital de llegada (TDAC) tres días antes.</p>
      </main>
      <footer>pie</footer>
    </body></html>
    """
    text = _extract_html_text(html)
    assert "TDAC" in text
    assert "evil" not in text
    assert "menu" not in text


def test_is_stale_respects_ttl(monkeypatch, tmp_path):
    monkeypatch.setenv("TRAVEL_BRIEF_TTL_DAYS", "7")
    now = datetime.now(timezone.utc)
    fresh = {"fetched_at": (now - timedelta(days=1)).isoformat()}
    stale = {"fetched_at": (now - timedelta(days=10)).isoformat()}
    assert _is_stale(fresh, now=now) is False
    assert _is_stale(stale, now=now) is True
    assert _is_stale({}, now=now) is True


def test_fixture_file_exists():
    path = Path(__file__).parent / "fixtures" / "travel_brief_th.txt"
    assert path.exists()
    assert "TDAC" in path.read_text(encoding="utf-8")


@pytest.mark.asyncio
async def test_ensure_serves_stale_when_refresh_fails(monkeypatch):
    stale_text = "TDAC tres días antes. Contenido cacheado."
    stale_meta = {
        "sha256": "oldsha",
        "fetched_at": (datetime.now(timezone.utc) - timedelta(days=10)).isoformat(),
        "url": "https://example.com/th",
    }
    monkeypatch.setenv("TRAVEL_BRIEF_TTL_DAYS", "7")

    with (
        patch(
            "travel_briefs.get_travel_brief_meta",
            return_value=stale_meta,
        ),
        patch(
            "travel_briefs.get_cached_travel_brief",
            return_value=stale_text,
        ),
        patch(
            "travel_briefs.fetch_and_cache_travel_brief",
            AsyncMock(return_value={"code": "TH", "error": "HTTP 503"}),
        ),
    ):
        out = await ensure_travel_briefs(["TH"])
        assert out["TH"]["text"] == stale_text
        assert out["TH"]["meta"].get("stale") is True
        assert out["TH"]["meta"].get("refresh_error") == "HTTP 503"
        assert out["TH"]["meta"]["sha256"] == "oldsha"


@pytest.mark.asyncio
async def test_ensure_error_when_no_disk_cache(monkeypatch):
    monkeypatch.setenv("TRAVEL_BRIEF_TTL_DAYS", "7")
    with (
        patch("travel_briefs.get_travel_brief_meta", return_value={}),
        patch("travel_briefs.get_cached_travel_brief", return_value=None),
        patch(
            "travel_briefs.fetch_and_cache_travel_brief",
            AsyncMock(return_value={"code": "TH", "error": "HTTP 404"}),
        ),
    ):
        out = await ensure_travel_briefs(["TH"])
        assert out["TH"]["text"] == ""
        assert out["TH"]["meta"].get("error") == "HTTP 404"
