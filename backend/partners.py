"""
Políticas del pre-warm de partners (POST /partners/prewarm).

Sin rutas: viven en main.py para reutilizar la destilación. Aquí solo Turnstile
(fail-closed en producción), guardia SSRF y límites de abuso.
"""
from __future__ import annotations

import ipaddress
import logging
import os
import socket
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse

import httpx

from auth import _require_auth
from obs import log_kv
from usage import count_kind_events

logger = logging.getLogger(__name__)

_TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
_ALLOWED_PORTS = {None, 80, 443}

_day: date | None = None
_ip_counts: dict[str, int] = {}


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if raw.isdigit():
        return max(int(raw), 0)
    return default


def _turnstile_secret() -> str:
    return (os.getenv("TURNSTILE_SECRET_KEY") or "").strip()


class TurnstileUnavailable(Exception):
    """REQUIRE_AUTH activo y falta TURNSTILE_SECRET_KEY (fail-closed)."""


async def verify_turnstile(token: str | None, remote_ip: str | None) -> bool:
    """
    Verifica el token con Cloudflare siteverify.

    Fail-closed si REQUIRE_AUTH está activo y no hay TURNSTILE_SECRET_KEY
    (lanza TurnstileUnavailable). Fail-open solo en local sin secret.
    """
    secret = _turnstile_secret()
    if not secret:
        if _require_auth():
            raise TurnstileUnavailable(
                "TURNSTILE_SECRET_KEY no configurada; prewarm no disponible"
            )
        return True

    if not (token or "").strip():
        return False

    data: dict[str, str] = {
        "secret": secret,
        "response": token.strip(),
    }
    if remote_ip:
        data["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(_TURNSTILE_VERIFY_URL, data=data)
            if r.status_code != 200:
                log_kv(
                    logger,
                    event="turnstile_verify_failed",
                    status=r.status_code,
                )
                return False
            body = r.json()
            return bool(body.get("success"))
    except Exception as e:
        log_kv(
            logger,
            event="turnstile_verify_failed",
            error=type(e).__name__,
        )
        return False


def is_public_http_url(url: str) -> bool:
    """
    Guardia SSRF básica antes de fetch_article.

    Exige http(s), sin userinfo, puerto 80/443/ninguno, y resuelve el host
    rechazando IPs privadas/loopback/link-local/reservadas.

    Es síncrona (getaddrinfo bloquea): desde handlers async llamar con
    `await asyncio.to_thread(is_public_http_url, url)`.

    Riesgo residual aceptado: una redirección posterior a una IP interna no se
    re-valida (fetch_article sigue redirecciones).
    """
    raw = (url or "").strip()
    if not raw or len(raw) > 2048:
        return False
    try:
        parsed = urlparse(raw)
    except Exception:
        return False

    if parsed.scheme not in ("http", "https"):
        return False
    if parsed.username is not None or parsed.password is not None:
        return False
    if parsed.port not in _ALLOWED_PORTS:
        return False

    host = parsed.hostname
    if not host:
        return False

    # Hostname literal IP
    try:
        ip = ipaddress.ip_address(host)
        return _is_public_ip(ip)
    except ValueError:
        pass

    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False

    if not infos:
        return False

    for info in infos:
        sockaddr = info[4]
        if not sockaddr:
            continue
        try:
            ip = ipaddress.ip_address(sockaddr[0])
        except ValueError:
            return False
        if not _is_public_ip(ip):
            return False
    return True


def _is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def allow_prewarm(ip: str | None) -> bool:
    """
    Tope diario por IP en memoria (primera línea barata).
    Env PARTNER_PREWARM_MAX_IP_DAY (default 10). Pérdida en reinicio aceptable.
    """
    global _day, _ip_counts
    today = date.today()
    if _day != today:
        _day = today
        _ip_counts = {}

    limit = _env_int("PARTNER_PREWARM_MAX_IP_DAY", 10)
    if limit == 0:
        return False

    key = (ip or "").strip() or "unknown"
    used = _ip_counts.get(key, 0)
    if used >= limit:
        logger.warning(
            "PARTNER_PREWARM_MAX_IP_DAY (%s) alcanzado para %s",
            limit,
            key,
        )
        return False
    _ip_counts[key] = used + 1
    return True


async def allow_prewarm_global() -> bool:
    """
    Cap global diario durable: cuenta filas partner_prewarm de las últimas 24 h
    en usage_events. Env PARTNER_PREWARM_MAX_DAY (default 200).
    """
    limit = _env_int("PARTNER_PREWARM_MAX_DAY", 200)
    if limit == 0:
        return False
    since = datetime.now(timezone.utc) - timedelta(days=1)
    used = await count_kind_events("partner_prewarm", since=since)
    if used >= limit:
        logger.warning(
            "PARTNER_PREWARM_MAX_DAY (%s) alcanzado; usados=%s",
            limit,
            used,
        )
        return False
    return True
