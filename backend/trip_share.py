"""Invitaciones a un viaje: el dueño invita por email o elige un compañero ya compartido."""
from __future__ import annotations

import hashlib
import logging
import os
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from auth import AuthUser, VerifiedUser, peek_user, require_verified_user
from emails import (
    INVITE_TTL_DAYS,
    configured_inviter_name,
    send_added_email,
    send_invite_email,
)
from obs import log_kv
from usage import enforce_usage, record_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["trip-share"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_LOOKUP_MAX_IP = int(os.getenv("INVITE_LOOKUP_MAX_IP_DAY") or "60")
_ip_day: date | None = None
_ip_counts: dict[str, int] = {}


class InviteBody(BaseModel):
    email: str | None = None
    user_id: UUID | None = Field(default=None, alias="userId")

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def _one_of(self) -> InviteBody:
        has_email = bool((self.email or "").strip())
        has_uid = self.user_id is not None
        if has_email == has_uid:
            raise ValueError("Indica un email o un userId, no ambos")
        return self


class ConfirmSignupBody(BaseModel):
    user_id: str = Field(alias="userId")

    model_config = {"populate_by_name": True}


class CompleteSignupBody(BaseModel):
    password: str
    display_name: str | None = Field(default=None, alias="displayName")

    model_config = {"populate_by_name": True}


_MIN_PASSWORD = 6
_MAX_PASSWORD = 72


def _env(*names: str, default: str = "") -> str:
    for name in names:
        v = (os.getenv(name) or "").strip()
        if v:
            return v
    return default


def _anon_key() -> str:
    return _env("SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY")


def _service_key() -> str:
    return _env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY")


def _supabase_url() -> str:
    return _env("SUPABASE_URL").rstrip("/")


def _normalize_email(raw: str) -> str:
    return (raw or "").strip().lower()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _client_ip(request: Request) -> str:
    fly = (request.headers.get("fly-client-ip") or "").strip()
    if fly:
        return fly
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _allow_lookup_ip(ip: str) -> bool:
    global _ip_day, _ip_counts
    today = date.today()
    if _ip_day != today:
        _ip_day = today
        _ip_counts = {}
    used = _ip_counts.get(ip, 0)
    if used >= _LOOKUP_MAX_IP:
        return False
    _ip_counts[ip] = used + 1
    return True


def _headers(jwt: str, *, anon: bool) -> dict[str, str]:
    key = _anon_key() if anon else _service_key()
    return {
        "apikey": key,
        "Authorization": f"Bearer {jwt}",
        "Content-Type": "application/json",
    }


async def _rest_get(
    client: httpx.AsyncClient,
    path: str,
    *,
    jwt: str,
    anon: bool,
    params: dict[str, str] | None = None,
) -> httpx.Response:
    return await client.get(
        f"{_supabase_url()}/rest/v1/{path}",
        headers=_headers(jwt, anon=anon),
        params=params,
    )


async def _rest_post(
    client: httpx.AsyncClient,
    path: str,
    *,
    jwt: str,
    anon: bool,
    json: Any,
    prefer: str = "return=representation",
) -> httpx.Response:
    headers = _headers(jwt, anon=anon)
    headers["Prefer"] = prefer
    return await client.post(f"{_supabase_url()}/rest/v1/{path}", headers=headers, json=json)


async def _rest_patch(
    client: httpx.AsyncClient,
    path: str,
    *,
    jwt: str,
    anon: bool,
    json: Any,
    params: dict[str, str],
) -> httpx.Response:
    headers = _headers(jwt, anon=anon)
    headers["Prefer"] = "return=representation"
    return await client.patch(
        f"{_supabase_url()}/rest/v1/{path}",
        headers=headers,
        params=params,
        json=json,
    )


async def _rpc(
    client: httpx.AsyncClient,
    name: str,
    *,
    jwt: str,
    anon: bool,
    json: dict[str, Any] | None = None,
) -> httpx.Response:
    return await _rest_post(client, f"rpc/{name}", jwt=jwt, anon=anon, json=json or {})


def _as_usage_user(user: VerifiedUser) -> AuthUser:
    return AuthUser(id=user.id, email=user.email, is_anonymous=False)


def _rpc_error(r: httpx.Response) -> str:
    try:
        data = r.json()
        if isinstance(data, dict):
            return str(data.get("message") or data.get("details") or r.text or "")
    except Exception:
        pass
    return r.text or ""


async def _inviter_display_name(client: httpx.AsyncClient, user: VerifiedUser) -> str:
    profile_name = ""
    try:
        rows = _json_rows(
            await _rest_get(
                client,
                "profiles",
                jwt=user.token,
                anon=True,
                params={"id": f"eq.{user.id}", "select": "display_name"},
            )
        )
        if rows and isinstance(rows[0], dict):
            profile_name = str(rows[0].get("display_name") or "")
    except Exception:
        logger.debug("inviter_profile_lookup_failed", exc_info=True)
    meta = user.user_metadata if isinstance(user.user_metadata, dict) else {}
    return configured_inviter_name(
        profile_name,
        meta.get("display_name"),
        meta.get("full_name"),
        meta.get("name"),
    )


def _json_rows(r: httpx.Response) -> list[Any]:
    if r.status_code != 200:
        return []
    data = r.json()
    return data if isinstance(data, list) else []


async def _upsert_invite(
    client: httpx.AsyncClient,
    *,
    trip_id: UUID,
    email: str,
    token_hash: str,
    invited_by: str,
    expires: datetime,
    user_jwt: str,
) -> None:
    """Inserta o rota el token si ya hay una fila (trip_id, email)."""
    payload = {
        "token_hash": token_hash,
        "expires_at": expires.isoformat(),
    }
    lookup = {
        "trip_id": f"eq.{trip_id}",
        "email": f"eq.{email}",
        "select": "id",
        "limit": "1",
    }

    async def _patch(invite_id: str, jwt: str, anon: bool) -> httpx.Response:
        return await _rest_patch(
            client,
            "trip_invites",
            jwt=jwt,
            anon=anon,
            json=payload,
            params={"id": f"eq.{invite_id}"},
        )

    rows = _json_rows(
        await _rest_get(client, "trip_invites", jwt=user_jwt, anon=True, params=lookup)
    )
    if rows:
        patched = await _patch(str(rows[0]["id"]), user_jwt, True)
        if patched.status_code >= 400:
            log_kv(
                logger,
                event="invite_patch_failed",
                status=patched.status_code,
                body=(patched.text or "")[:500],
            )
            raise HTTPException(status_code=502, detail="No se pudo reenviar la invitación")
        return

    inserted = await _rest_post(
        client,
        "trip_invites",
        jwt=user_jwt,
        anon=True,
        json={
            "trip_id": str(trip_id),
            "email": email,
            "token_hash": token_hash,
            "invited_by": invited_by,
            "expires_at": expires.isoformat(),
        },
    )
    if inserted.status_code < 400:
        return

    body = inserted.text or ""
    logger.warning("invite_insert_failed status=%s body=%s", inserted.status_code, body[:500])
    msg = body.lower()
    if "share cap" in msg or "p0001" in msg or "23514" in msg:
        raise HTTPException(status_code=409, detail="Este viaje admite hasta 8 personas")
    if "schema cache" in msg or "could not find" in msg or inserted.status_code == 404:
        raise HTTPException(
            status_code=503,
            detail="Falta aplicar la migración de compartir viaje (tabla trip_invites).",
        )

    # 23505 / 409: la fila sigue ahí (el cancel no borró, o hay carrera) → rotar token.
    if "23505" in msg or inserted.status_code == 409:
        service = _service_key()
        if service:
            again = _json_rows(
                await _rest_get(
                    client,
                    "trip_invites",
                    jwt=service,
                    anon=False,
                    params=lookup,
                )
            )
            if again:
                patched = await _patch(str(again[0]["id"]), service, False)
                if patched.status_code < 400:
                    return
                log_kv(
                    logger,
                    event="invite_patch_failed",
                    status=patched.status_code,
                    body=(patched.text or "")[:500],
                )
        raise HTTPException(status_code=502, detail="No se pudo reenviar la invitación")
    raise HTTPException(status_code=502, detail="No se pudo crear la invitación")


@router.post("/trips/{trip_id}/invites")
async def create_invite(
    trip_id: UUID,
    body: InviteBody,
    user: VerifiedUser = Depends(require_verified_user),
) -> dict[str, Any]:
    if not _supabase_url() or not _anon_key():
        raise HTTPException(
            status_code=500,
            detail=(
                "Falta SUPABASE_ANON_KEY en backend/.env "
                "(la misma clave anon que NEXT_PUBLIC_SUPABASE_ANON_KEY). Reinicia uvicorn."
            ),
        )

    await enforce_usage(_as_usage_user(user), "trip_invite")

    async with httpx.AsyncClient(timeout=20.0) as client:
        owned = await _rest_get(
            client,
            "trips",
            jwt=user.token,
            anon=True,
            params={
                "id": f"eq.{trip_id}",
                "user_id": f"eq.{user.id}",
                "select": "id,name",
            },
        )
        if owned.status_code != 200:
            logger.warning(
                "invite_trip_check_failed status=%s body=%s",
                owned.status_code,
                (owned.text or "")[:400],
            )
            raise HTTPException(status_code=502, detail="No se pudo comprobar el viaje")
        rows = owned.json()
        if not isinstance(rows, list) or not rows:
            raise HTTPException(status_code=403, detail="Solo el dueño puede invitar")
        trip_name = str(rows[0].get("name") or "Viaje")

        if body.user_id is not None:
            rpc = await _rpc(
                client,
                "add_share_peer",
                jwt=user.token,
                anon=True,
                json={"p_trip_id": str(trip_id), "p_user_id": str(body.user_id)},
            )
            if rpc.status_code >= 400:
                msg = _rpc_error(rpc).lower()
                if "not a share peer" in msg or "not allowed" in msg:
                    raise HTTPException(status_code=403, detail="No puedes añadir a esa persona")
                if "cannot add self" in msg:
                    raise HTTPException(status_code=400, detail="Ese es tu usuario")
                if "share cap" in msg or "p0001" in msg:
                    raise HTTPException(
                        status_code=409,
                        detail="Este viaje admite hasta 8 personas",
                    )
                raise HTTPException(status_code=400, detail="No se pudo añadir")
            payload = rpc.json() if rpc.content else {}
            status = payload.get("status") if isinstance(payload, dict) else None
            await record_event(user.id, "trip_invite")
            await _notify_peer_added(
                client,
                user=user,
                trip_id=str(trip_id),
                trip_name=trip_name,
                peer_id=str(body.user_id),
            )
            return {"status": "added" if status != "already" else "already"}

        email = _normalize_email(body.email or "")
        if not email or not _EMAIL_RE.match(email):
            raise HTTPException(status_code=400, detail="Email no válido")
        if user.email and _normalize_email(user.email) == email:
            raise HTTPException(status_code=400, detail="Ese es tu correo")

        token = secrets.token_urlsafe(32)
        token_hash = _hash_token(token)
        expires = datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS)

        await _upsert_invite(
            client,
            trip_id=trip_id,
            email=email,
            token_hash=token_hash,
            invited_by=user.id,
            expires=expires,
            user_jwt=user.token,
        )

        email_sent = False
        try:
            email_sent = bool(
                await send_invite_email(
                    to=email,
                    inviter_name=await _inviter_display_name(client, user),
                    trip_name=trip_name,
                    token=token,
                )
            )
        except Exception:
            logger.warning("invite_email_error trip_id=%s", trip_id, exc_info=True)

        await record_event(user.id, "trip_invite")
        return {"status": "invited", "emailSent": email_sent}


