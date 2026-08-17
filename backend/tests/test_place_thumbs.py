"""Refresco de URI de Places no debe gastar la cuota; Wikimedia va antes del 429."""
from __future__ import annotations

from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from auth import AuthUser
from place_thumbs import _payload, _resolve_thumb
from wikimedia_thumbs import WikiThumb


def _user() -> AuthUser:
    return AuthUser(
        id="11111111-1111-1111-1111-111111111111",
        email="a@b.c",
        is_anonymous=False,
    )


STALE_ROW = {
    "miss": False,
    "photo_uri": "https://lh3.googleusercontent.com/stale",
    "photo_uri_expires_at": "2020-01-01T00:00:00+00:00",
    "photo_name": "places/abc/photos/xyz",
    "provider": "places",
}

WIKI_ROW = {
    "miss": False,
    "photo_uri": "https://upload.wikimedia.org/wikipedia/commons/h.jpg",
    "photo_uri_expires_at": None,
    "photo_name": None,
    "provider": "wikimedia",
    "attribution": {
        "author": "Taxiarchos228",
        "license": "FAL",
        "creditUrl": "https://commons.wikimedia.org/wiki/File:Hallstatt.jpg",
    },
}

WIKI = WikiThumb(
    url="https://upload.wikimedia.org/wikipedia/commons/fresh.jpg",
    author="Taxiarchos228",
    license="FAL",
    credit_url="https://commons.wikimedia.org/wiki/File:Hallstatt.jpg",
)

QUOTA_EXC = HTTPException(
    status_code=429,
    detail={"message": "Has alcanzado el límite diario de miniaturas.", "limit": "daily"},
)


def _stack(
    *,
    row,
    media_uri: str | None,
    paid: bool = True,
    search_name: str | None = None,
    get_media: AsyncMock | None = None,
    search: AsyncMock | None = None,
    wiki: AsyncMock | None = None,
    quota: bool = True,
) -> tuple[ExitStack, AsyncMock, AsyncMock, AsyncMock]:
    stack = ExitStack()
    stack.enter_context(patch("place_thumbs.supabase_config", return_value=("https://sb.example", "k")))
    stack.enter_context(patch("place_thumbs._google_key", return_value="fake-key"))
    stack.enter_context(patch("place_thumbs._get_row", new=AsyncMock(return_value=row)))
    stack.enter_context(
        patch("place_thumbs._get_media_uri", new=get_media or AsyncMock(return_value=media_uri))
    )
    stack.enter_context(
        patch("place_thumbs._search_photo_name", new=search or AsyncMock(return_value=search_name))
    )
    wiki_lookup = wiki or AsyncMock(return_value=None)
    stack.enter_context(patch("place_thumbs.lookup_wikimedia_thumb", new=wiki_lookup))
    upsert = AsyncMock()
    stack.enter_context(patch("place_thumbs._upsert_row", new=upsert))
    stack.enter_context(patch("place_thumbs.allow_paid_lookup", new=AsyncMock(return_value=paid)))
    enforce = stack.enter_context(
        patch(
            "place_thumbs.enforce_usage",
            new=AsyncMock(side_effect=QUOTA_EXC if quota else None),
        )
    )
    stack.enter_context(patch("place_thumbs.record_event", new=AsyncMock()))
    return stack, enforce, upsert, wiki_lookup


@pytest.mark.asyncio
async def test_expired_uri_refresh_ignores_user_quota():
    stack, enforce, _, _ = _stack(
        row=STALE_ROW,
        media_uri="https://lh3.googleusercontent.com/fresh",
    )
    with stack:
        result = await _resolve_thumb("hallstatt", _user(), kind="stay")

    assert result == _payload("https://lh3.googleusercontent.com/fresh", "places")
    enforce.assert_not_awaited()


@pytest.mark.asyncio
async def test_refresh_capped_globally_serves_stale_uri():
    get_media = AsyncMock(return_value="https://lh3.googleusercontent.com/fresh")
    stack, _, _, _ = _stack(row=STALE_ROW, media_uri=None, paid=False, get_media=get_media)
    with stack:
        result = await _resolve_thumb("mondsee", _user(), kind="stay")

    assert result == _payload("https://lh3.googleusercontent.com/stale", "places")
    get_media.assert_not_awaited()


