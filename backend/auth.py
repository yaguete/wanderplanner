"""
Verificación del JWT de Supabase en el backend.

Supabase firma los access tokens con claves asimétricas (ES256/RS256) publicadas en el JWKS del
proyecto, o con el secreto HS256 heredado. Soportamos ambos: si hay `SUPABASE_JWT_SECRET` se
valida con él; si no, se descarga el JWKS de `SUPABASE_URL`, se elige la clave por `kid` y se
cachea en memoria.

Con `REQUIRE_AUTH=false` (por defecto en local) la dependencia deja pasar peticiones sin token.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import Header, HTTPException
from jose import jwt
from jose.exceptions import JWTError

JWKS_TTL_SECONDS = 3600

_jwks_cache: dict[str, Any] | None = None
_jwks_fetched_at: float = 0.0


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None
    is_anonymous: bool


def _require_auth() -> bool:
    return (os.getenv("REQUIRE_AUTH") or "").strip().lower() in ("1", "true", "yes")


def _jwks_url() -> str | None:
    base = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    if not base:
        return None
    return f"{base}/auth/v1/.well-known/jwks.json"


async def _get_jwks() -> dict[str, Any] | None:
    global _jwks_cache, _jwks_fetched_at
    now = time.time()
    if _jwks_cache is not None and now - _jwks_fetched_at < JWKS_TTL_SECONDS:
        return _jwks_cache

    url = _jwks_url()
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return _jwks_cache
            _jwks_cache = r.json()
            _jwks_fetched_at = now
    except Exception:
        return _jwks_cache
    return _jwks_cache


def _jwk_for_token(token: str, jwks: dict[str, Any]) -> dict[str, Any]:
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise HTTPException(status_code=401, detail="Token de sesión inválido") from e

    kid = header.get("kid")
    keys = jwks.get("keys") if isinstance(jwks, dict) else None
    if not isinstance(keys, list) or not keys:
        raise HTTPException(status_code=500, detail="JWKS sin claves")

    if kid:
        for key in keys:
            if isinstance(key, dict) and key.get("kid") == kid:
                return key

    # Un solo key o sin kid: usar la primera clave usable.
    for key in keys:
        if isinstance(key, dict) and key.get("kty"):
            return key
    raise HTTPException(status_code=500, detail="JWKS sin clave compatible")


async def _decode(token: str) -> dict[str, Any]:
    secret = (os.getenv("SUPABASE_JWT_SECRET") or "").strip()
    options = {"verify_aud": False}

    if secret:
        return jwt.decode(token, secret, algorithms=["HS256"], options=options)

    jwks = await _get_jwks()
    keys = (jwks or {}).get("keys") if isinstance(jwks, dict) else None
    if isinstance(keys, list) and keys:
        key = _jwk_for_token(token, jwks)  # type: ignore[arg-type]
        alg = key.get("alg") or jwt.get_unverified_header(token).get("alg") or "ES256"
        return jwt.decode(token, key, algorithms=[alg, "ES256", "RS256"], options=options)

    # Local sin JWKS/secret: si REQUIRE_AUTH no está activo, lee claims sin verificar
    # (el front ya autenticó con Supabase). En producción pon SUPABASE_JWT_SECRET o JWKS.
    if not _require_auth():
        return jwt.get_unverified_claims(token)

    raise HTTPException(
        status_code=500,
        detail="No se puede verificar el token: configura SUPABASE_URL o SUPABASE_JWT_SECRET",
    )


async def require_user(
    authorization: str | None = Header(default=None),
) -> AuthUser | None:
    """
    Dependencia FastAPI: devuelve el usuario del token o None si la auth no es obligatoria.
    """
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

    if not token:
        if _require_auth():
            raise HTTPException(status_code=401, detail="Falta el token de sesión")
        return None

    try:
        claims = await _decode(token)
    except HTTPException:
        raise
    except JWTError:
        raise HTTPException(status_code=401, detail="Token de sesión inválido")

    user_id = str(claims.get("sub") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Token de sesión sin usuario")

    return AuthUser(
        id=user_id,
        email=(claims.get("email") or None),
        is_anonymous=claims.get("is_anonymous") is True,
    )