@router.get("/invites/{token}")
async def get_invite(token: str, request: Request) -> dict[str, Any]:
    if not _allow_lookup_ip(_client_ip(request)):
        raise HTTPException(status_code=429, detail="Demasiadas consultas. Prueba más tarde.")
    row = await _lookup_invite(token)
    if row is None:
        return {"status": "unknown"}
    expires = row.get("expires_at")
    expired = False
    if isinstance(expires, str):
        try:
            expired = datetime.fromisoformat(expires.replace("Z", "+00:00")) <= datetime.now(
                timezone.utc
            )
        except ValueError:
            expired = False
    if expired:
        return {
            "status": "expired",
            "tripName": row.get("trip_name"),
            "inviterName": row.get("inviter_name"),
            "email": row.get("email"),
        }
    return {
        "status": "valid",
        "tripName": row.get("trip_name"),
        "inviterName": row.get("inviter_name"),
        "email": row.get("email"),
    }


@router.post("/invites/{token}/complete-signup")
async def complete_signup(
    token: str,
    body: CompleteSignupBody,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, str]:
    """Alta confirmada para quien abre el enlace de la invitación. Sin correo de confirmación."""
    if not _allow_lookup_ip(_client_ip(request)):
        raise HTTPException(status_code=429, detail="Demasiadas consultas. Prueba más tarde.")
    password = body.password or ""
    if len(password) < _MIN_PASSWORD or len(password) > _MAX_PASSWORD:
        raise HTTPException(
            status_code=400,
            detail="La contraseña debe tener al menos 6 caracteres.",
        )
    row = await _require_live_invite(token)
    email = _normalize_email(str(row.get("email") or ""))
    if not email:
        raise HTTPException(status_code=400, detail="La invitación no tiene email")
    display = (body.display_name or "").strip()[:80]
    meta = {"display_name": display} if display else {}

    service = _service_key()
    base = _supabase_url()
    if not service or not base:
        raise HTTPException(status_code=500, detail="Falta configuración de Supabase")
    headers = {"apikey": service, "Authorization": f"Bearer {service}"}
    guest = await peek_user(authorization)

    async with httpx.AsyncClient(timeout=15.0) as client:
        if guest is not None and guest.is_anonymous:
            patched = await client.put(
                f"{base}/auth/v1/admin/users/{guest.id}",
                headers=headers,
                json={
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": meta,
                },
            )
            if patched.status_code >= 400:
                logger.warning(
                    "invite_guest_upgrade_failed status=%s body=%s",
                    patched.status_code,
                    (patched.text or "")[:400],
                )
                raise HTTPException(status_code=502, detail="No se pudo crear la cuenta")
            return {"status": "upgraded"}

        created = await client.post(
            f"{base}/auth/v1/admin/users",
            headers=headers,
            json={
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": meta,
            },
        )
        if _gotrue_email_taken(created):
            raise HTTPException(
                status_code=409,
                detail="Ya hay una cuenta con este email. Entra o usa otro.",
            )
        if created.status_code >= 400:
            logger.warning(
                "invite_complete_signup_failed status=%s body=%s",
                created.status_code,
                (created.text or "")[:400],
            )
            raise HTTPException(status_code=502, detail="No se pudo crear la cuenta")
    return {"status": "created"}


