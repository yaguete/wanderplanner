"""Invitaciones a viajes: auth estricta, respuesta idéntica por email, tope de uso."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import main as main_mod
from auth import VerifiedUser


TRIP_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


def _client() -> TestClient:
    return TestClient(main_mod.app)


def _user(**kwargs) -> VerifiedUser:
    return VerifiedUser(
        id=kwargs.get("id", "11111111-1111-1111-1111-111111111111"),
        email=kwargs.get("email", "ana@example.com"),
        is_anonymous=False,
        token=kwargs.get("token", "jwt-owner"),
    )


def test_create_invite_without_bearer_is_401(monkeypatch):
    monkeypatch.setenv("REQUIRE_AUTH", "false")
    r = _client().post(
        f"/trips/{TRIP_ID}/invites",
        json={"email": "bob@example.com"},
    )
    assert r.status_code == 401


def test_create_invite_anonymous_is_403():
    from fastapi import HTTPException
    from auth import require_verified_user

    async def deny(_authorization=None):
        raise HTTPException(status_code=403, detail="Necesitas una cuenta para compartir un viaje")

    app = main_mod.app
    app.dependency_overrides[require_verified_user] = deny
    try:
        r = _client().post(
            f"/trips/{TRIP_ID}/invites",
            json={"email": "bob@example.com"},
            headers={"Authorization": "Bearer anon"},
        )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_email_invite_identical_whether_or_not_account_exists():
    from auth import require_verified_user

    owner = _user()
    app = main_mod.app
    app.dependency_overrides[require_verified_user] = lambda: owner

    class FakeResp:
        def __init__(self, status, payload):
            self.status_code = status
            self._payload = payload
            self.text = ""
            self.content = b"{}"

        def json(self):
            return self._payload

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, headers=None, params=None):
            if "trips" in url and "trip_invites" not in url:
                return FakeResp(200, [{"id": TRIP_ID, "name": "Japón"}])
            return FakeResp(200, [])

        async def post(self, url, headers=None, json=None):
            if url.endswith("/trip_invites"):
                return FakeResp(201, [{"id": str(uuid4())}])
            return FakeResp(200, {})

        async def patch(self, url, headers=None, params=None, json=None):
            return FakeResp(200, [{}])

    with (
        patch("trip_share.enforce_usage", new=AsyncMock(return_value=None)),
        patch("trip_share.record_event", new=AsyncMock(return_value=None)),
        patch("trip_share.send_invite_email", new=AsyncMock(return_value=None)) as send,
        patch("trip_share.httpx.AsyncClient", FakeClient),
        patch.dict(
            "os.environ",
            {
                "SUPABASE_URL": "https://sb.example",
                "SUPABASE_ANON_KEY": "anon",
                "SUPABASE_SERVICE_ROLE_KEY": "service",
            },
            clear=False,
        ),
    ):
        try:
            r1 = _client().post(
                f"/trips/{TRIP_ID}/invites",
                json={"email": "nueva@example.com"},
                headers={"Authorization": "Bearer jwt-owner"},
            )
            r2 = _client().post(
                f"/trips/{TRIP_ID}/invites",
                json={"email": "existente@example.com"},
                headers={"Authorization": "Bearer jwt-owner"},
            )
        finally:
            app.dependency_overrides.clear()

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["status"] == r2.json()["status"] == "invited"
    assert send.await_count == 2


def test_resend_failure_still_returns_invited():
    from auth import require_verified_user

    owner = _user()
    app = main_mod.app
    app.dependency_overrides[require_verified_user] = lambda: owner

    class FakeResp:
        def __init__(self, status, payload):
            self.status_code = status
            self._payload = payload
            self.text = ""
            self.content = b"{}"

        def json(self):
            return self._payload

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, headers=None, params=None):
            return FakeResp(200, [{"id": TRIP_ID, "name": "Japón"}])

        async def post(self, url, headers=None, json=None):
            if url.endswith("/trip_invites"):
                return FakeResp(201, [{"id": str(uuid4())}])
            return FakeResp(200, {})

        async def patch(self, url, headers=None, params=None, json=None):
            return FakeResp(200, [{}])

    with (
        patch("trip_share.enforce_usage", new=AsyncMock(return_value=None)),
        patch("trip_share.record_event", new=AsyncMock(return_value=None)),
        patch(
            "trip_share.send_invite_email",
            new=AsyncMock(side_effect=RuntimeError("Resend HTTP 403")),
        ),
        patch("trip_share.httpx.AsyncClient", FakeClient),
        patch.dict(
            "os.environ",
            {"SUPABASE_URL": "https://sb.example", "SUPABASE_ANON_KEY": "anon"},
            clear=False,
        ),
    ):
        try:
            r = _client().post(
                f"/trips/{TRIP_ID}/invites",
                json={"email": "bob@example.com"},
                headers={"Authorization": "Bearer jwt-owner"},
            )
        finally:
            app.dependency_overrides.clear()

    assert r.status_code == 200
    assert r.json()["status"] == "invited"
    assert r.json()["emailSent"] is False


def test_self_invite_rejected():
    from auth import require_verified_user

    owner = _user(email="ana@example.com")
    app = main_mod.app
    app.dependency_overrides[require_verified_user] = lambda: owner

    class FakeResp:
        def __init__(self, status, payload):
            self.status_code = status
            self._payload = payload
            self.text = ""
            self.content = b"{}"

        def json(self):
            return self._payload

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, headers=None, params=None):
            return FakeResp(200, [{"id": TRIP_ID, "name": "Japón"}])

    with (
        patch("trip_share.enforce_usage", new=AsyncMock(return_value=None)),
        patch("trip_share.httpx.AsyncClient", FakeClient),
        patch.dict(
            "os.environ",
            {"SUPABASE_URL": "https://sb.example", "SUPABASE_ANON_KEY": "anon"},
            clear=False,
        ),
    ):
        try:
            r = _client().post(
                f"/trips/{TRIP_ID}/invites",
                json={"email": "ana@example.com"},
                headers={"Authorization": "Bearer jwt-owner"},
            )
        finally:
            app.dependency_overrides.clear()

    assert r.status_code == 400
    assert "tu correo" in r.json()["detail"].lower()


def test_peer_who_is_not_peer_is_403():
    from auth import require_verified_user

    owner = _user()
    app = main_mod.app
    app.dependency_overrides[require_verified_user] = lambda: owner
    stranger = str(uuid4())

    class FakeResp:
        def __init__(self, status, payload, text="not a share peer"):
            self.status_code = status
            self._payload = payload
            self.text = text
            self.content = b"x"

        def json(self):
            return self._payload

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, headers=None, params=None):
            return FakeResp(200, [{"id": TRIP_ID, "name": "Japón"}])

        async def post(self, url, headers=None, json=None):
            if url.endswith("/rpc/add_share_peer"):
                return FakeResp(400, {"message": "not a share peer"})
            return FakeResp(200, {})

    with (
        patch("trip_share.enforce_usage", new=AsyncMock(return_value=None)),
        patch("trip_share.httpx.AsyncClient", FakeClient),
        patch.dict(
            "os.environ",
            {"SUPABASE_URL": "https://sb.example", "SUPABASE_ANON_KEY": "anon"},
            clear=False,
        ),
    ):
        try:
            r = _client().post(
                f"/trips/{TRIP_ID}/invites",
                json={"userId": stranger},
                headers={"Authorization": "Bearer jwt-owner"},
            )
        finally:
            app.dependency_overrides.clear()

    assert r.status_code == 403
    assert "existe" not in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_confirm_signup_email_mismatch(monkeypatch):
    from trip_share import confirm_signup, ConfirmSignupBody

    async def lookup(_token):
        return {
            "email": "destino@example.com",
            "expires_at": "2099-01-01T00:00:00+00:00",
            "trip_name": "Japón",
        }

    class FakeResp:
        status_code = 200

        def json(self):
            return {
                "email": "otro@example.com",
                "email_confirmed_at": None,
                "created_at": "2099-01-01T00:00:00Z",
            }

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, headers=None):
            return FakeResp()

    monkeypatch.setenv("SUPABASE_URL", "https://sb.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service")
    with (
        patch("trip_share._lookup_invite", new=lookup),
        patch("trip_share.httpx.AsyncClient", FakeClient),
    ):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await confirm_signup(
                "tok",
                ConfirmSignupBody.model_validate({"userId": str(uuid4())}),
            )
        assert exc.value.status_code == 403


class _Req:
    headers = {"fly-client-ip": "203.0.113.80"}
    client = None


@pytest.mark.asyncio
async def test_complete_signup_creates_confirmed_user(monkeypatch):
    from trip_share import complete_signup, CompleteSignupBody

    posted: dict = {}

    async def lookup(_token):
        return {
            "email": "destino@example.com",
            "expires_at": "2099-01-01T00:00:00+00:00",
            "trip_name": "Japón",
        }

    class FakeResp:
        status_code = 200
        text = "{}"

        def json(self):
            return {"id": "new-user"}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            posted["url"] = url
            posted["json"] = json
            return FakeResp()

        async def put(self, *a, **k):
            raise AssertionError("el alta nueva no debe hacer PUT")

    monkeypatch.setenv("SUPABASE_URL", "https://sb.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service")
    monkeypatch.setattr("trip_share._allow_lookup_ip", lambda _ip: True)
    with (
        patch("trip_share._lookup_invite", new=lookup),
        patch("trip_share.peek_user", new=AsyncMock(return_value=None)),
        patch("trip_share.httpx.AsyncClient", FakeClient),
    ):
        out = await complete_signup(
            "tok",
            CompleteSignupBody.model_validate(
                {"password": "secret12", "displayName": "Ada"}
            ),
            request=_Req(),  # type: ignore[arg-type]
            authorization=None,
        )
    assert out == {"status": "created"}
    assert posted["json"]["email"] == "destino@example.com"
    assert posted["json"]["email_confirm"] is True
    assert posted["json"]["password"] == "secret12"
    assert posted["json"]["user_metadata"]["display_name"] == "Ada"
    assert posted["url"].endswith("/auth/v1/admin/users")


@pytest.mark.asyncio
async def test_complete_signup_existing_email_is_409(monkeypatch):
    from fastapi import HTTPException
    from trip_share import complete_signup, CompleteSignupBody

    async def lookup(_token):
        return {
            "email": "destino@example.com",
            "expires_at": "2099-01-01T00:00:00+00:00",
        }

    class FakeResp:
        status_code = 422
        text = '{"msg":"A user with this email address has already been registered"}'

        def json(self):
            return {"msg": "already registered"}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            return FakeResp()

    monkeypatch.setenv("SUPABASE_URL", "https://sb.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service")
    monkeypatch.setattr("trip_share._allow_lookup_ip", lambda _ip: True)
    with (
        patch("trip_share._lookup_invite", new=lookup),
        patch("trip_share.peek_user", new=AsyncMock(return_value=None)),
        patch("trip_share.httpx.AsyncClient", FakeClient),
    ):
        with pytest.raises(HTTPException) as exc:
            await complete_signup(
                "tok",
                CompleteSignupBody.model_validate({"password": "secret12"}),
                request=_Req(),  # type: ignore[arg-type]
                authorization=None,
            )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_complete_signup_upgrades_anonymous_guest(monkeypatch):
    from auth import AuthUser
    from trip_share import complete_signup, CompleteSignupBody

    put_json: dict = {}

    async def lookup(_token):
        return {
            "email": "destino@example.com",
            "expires_at": "2099-01-01T00:00:00+00:00",
        }

    class FakeResp:
        status_code = 200
        text = "{}"

        def json(self):
            return {"id": "guest-1"}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def put(self, url, headers=None, json=None):
            put_json["url"] = url
            put_json["json"] = json
            return FakeResp()

        async def post(self, *a, **k):
            raise AssertionError("el invitado no debe crear otro usuario")

    monkeypatch.setenv("SUPABASE_URL", "https://sb.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service")
    monkeypatch.setattr("trip_share._allow_lookup_ip", lambda _ip: True)
    guest = AuthUser(id="guest-1", email=None, is_anonymous=True)
    with (
        patch("trip_share._lookup_invite", new=lookup),
        patch("trip_share.peek_user", new=AsyncMock(return_value=guest)),
        patch("trip_share.httpx.AsyncClient", FakeClient),
    ):
        out = await complete_signup(
            "tok",
            CompleteSignupBody.model_validate({"password": "secret12", "displayName": "Ada"}),
            request=_Req(),  # type: ignore[arg-type]
            authorization="Bearer guest-jwt",
        )
    assert out == {"status": "upgraded"}
    assert put_json["json"]["email_confirm"] is True
    assert put_json["json"]["email"] == "destino@example.com"
    assert "guest-1" in put_json["url"]


@pytest.mark.asyncio
async def test_get_invite_flags_existing_account(monkeypatch):
    from trip_share import get_invite

    async def lookup(_token):
        return {
            "email": "ya@example.com",
            "trip_name": "Japón",
            "inviter_name": "Ana",
            "expires_at": "2099-01-01T00:00:00+00:00",
        }

    async def has_account(email, client=None):
        return email == "ya@example.com"

    monkeypatch.setattr("trip_share._allow_lookup_ip", lambda _ip: True)
    monkeypatch.setattr("trip_share._lookup_invite", lookup)
    monkeypatch.setattr("trip_share._email_has_account", has_account)

    out = await get_invite("tok", request=_Req())  # type: ignore[arg-type]
    assert out["status"] == "valid"
    assert out["hasAccount"] is True
    assert out["email"] == "ya@example.com"
