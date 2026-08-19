"""Parser y unfurl de POST /maps/resolve: allowlist por hop, fail-open, caché."""
from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from maps_resolve import (
    canonicalize_maps_url,
    hop_allowed,
    is_google_maps_host,
    is_maps_url,
    is_short_maps_url,
    parse_maps_coords,
    unfurl_maps_url,
)


PASTERZE = (
    "https://www.google.com/maps/place/Pasterze/@47.0877936,12.7136183,14z/"
    "data=!8m2!3d47.0893217!4d12.7128768"
)
SHORT = "https://maps.app.goo.gl/6odjmewhn9iZtAZF9"


def test_parse_prefers_3d4d_over_camera():
    coord = parse_maps_coords(PASTERZE)
    assert coord is not None
    lng, lat = coord
    assert lat == pytest.approx(47.0893217)
    assert lng == pytest.approx(12.7128768)


def test_parse_q_and_ll():
    q = parse_maps_coords("https://www.google.com/maps?q=47.0893217,12.7128768")
    assert q is not None
    assert q[0] == pytest.approx(12.7128768)
    assert q[1] == pytest.approx(47.0893217)
    ll = parse_maps_coords("https://maps.google.com/?ll=47.0893217,12.7128768")
    assert ll is not None
    assert ll[0] == pytest.approx(12.7128768)
    assert ll[1] == pytest.approx(47.0893217)


def test_parse_rejects_dir_search_and_origin():
    assert parse_maps_coords("https://www.google.com/maps/dir/Madrid/Barcelona/@40.4,-3.7,7z") is None
    assert parse_maps_coords("https://www.google.com/maps/search/?api=1&query=47.08,12.71") is None
    assert parse_maps_coords("https://www.google.com/maps/@0,0,3z") is None
    assert (
        parse_maps_coords(
            "https://www.google.com/maps/d/u/0/viewer?mid=abc&ll=61.97,-150.48&z=6"
        )
        is None
    )


def test_short_link_is_maps_but_has_no_coords():
    assert is_maps_url(SHORT) is True
    assert is_short_maps_url(SHORT) is True
    assert parse_maps_coords(SHORT) is None
    assert canonicalize_maps_url(SHORT + "?g_st=ic") == "https://maps.app.goo.gl/6odjmewhn9iZtAZF9"


def test_host_allowlist():
    assert is_google_maps_host("maps.app.goo.gl") is True
    assert is_google_maps_host("www.google.com") is True
    assert is_google_maps_host("google.at") is True
    assert is_google_maps_host("consent.google.com") is False
    assert is_google_maps_host("evil.example") is False
    assert is_maps_url("https://www.booking.com/hotel/x") is False


def test_hop_allowed_blocks_non_google(monkeypatch):
    monkeypatch.setattr("maps_resolve.is_public_http_url", lambda _u: True)
    assert hop_allowed("https://maps.app.goo.gl/abc") is True
    assert hop_allowed("https://www.google.com/maps/place/X") is True
    assert hop_allowed("https://consent.google.com/ml?continue=x") is False
    assert hop_allowed("https://evil.example/steal") is False


@pytest.mark.asyncio
async def test_unfurl_follows_one_hop(monkeypatch):
    monkeypatch.setattr("maps_resolve.is_public_http_url", lambda _u: True)

    class FakeResp:
        status_code = 302
        headers = {"location": PASTERZE}

    client = AsyncMock()
    client.get = AsyncMock(return_value=FakeResp())
    final = await unfurl_maps_url(SHORT, client)
    assert final == PASTERZE
    client.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_unfurl_blocks_non_google_hop(monkeypatch):
    monkeypatch.setattr("maps_resolve.is_public_http_url", lambda _u: True)

    class FakeResp:
        status_code = 302
        headers = {"location": "https://evil.example/phish"}

    client = AsyncMock()
    client.get = AsyncMock(return_value=FakeResp())
    assert await unfurl_maps_url(SHORT, client) is None


@pytest.mark.asyncio
async def test_unfurl_fail_open_on_network_error(monkeypatch):
    monkeypatch.setattr("maps_resolve.is_public_http_url", lambda _u: True)
    client = AsyncMock()
    client.get = AsyncMock(side_effect=httpx.ConnectError("boom"))
    assert await unfurl_maps_url(SHORT, client) is None


@pytest.mark.asyncio
async def test_cache_hit_skips_network(monkeypatch):
    from maps_resolve import ResolveRequest, maps_resolve
    from auth import AuthUser

    user = AuthUser(id="11111111-1111-1111-1111-111111111111", email="a@b.c", is_anonymous=False)
    monkeypatch.setattr(
        "maps_resolve._get_cached",
        AsyncMock(return_value=(12.7128768, 47.0893217)),
    )
    enforce = AsyncMock()
    monkeypatch.setattr("maps_resolve.enforce_usage", enforce)
    record = AsyncMock()
    monkeypatch.setattr("maps_resolve.record_event", record)

    resp = await maps_resolve(ResolveRequest(urls=[SHORT]), user)
    assert len(resp.pins) == 1
    assert resp.pins[0].lat == pytest.approx(47.0893217)
    enforce.assert_not_awaited()
    record.assert_not_awaited()