@router.post("/invites/{token}/confirm-signup")
async def confirm_signup(token: str, body: ConfirmSignupBody) -> dict[str, str]:
    row = await _require_live_invite(token)

    service = _service_key()
    base = _supabase_url()
    if not service or not base:
        raise HTTPException(status_code=500, detail="Falta configuración de Supabase")

    async with httpx.AsyncClient(timeout=15.0) as client:
        got = await client.get(
            f"{base}/auth/v1/admin/users/{body.user_id}",
            headers={"apikey": service, "Authorization": f"Bearer {service}"},
        )
        if got.status_code != 200:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        data = got.json()
        email = _normalize_email(str(data.get("email") or ""))
        invite_email = _normalize_email(str(row.get("email") or ""))
        if not email or email != invite_email:
            raise HTTPException(status_code=403, detail="El email no coincide con la invitación")
        if data.get("email_confirmed_at"):
            return {"status": "already"}
        created = data.get("created_at")
        if isinstance(created, str):
            try:
                created_at = datetime.fromisoformat(created.replace("Z", "+00:00"))
                if datetime.now(timezone.utc) - created_at > timedelta(hours=1):
                    raise HTTPException(
                        status_code=403,
                        detail="La cuenta ya no se puede confirmar así",
                    )
            except HTTPException:
                raise
            except ValueError:
                pass
        patched = await client.put(
            f"{base}/auth/v1/admin/users/{body.user_id}",
            headers={"apikey": service, "Authorization": f"Bearer {service}"},
            json={"email_confirm": True},
        )
        if patched.status_code >= 400:
            raise HTTPException(status_code=502, detail="No se pudo confirmar el correo")
    return {"status": "confirmed"}