@pytest.mark.asyncio
async def test_getmedia_fail_serves_stale_instead_of_search():
    search = AsyncMock(return_value="places/other/photos/new")
    stack, _, _, _ = _stack(row=STALE_ROW, media_uri=None, search=search)
    with stack:
        result = await _resolve_thumb("sankt wolfgang", _user(), kind="stay")

    assert result == _payload("https://lh3.googleusercontent.com/stale", "places")
    search.assert_not_awaited()


@pytest.mark.asyncio
async def test_true_cache_miss_still_enforces_user_quota():
    stack, enforce, _, wiki = _stack(row=None, media_uri=None, search_name=None)
    with stack:
        with pytest.raises(HTTPException) as exc:
            await _resolve_thumb("faro inventado", _user(), kind="activity")

    assert exc.value.status_code == 429
    wiki.assert_awaited()
    enforce.assert_awaited()


@pytest.mark.asyncio
async def test_wikimedia_cache_hit_skips_places_media():
    get_media = AsyncMock(return_value="https://lh3.googleusercontent.com/nope")
    stack, enforce, _, wiki = _stack(row=WIKI_ROW, media_uri=None, get_media=get_media)
    with stack:
        result = await _resolve_thumb("hallstatt austria", _user(), kind="activity", name="Hallstatt")

    assert result["url"] == WIKI_ROW["photo_uri"]
    assert result["provider"] == "wikimedia"
    assert result["attribution"]["author"] == "Taxiarchos228"
    get_media.assert_not_awaited()
    wiki.assert_not_awaited()
    enforce.assert_not_awaited()


@pytest.mark.asyncio
async def test_commons_hit_skips_places_and_quota():
    wiki = AsyncMock(return_value=WIKI)
    stack, enforce, _, _ = _stack(row=None, media_uri=None, wiki=wiki)
    with stack:
        result = await _resolve_thumb("hallstatt austria", _user(), kind="activity", name="Hallstatt")

    assert result == _payload(WIKI.url, "wikimedia", WIKI.attribution())
    enforce.assert_not_awaited()


@pytest.mark.asyncio
async def test_commons_hit_when_user_over_quota():
    wiki = AsyncMock(return_value=WIKI)
    stack, enforce, _, _ = _stack(row=None, media_uri=None, wiki=wiki)
    with stack:
        result = await _resolve_thumb("mondsee", _user(), kind="activity", name="Mondsee")

    assert result["url"] == WIKI.url
    assert result["provider"] == "wikimedia"
    enforce.assert_not_awaited()


@pytest.mark.asyncio
async def test_wiki_miss_falls_to_places_without_writing_miss():
    search = AsyncMock(return_value="places/abc/photos/xyz")
    get_media = AsyncMock(return_value="https://lh3.googleusercontent.com/fresh")
    stack, enforce, upsert, wiki = _stack(
        row=None,
        media_uri="https://lh3.googleusercontent.com/fresh",
        search=search,
        get_media=get_media,
        quota=False,
    )
    with stack:
        result = await _resolve_thumb("gasthof", _user(), kind="activity", name="Gasthof")

    assert result["provider"] == "places"
    assert result["url"] == "https://lh3.googleusercontent.com/fresh"
    wiki.assert_awaited()
    search.assert_awaited()
    enforce.assert_awaited()
    rows = [c.args[3] for c in upsert.await_args_list if c.args and len(c.args) >= 4]
    assert any(r.get("provider") == "places" and r.get("miss") is False for r in rows)
    assert not any(r.get("miss") is True for r in rows)


@pytest.mark.asyncio
async def test_kind_stay_skips_wikimedia():
    wiki = AsyncMock(return_value=WIKI)
    stack, enforce, _, _ = _stack(row=None, media_uri=None, search_name=None, wiki=wiki)
    with stack:
        with pytest.raises(HTTPException) as exc:
            await _resolve_thumb("gasthof gruner anger", _user(), kind="stay", name="Gasthof Grüner Anger")

    assert exc.value.status_code == 429
    wiki.assert_not_awaited()
    enforce.assert_awaited()


