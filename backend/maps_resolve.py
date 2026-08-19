"""
POST /maps/resolve — despliega short links de Google Maps y extrae {lng,lat}.

Solo URLs que el artículo ya publicó. Allowlist de hosts Google en cada hop.
Caché global `maps_link_pins` (service_role). Kill switch MAPS_LINK_RESOLVE_ENABLED.
"""
from __future__ import annotations

import logging
import os
import re
from urllib.parse import parse_qs, urljoin, urlparse, urlunparse

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import AuthUser, require_user
from obs import log_kv
from partners import is_public_http_url
from usage import enforce_usage, record_event

logger = logging.getLogger(__name__)
router = APIRouter(tags=["maps"])

TABLE = "maps_link_pins"
MAX_URLS = 20
MAX_HOPS = 2
TIMEOUT_S = 3.0
_PIN_3D_4D = re.compile(r"!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)")
_AT_CAMERA = re.compile(r"@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)")
_PAIR = re.compile(r"^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$")
_GOOGLE_HOST = re.compile(r"^google\.[a-z]{2,}(?:\.[a-z]{2,})*$")
# Identificable, no Chrome de escritorio: ese UA recibe 200 DurableDeepLinkUi
# (HTML/JS, sin Location) y el unfurl no puede extraer coords.
_UA = "Mozilla/5.0 (compatible; WanderPlanner/1.0; +https://wanderplanner.ai)"


def _enabled() -> bool:
    raw = (os.getenv("MAPS_LINK_RESOLVE_ENABLED") or "true").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _config() -> tuple[str, str] | None:
    base = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not base or not key:
        return None
    return base, key


def _headers(key: str) -> dict[str, str]:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _hostname(url: str) -> str | None:
    try:
        host = urlparse(url.strip()).hostname
    except Exception:
        return None
    if not host:
        return None
    return host.lower().removeprefix("www.")


def is_google_maps_host(host: str | None) -> bool:
    if not host:
        return False
    h = host.lower().removeprefix("www.")
    if h in {"maps.app.goo.gl", "goo.gl", "google.com", "maps.google.com"}:
        return True
    if h.startswith("maps.google."):
        return True
    return bool(_GOOGLE_HOST.fullmatch(h))


def is_maps_url(href: str | None) -> bool:
    raw = (href or "").strip()
    if not raw:
        return False
    try:
        parsed = urlparse(raw)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = _hostname(raw)
    if not host or not is_google_maps_host(host):
        return False
    path = (parsed.path or "").lower()
    if host == "maps.app.goo.gl":
        return True
    if host == "goo.gl":
        return path.startswith("/maps")
    if host == "maps.google.com" or host.startswith("maps.google."):
        return True
    return "/maps" in path


def is_short_maps_url(href: str | None) -> bool:
    raw = (href or "").strip()
    if not raw:
        return False
    host = _hostname(raw)
    if host == "maps.app.goo.gl":
        return True
    try:
        path = (urlparse(raw).path or "").lower()
    except Exception:
        return False
    return host == "goo.gl" and path.startswith("/maps")


def canonicalize_maps_url(href: str) -> str:
    raw = href.strip()
    try:
        parsed = urlparse(raw)
        host = (parsed.hostname or "").lower()
        path = (parsed.path or "").rstrip("/")
        short = is_short_maps_url(raw)
        netloc = parsed.netloc.lower()
        if short:
            return urlunparse((parsed.scheme, netloc, path, "", "", ""))
        return urlunparse((parsed.scheme, netloc, path, "", parsed.query, ""))
    except Exception:
        return raw.rstrip("/").lower()


def _as_coord(lat: float, lng: float) -> tuple[float, float] | None:
    if lat != lat or lng != lng:  # NaN
        return None
    if lat == 0.0 and lng == 0.0:
        return None
    if lat < -90 or lat > 90 or lng < -180 or lng > 180:
        return None
    return (lng, lat)


def parse_maps_coords(href: str | None) -> tuple[float, float] | None:
    """(lng, lat) o None. Descarta /dir/ y /search/."""
    raw = (href or "").strip()
    if not raw or not is_maps_url(raw):
        return None
    try:
        parsed = urlparse(raw)
    except Exception:
        return None
    path = (parsed.path or "").lower()
    # `/maps/d/` es un visor My Maps: `ll=` es el centro del overlay, no un POI.
    if "/dir/" in path or "/search/" in path or "/maps/d/" in path:
        return None
    pin = _PIN_3D_4D.search(raw)
    if pin:
        coord = _as_coord(float(pin.group(1)), float(pin.group(2)))
        if coord:
            return coord
    qs = parse_qs(parsed.query)
    for key in ("q", "query", "ll"):
        values = qs.get(key) or []
        if not values:
            continue
        m = _PAIR.match(values[0].strip())
        if not m:
            continue
        coord = _as_coord(float(m.group(1)), float(m.group(2)))
        if coord:
            return coord
    at = _AT_CAMERA.search(raw)
    if at:
        return _as_coord(float(at.group(1)), float(at.group(2)))
    return None


def hop_allowed(url: str) -> bool:
    """Host Google Maps + SSRF público. Revalidar en cada redirect."""
    if not is_public_http_url(url):
        return False
    return is_google_maps_host(_hostname(url))


