"""Refresco de URI de Places no debe gastar la cuota diaria del usuario."""
from __future__ import annotations

from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from auth import AuthUser
from place_thumbs import _resolve_thumb


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
}

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
) -> tuple[ExitStack, AsyncMock, AsyncMock]:
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
    stack.enter_context(patch("place_thumbs._upsert_row", new=AsyncMock()))
    stack.enter_context(patch("place_thumbs.allow_paid_lookup", return_value=paid))
    enforce = stack.enter_context(patch("place_thumbs.enforce_usage", new=AsyncMock(side_effect=QUOTA_EXC)))
    record = stack.enter_context(patch("place_thumbs.record_event", new=AsyncMock()))
    return stack, enforce, record


@pytest.mark.asyncio
async def test_expired_uri_refresh_ignores_user_quota():
    """Usuario al tope diario + URI caducada → se sirve la foto, sin 429."""
    stack, enforce, record = _stack(
        row=STALE_ROW,
        media_uri="https://lh3.googleusercontent.com/fresh",
    )
    with stack:
        result = await _resolve_thumb("hallstatt", _user())

    assert result == {"url": "https://lh3.googleusercontent.com/fresh"}
    enforce.assert_not_awaited()
    record.assert_not_awaited()


@pytest.mark.asyncio
async def test_refresh_capped_globally_serves_stale_uri():
    get_media = AsyncMock(return_value="https://lh3.googleusercontent.com/fresh")
    stack, _, _ = _stack(row=STALE_ROW, media_uri=None, paid=False, get_media=get_media)
    with stack:
        result = await _resolve_thumb("mondsee", _user())

    assert result == {"url": "https://lh3.googleusercontent.com/stale"}
    get_media.assert_not_awaited()


@pytest.mark.asyncio
async def test_getmedia_fail_serves_stale_instead_of_search():
    search = AsyncMock(return_value="places/other/photos/new")
    stack, _, _ = _stack(row=STALE_ROW, media_uri=None, search=search)
    with stack:
        result = await _resolve_thumb("sankt wolfgang", _user())

    assert result == {"url": "https://lh3.googleusercontent.com/stale"}
    search.assert_not_awaited()


@pytest.mark.asyncio
async def test_true_cache_miss_still_enforces_user_quota():
    stack, enforce, _ = _stack(row=None, media_uri=None, search_name=None)
    with stack:
        with pytest.raises(HTTPException) as exc:
            await _resolve_thumb("faro inventado", _user())

    assert exc.value.status_code == 429
    enforce.assert_awaited()