@pytest.mark.asyncio
async def test_wiki_exception_does_not_propagate():
    wiki = AsyncMock(side_effect=TimeoutError("boom"))
    search = AsyncMock(return_value="places/abc/photos/xyz")
    stack, _, _, _ = _stack(
        row=None,
        media_uri="https://lh3.googleusercontent.com/fresh",
        search=search,
        wiki=wiki,
        quota=False,
    )
    with stack:
        result = await _resolve_thumb("hallstatt", _user(), kind="activity", name="Hallstatt")

    assert result["provider"] == "places"
    search.assert_awaited()


LEGACY_PLACES_ROW = {
    "miss": False,
    "photo_uri": "https://lh3.googleusercontent.com/stale",
    "photo_uri_expires_at": "2020-01-01T00:00:00+00:00",
    "photo_name": "places/abc/photos/xyz",
    "provider": None,
}


@pytest.mark.asyncio
async def test_activity_expired_places_upgrades_to_commons():
    get_media = AsyncMock(return_value="https://lh3.googleusercontent.com/fresh")
    wiki = AsyncMock(return_value=WIKI)
    stack, _, upsert, _ = _stack(
        row=STALE_ROW,
        media_uri=None,
        get_media=get_media,
        wiki=wiki,
    )
    with stack:
        result = await _resolve_thumb("hallstatt austria", _user(), kind="activity", name="Hallstatt")

    assert result == _payload(WIKI.url, "wikimedia", WIKI.attribution())
    get_media.assert_not_awaited()
    wiki.assert_awaited()
    rows = [c.args[3] for c in upsert.await_args_list if c.args and len(c.args) >= 4]
    assert any(r.get("provider") == "wikimedia" for r in rows)


@pytest.mark.asyncio
async def test_legacy_null_provider_upgrades_to_commons():
    get_media = AsyncMock(return_value="https://lh3.googleusercontent.com/fresh")
    wiki = AsyncMock(return_value=WIKI)
    stack, _, _, _ = _stack(
        row=LEGACY_PLACES_ROW,
        media_uri=None,
        get_media=get_media,
        wiki=wiki,
    )
    with stack:
        result = await _resolve_thumb("hallstatt austria", _user(), kind="activity", name="Hallstatt")

    assert result["provider"] == "wikimedia"
    get_media.assert_not_awaited()


@pytest.mark.asyncio
async def test_stay_expired_places_skips_wiki_and_refreshes():
    wiki = AsyncMock(return_value=WIKI)
    stack, _, _, _ = _stack(
        row=STALE_ROW,
        media_uri="https://lh3.googleusercontent.com/fresh",
        wiki=wiki,
    )
    with stack:
        result = await _resolve_thumb("gasthof", _user(), kind="stay", name="Gasthof")

    assert result == _payload("https://lh3.googleusercontent.com/fresh", "places")
    wiki.assert_not_awaited()


@pytest.mark.asyncio
async def test_activity_wiki_miss_capped_still_serves_stale():
    wiki = AsyncMock(return_value=None)
    get_media = AsyncMock(return_value="https://lh3.googleusercontent.com/fresh")
    stack, _, _, _ = _stack(
        row=STALE_ROW,
        media_uri=None,
        paid=False,
        get_media=get_media,
        wiki=wiki,
    )
    with stack:
        result = await _resolve_thumb("mondsee", _user(), kind="activity", name="Mondsee")

    assert result == _payload("https://lh3.googleusercontent.com/stale", "places")
    wiki.assert_awaited()
    get_media.assert_not_awaited()


@pytest.mark.asyncio
async def test_single_flight_key_includes_kind():
    captured: dict[str, str] = {}

    async def fake_sf(key, factory):
        captured["key"] = key
        return _payload(None)

    from place_thumbs import get_thumb

    with patch("place_thumbs.single_flight", new=fake_sf):
        await get_thumb(q="Hallstatt Austria", kind="activity", n="Hallstatt", user=_user())

    assert captured["key"] == "thumb:activity:hallstatt austria"