async def unfurl_maps_url(url: str, client: httpx.AsyncClient) -> str | None:
    """Sigue hasta MAX_HOPS Location; None si el hop no es Google o no hay coords."""
    current = url.strip()
    if not hop_allowed(current):
        return None
    seen: set[str] = set()
    for _ in range(MAX_HOPS + 1):
        key = canonicalize_maps_url(current)
        if key in seen:
            return None
        seen.add(key)
        if parse_maps_coords(current) is not None:
            return current
        if not is_short_maps_url(current):
            return None
        try:
            r = await client.get(
                current,
                headers={"User-Agent": _UA, "Accept": "text/html"},
                follow_redirects=False,
            )
        except Exception as e:
            log_kv(logger, event="maps_unfurl_error", error=type(e).__name__)
            return None
        location = (r.headers.get("location") or "").strip()
        if not location:
            return None
        nxt = urljoin(current, location)
        if not hop_allowed(nxt):
            log_kv(logger, event="maps_unfurl_blocked_hop", host=_hostname(nxt) or "")
            return None
        current = nxt
    return current if parse_maps_coords(current) else None


async def _get_cached(url: str) -> tuple[float, float] | None:
    cfg = _config()
    if not cfg:
        return None
    base, key = cfg
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                f"{base}/rest/v1/{TABLE}",
                params={"url": f"eq.{url}", "select": "lng,lat", "limit": "1"},
                headers=_headers(key),
            )
            if r.status_code != 200:
                return None
            rows = r.json()
            if not isinstance(rows, list) or not rows:
                return None
            row = rows[0]
            lng, lat = row.get("lng"), row.get("lat")
            if isinstance(lng, (int, float)) and isinstance(lat, (int, float)):
                return _as_coord(float(lat), float(lng))
    except Exception:
        return None
    return None


async def _store_cached(url: str, lng: float, lat: float) -> None:
    cfg = _config()
    if not cfg:
        return
    base, key = cfg
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.post(
                f"{base}/rest/v1/{TABLE}",
                headers={**_headers(key), "Prefer": "resolution=merge-duplicates,return=minimal"},
                json={"url": url, "lng": lng, "lat": lat},
            )
    except Exception as e:
        log_kv(logger, event="maps_pin_store_failed", error=type(e).__name__)


class ResolveRequest(BaseModel):
    urls: list[str] = Field(default_factory=list, max_length=MAX_URLS)


class MapsPin(BaseModel):
    url: str
    lng: float
    lat: float


class ResolveResponse(BaseModel):
    pins: list[MapsPin] = Field(default_factory=list)
    disabled: bool = False


async def resolve_one(url: str, client: httpx.AsyncClient) -> tuple[float, float] | None:
    """Devuelve (lng, lat). Fail-open: None si no se puede."""
    raw = url.strip()
    if not raw or not is_maps_url(raw):
        return None
    key = canonicalize_maps_url(raw)
    cached = await _get_cached(key)
    if cached is not None:
        return cached
    direct = parse_maps_coords(raw)
    if direct is not None:
        await _store_cached(key, direct[0], direct[1])
        return direct
    if not is_short_maps_url(raw):
        return None
    final = await unfurl_maps_url(raw, client)
    if not final:
        return None
    coord = parse_maps_coords(final)
    if coord is None:
        return None
    await _store_cached(key, coord[0], coord[1])
    return coord


@router.post("/maps/resolve", response_model=ResolveResponse)
async def maps_resolve(
    body: ResolveRequest,
    user: AuthUser = Depends(require_user),
) -> ResolveResponse:
    if not _enabled():
        return ResolveResponse(pins=[], disabled=True)

    incoming: list[str] = []
    seen: set[str] = set()
    for raw in body.urls:
        href = (raw or "").strip()
        if not href or not is_maps_url(href):
            continue
        key = canonicalize_maps_url(href)
        if key in seen:
            continue
        seen.add(key)
        incoming.append(href)
        if len(incoming) >= MAX_URLS:
            break

    if not incoming:
        return ResolveResponse(pins=[])

    # Cuota solo si hay que salir a Google (miss de caché + short link).
    need_unfurl: list[str] = []
    cached_pins: list[MapsPin] = []
    for href in incoming:
        key = canonicalize_maps_url(href)
        cached = await _get_cached(key)
        if cached is not None:
            cached_pins.append(MapsPin(url=href, lng=cached[0], lat=cached[1]))
            continue
        direct = parse_maps_coords(href)
        if direct is not None:
            await _store_cached(key, direct[0], direct[1])
            cached_pins.append(MapsPin(url=href, lng=direct[0], lat=direct[1]))
            continue
        if is_short_maps_url(href):
            need_unfurl.append(href)

    if need_unfurl:
        await enforce_usage(user, "maps_resolve")

    fresh: list[MapsPin] = []
    if need_unfurl:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            for href in need_unfurl:
                coord = await resolve_one(href, client)
                if coord is None:
                    continue
                fresh.append(MapsPin(url=href, lng=coord[0], lat=coord[1]))
        if fresh:
            await record_event(user.id, "maps_resolve", cost_hint=len(fresh))

    log_kv(
        logger,
        event="maps_resolve",
        n=len(incoming),
        cached=len(cached_pins),
        fresh=len(fresh),
    )
    return ResolveResponse(pins=[*cached_pins, *fresh])
