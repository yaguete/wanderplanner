"""
Proxy autenticado de búsquedas de lugares (T4B.3 §9.11).

Kill switch: TRANSPORT_PLACE_SEARCH_ENABLED=false
Límites: usage_events kind place_suggest / transport_hub
Token de Mapbox solo en servidor (MAPBOX_ACCESS_TOKEN o MAPBOX_TOKEN).
"""
from __future__ import annotations

import logging
import os
from typing import Any, Literal
import math
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import AuthUser, require_user
from obs import log_kv
from usage import enforce_usage, record_event

logger = logging.getLogger(__name__)
router = APIRouter(tags=["places"])

HubKind = Literal["airport", "station", "busStation"]

SEARCH_BOX_CATEGORY: dict[str, str] = {
    "airport": "airport",
    "station": "railway_station,metro_station,light_rail_station",
    "busStation": "bus_station,bus_stop",
}


def _enabled() -> bool:
    raw = (os.getenv("TRANSPORT_PLACE_SEARCH_ENABLED") or "true").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _mapbox_token() -> str:
    return (os.getenv("MAPBOX_ACCESS_TOKEN") or os.getenv("MAPBOX_TOKEN") or "").strip()


class SuggestResponse(BaseModel):
    suggestions: list[dict[str, Any]] = Field(default_factory=list)
    disabled: bool = False


class HubsResponse(BaseModel):
    hubs: list[dict[str, Any]] = Field(default_factory=list)
    disabled: bool = False


@router.get("/places/suggest", response_model=SuggestResponse)
async def places_suggest(
    q: str = Query(..., min_length=3, max_length=200),
    limit: int = Query(6, ge=1, le=10),
    permanent: bool = Query(True),
    user: AuthUser = Depends(require_user),
) -> SuggestResponse:
    if not _enabled():
        return SuggestResponse(suggestions=[], disabled=True)
    token = _mapbox_token()
    if not token:
        raise HTTPException(status_code=503, detail="Mapbox no configurado en el servidor.")

    await enforce_usage(user, "place_suggest")
    params: dict[str, str] = {
        "access_token": token,
        "limit": str(limit),
        "autocomplete": "true",
        "language": "es",
    }
    # El permanente es un endpoint distinto, no un parámetro: mapbox.places
    # ignora en silencio `permanent=true` y responde 200 igual, así que pedirlo
    # por query devolvía resultados temporales creyendo que eran persistibles.
    dataset = "mapbox.places-permanent" if permanent else "mapbox.places"
    url = f"https://api.mapbox.com/geocoding/v5/{dataset}/{quote(q)}.json"

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                log_kv(logger, event="place_suggest_upstream", status=r.status_code)
                return SuggestResponse(suggestions=[])
            data = r.json()
    except Exception as e:
        log_kv(logger, event="place_suggest_error", error=type(e).__name__)
        return SuggestResponse(suggestions=[])

    out: list[dict[str, Any]] = []
    for f in data.get("features") or []:
        center = f.get("center")
        if not center or len(center) < 2:
            continue
        place_name = (f.get("place_name") or "").strip()
        if not place_name:
            continue
        out.append(
            {
                "id": f.get("id") or place_name,
                "placeName": place_name,
                "text": (f.get("text") or place_name).strip(),
                "center": {"lng": center[0], "lat": center[1]},
            }
        )

    await record_event(user.id, "place_suggest", cost_hint=1)
    return SuggestResponse(suggestions=out)


@router.get("/transport-hubs", response_model=HubsResponse)
async def transport_hubs(
    kind: HubKind,
    lng: float = Query(...),
    lat: float = Query(...),
    limit: int = Query(5, ge=1, le=10),
    user: AuthUser = Depends(require_user),
) -> HubsResponse:
    if not _enabled():
        return HubsResponse(hubs=[], disabled=True)
    token = _mapbox_token()
    if not token:
        raise HTTPException(status_code=503, detail="Mapbox no configurado en el servidor.")

    await enforce_usage(user, "transport_hub")
    category = SEARCH_BOX_CATEGORY[kind]
    # ~200 km bbox (mismo criterio que el front): proximity solo no basta en Asia.
    lat_delta = 200 / 111.0
    cos = math.cos(math.radians(lat))
    lng_delta = 200 / (111.0 * max(0.2, abs(cos)))
    bbox = f"{lng - lng_delta:.5f},{lat - lat_delta:.5f},{lng + lng_delta:.5f},{lat + lat_delta:.5f}"
    params = {
        "access_token": token,
        "language": "es",
        "limit": str(min(max(limit, 1), 10)),
        "proximity": f"{lng},{lat}",
        "bbox": bbox,
    }
    url = f"https://api.mapbox.com/search/searchbox/v1/category/{quote(category, safe=',')}"

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                log_kv(logger, event="transport_hub_upstream", status=r.status_code)
                return HubsResponse(hubs=[])
            data = r.json()
    except Exception as e:
        log_kv(logger, event="transport_hub_error", error=type(e).__name__)
        return HubsResponse(hubs=[])

    out: list[dict[str, Any]] = []
    for f in data.get("features") or []:
        props = f.get("properties") or {}
        coords = props.get("coordinates") or {}
        lon = coords.get("longitude")
        la = coords.get("latitude")
        if lon is None or la is None:
            geom = f.get("geometry") or {}
            c = geom.get("coordinates")
            if c and len(c) >= 2:
                lon, la = c[0], c[1]
            else:
                continue
        label = (props.get("name_preferred") or props.get("name") or "").strip()
        if not label:
            continue
        out.append(
            {
                "id": props.get("mapbox_id") or f"{kind}-{lon}-{la}",
                "label": label,
                "center": {"lng": lon, "lat": la},
                "kind": kind,
            }
        )

    await record_event(user.id, "transport_hub", cost_hint=1)
    return HubsResponse(hubs=out)
