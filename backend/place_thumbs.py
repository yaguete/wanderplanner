"""
GET /thumb?q=<consulta> — miniatura vía Google Places (New), con caché global en `place_thumbs`.

No desplegar a producción sin T1.2 (metering). Cinturón mínimo: longitud de q + MAX_PHOTO_LOOKUPS_DAY.

Política Places Photo (docs Google, julio 2026 — Place Photos New / photos.getMedia):
  - Con skipHttpRedirect=true, `photoUri` es *short-lived* y NO debe persistirse como única
    referencia duradera. TTL conservador en DB: ~45 min (`photo_uri_expires_at`).
  - El `name` del recurso (`places/…/photos/…`) es lo que se guarda de forma duradera; si caduca,
    hay que repetir Text Search (New) para obtener un name fresco.
  - `photos/…/media` (getMedia) es facturable: un acierto de caché con URI fresca no llama a Google.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from auth import require_user
from photo_lookup import (
    allow_paid_lookup,
    is_miss_fresh,
    normalize_query,
    now_iso,
    photo_uri_expiry_iso,
    single_flight,
    supabase_config,
    supabase_headers,
    uri_still_fresh,
)

logger = logging.getLogger(__name__)

router = APIRouter()
TABLE = "place_thumbs"


def _google_key() -> str:
    return (os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_PLACES_API_KEY") or "").strip()


def _normalize_for_match(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _pick_best_google_place(places: list[dict], query: str) -> dict | None:
    if not places:
        return None
    q = _normalize_for_match(query)
    q_words = set(w for w in q.split() if len(w) >= 3)
    best: dict | None = None
    best_score = -1.0
    for p in places:
        name = ((p.get("displayName") or {}).get("text") or "").strip()
        addr = (p.get("formattedAddress") or "").strip()
        hay = _normalize_for_match(f"{name} {addr}")
        words = set(hay.split())
        overlap = len(q_words & words)
        has_photo = 1.0 if (p.get("photos") or []) else 0.0
        score = overlap + has_photo * 0.5
        if score > best_score:
            best_score = score
            best = p
    return best


async def _get_row(client: httpx.AsyncClient, base: str, key: str, query: str) -> dict | None:
    r = await client.get(
        f"{base}/rest/v1/{TABLE}",
        params={"query": f"eq.{query}", "select": "*", "limit": "1"},
        headers=supabase_headers(key),
    )
    if r.status_code != 200:
        return None
    rows = r.json()
    if not isinstance(rows, list) or not rows:
        return None
    row = rows[0]
    return row if isinstance(row, dict) else None


async def _upsert_row(client: httpx.AsyncClient, base: str, key: str, row: dict[str, Any]) -> None:
    await client.post(
        f"{base}/rest/v1/{TABLE}",
        params={"on_conflict": "query"},
        headers={
            **supabase_headers(key),
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        json=row,
    )


async def _get_media_uri(client: httpx.AsyncClient, api_key: str, photo_name: str) -> str | None:
    # TODO(T1.2): meter solo los cache miss de Places (getMedia).
    mr = await client.get(
        f"https://places.googleapis.com/v1/{photo_name}/media",
        params={"maxWidthPx": "256", "maxHeightPx": "256", "skipHttpRedirect": "true"},
        headers={"X-Goog-Api-Key": api_key},
    )
    if mr.status_code != 200:
        return None
    uri = mr.json().get("photoUri")
    return uri if isinstance(uri, str) and uri.strip() else None


async def _search_photo_name(client: httpx.AsyncClient, api_key: str, query: str) -> str | None:
    # TODO(T1.2): meter solo los cache miss de Places (searchText).
    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.photos.name",
        "Content-Type": "application/json",
    }
    sr = await client.post(
        "https://places.googleapis.com/v1/places:searchText",
        headers=headers,
        json={"textQuery": query, "maxResultCount": 5, "languageCode": "es"},
    )
    if sr.status_code != 200:
        return None
    places = sr.json().get("places") or []
    if not places:
        return None
    best = _pick_best_google_place(places, query)
    if not isinstance(best, dict):
        return None
    photos = best.get("photos") or []
    if not photos:
        return None
    photo_name = (photos[0] or {}).get("name")
    if not isinstance(photo_name, str) or not photo_name.strip():
        return None
    return photo_name.strip()


async def _resolve_thumb(query: str) -> dict[str, Any]:
    api_key = _google_key()
    cfg = supabase_config()

    async with httpx.AsyncClient(timeout=15.0) as client:
        row: dict | None = None
        if cfg:
            base, skey = cfg
            try:
                row = await _get_row(client, base, skey, query)
            except Exception:
                row = None

        if row and row.get("miss") and is_miss_fresh(row.get("resolved_at")):
            return {"url": None}

        if row and not row.get("miss"):
            uri = row.get("photo_uri")
            if isinstance(uri, str) and uri.strip() and uri_still_fresh(row.get("photo_uri_expires_at")):
                return {"url": uri}

            photo_name = row.get("photo_name")
            if isinstance(photo_name, str) and photo_name.strip() and api_key:
                if not allow_paid_lookup():
                    return {"url": None}
                try:
                    fresh = await _get_media_uri(client, api_key, photo_name.strip())
                except Exception:
                    fresh = None
                if fresh and cfg:
                    base, skey = cfg
                    try:
                        await _upsert_row(
                            client,
                            base,
                            skey,
                            {
                                "query": query,
                                "photo_name": photo_name.strip(),
                                "photo_uri": fresh,
                                "photo_uri_expires_at": photo_uri_expiry_iso(),
                                "miss": False,
                                "resolved_at": now_iso(),
                            },
                        )
                    except Exception:
                        pass
                if fresh:
                    return {"url": fresh}
                # photo_name caducado → caer a searchText abajo

        if not api_key:
            return {"url": None}
        if not allow_paid_lookup():
            return {"url": None}

        try:
            photo_name = await _search_photo_name(client, api_key, query)
        except Exception:
            photo_name = None

        if not photo_name:
            if cfg:
                base, skey = cfg
                try:
                    await _upsert_row(
                        client,
                        base,
                        skey,
                        {
                            "query": query,
                            "photo_name": None,
                            "photo_uri": None,
                            "photo_uri_expires_at": None,
                            "miss": True,
                            "resolved_at": now_iso(),
                        },
                    )
                except Exception:
                    pass
            return {"url": None}

        try:
            uri = await _get_media_uri(client, api_key, photo_name)
        except Exception:
            uri = None

        if cfg:
            base, skey = cfg
            try:
                await _upsert_row(
                    client,
                    base,
                    skey,
                    {
                        "query": query,
                        "photo_name": photo_name,
                        "photo_uri": uri,
                        "photo_uri_expires_at": photo_uri_expiry_iso() if uri else None,
                        "miss": uri is None,
                        "resolved_at": now_iso(),
                    },
                )
            except Exception:
                pass

        return {"url": uri}


@router.get("/thumb")
async def get_thumb(q: str = Query(""), _user=Depends(require_user)):
    """
    Miniatura Places por consulta. 200 {"url": string|null}.

    No desplegar a producción sin T1.2.
    """
    query = normalize_query(q)
    if not query:
        return JSONResponse({"url": None})

    async def run() -> dict[str, Any]:
        return await _resolve_thumb(query)

    result = await single_flight(f"thumb:{query}", run)
    return JSONResponse(result)