def _gotrue_email_taken(r: httpx.Response) -> bool:
    blob = (r.text or "").lower()
    if r.status_code in (409, 422) and (
        "already" in blob or "exists" in blob or "registered" in blob
    ):
        return True
    return False


async def _require_live_invite(token: str) -> dict[str, Any]:
    row = await _lookup_invite(token)
    if row is None:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")
    expires = row.get("expires_at")
    if isinstance(expires, str):
        try:
            if datetime.fromisoformat(expires.replace("Z", "+00:00")) <= datetime.now(
                timezone.utc
            ):
                raise HTTPException(status_code=410, detail="Esta invitación ha caducado")
        except HTTPException:
            raise
        except ValueError:
            pass
    return row


async def _lookup_invite(token: str) -> dict[str, Any] | None:
    service = _service_key()
    base = _supabase_url()
    if not service or not base:
        raise HTTPException(status_code=500, detail="Falta configuración de Supabase")
    token_hash = _hash_token(token)
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await _rpc(
            client,
            "lookup_invite_by_token_hash",
            jwt=service,
            anon=False,
            json={"p_token_hash": token_hash},
        )
    if r.status_code != 200:
        logger.warning(
            "invite_lookup_failed status=%s body=%s",
            r.status_code,
            (r.text or "")[:400],
        )
        return None
    rows = r.json()
    if isinstance(rows, list) and rows:
        return rows[0] if isinstance(rows[0], dict) else None
    if isinstance(rows, dict) and rows.get("email"):
        return rows
    return None


async def _notify_peer_added(
    client: httpx.AsyncClient,
    *,
    user: VerifiedUser,
    trip_id: str,
    trip_name: str,
    peer_id: str,
) -> None:
    service = _service_key()
    base = _supabase_url()
    email: str | None = None
    if service and base:
        got = await client.get(
            f"{base}/auth/v1/admin/users/{peer_id}",
            headers={"apikey": service, "Authorization": f"Bearer {service}"},
        )
        if got.status_code == 200:
            data = got.json()
            candidate = str(data.get("email") or "")
            if "@" in candidate:
                email = candidate
    if not email:
        return
    try:
        await send_added_email(
            to=email,
            inviter_name=await _inviter_display_name(client, user),
            trip_name=trip_name,
        )
    except Exception:
        log_kv(logger, event="peer_notify_skipped", trip_id=trip_id)
