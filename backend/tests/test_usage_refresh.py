"""Pruebas de cuotas: refresh rate-limit y system_revalidation sin user_id."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from auth import AuthUser
from usage import enforce_usage, record_event


def _user(*, anonymous: bool = False) -> AuthUser:
    return AuthUser(
        id="11111111-1111-1111-1111-111111111111",
        email=None,
        is_anonymous=anonymous,
    )


@pytest.mark.asyncio
async def test_enforce_refresh_guest_limit(monkeypatch):
    monkeypatch.setenv("GUEST_MAX_REFRESHES", "2")
    with patch("usage.count_events", new=AsyncMock(return_value=2)):
        with pytest.raises(HTTPException) as exc:
            await enforce_usage(_user(anonymous=True), "refresh")
    assert exc.value.status_code == 429
    assert exc.value.detail["limit"] == "guest"


@pytest.mark.asyncio
async def test_enforce_extraction_skipped_for_none_user():
    # No debe lanzar ni consultar.
    with patch("usage.count_events", new=AsyncMock()) as count:
        await enforce_usage(None, "extraction")
    count.assert_not_awaited()


@pytest.mark.asyncio
async def test_record_system_revalidation_without_user(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://sb.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")

    class FakeResponse:
        status_code = 201

    class FakeClient:
        def __init__(self, *a, **k):
            self.posted = None

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            self.posted = json
            FakeClient.last = json
            return FakeResponse()

    with patch("usage.httpx.AsyncClient", FakeClient):
        await record_event(None, "system_revalidation", cost_hint=42)
    assert FakeClient.last == {"kind": "system_revalidation", "cost_hint": 42}


@pytest.mark.asyncio
async def test_record_photo_paid_without_user(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://sb.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")

    class FakeResponse:
        status_code = 201

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            FakeClient.last = json
            return FakeResponse()

    with patch("usage.httpx.AsyncClient", FakeClient):
        await record_event(None, "photo_paid", cost_hint=1)
    assert FakeClient.last == {"kind": "photo_paid", "cost_hint": 1}
