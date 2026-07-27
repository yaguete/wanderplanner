"""
GET /cover?q=<zona> — portada Unsplash con caché global en `destination_covers`.

No desplegar a producción sin T1.2 (metering). Cinturón mínimo: longitud de q + MAX_PHOTO_LOOKUPS_DAY.

Términos Unsplash: al servir una foto por primera vez (cache miss que encuentra resultado) se
dispara `download_location`. La respuesta incluye `author_name` / `author_url` para que la UI
pueda atribuir (pintar atribución queda fuera de esta tarea).
"""
from __future__ import annotations

import logging
import os
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
    single_flight,
    supabase_config,
    supabase_headers,
)

logger = logging.getLogger(__name__)

router = APIRouter()
TABLE = "destination_covers"


def _unsplash_key() -> str:
    return (os.getenv("UNSPLASH_ACCESS_KEY") or "").strip()


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


async def _trigger_download(client: httpx.AsyncClient, api_key: str, download_location: str) -> None:
    """Requisito de los términos de Unsplash al usar una foto en producción."""
    try:
        await client.get(
            download_location,
            headers={"Authorization": f"Client-ID {api_key}"},
            timeout=10.0,
        )
    except Exception:
        logger.warning("No se pudo disparar Unsplash download_location", exc_info=True)


def _empty_cover() -> dict[str, Any]:
    return {"url": None, "author_name": None, "author_url": None}


async def _resolve_cover(query: str) -> dict[str, Any]:
    api_key = _unsplash_key()
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
            return _empty_cover()

        if row and not row.get("miss"):
            url = row.get("photo_url")
            if isinstance(url, str) and url.strip():
                return {
                    "url": url,
                    "author_name": row.get("author_name"),
                    "author_url": row.get("author_url"),
                }

        if not api_key:
            return _empty_cover()
        if not allow_paid_lookup():
            return _empty_cover()

        # TODO(T1.2): meter solo los cache miss de Unsplash.
        search_q = f"{query} travel landscape"
        try:
            r = await client.get(
                "https://api.unsplash.com/search/photos",
                params={
                    "query": search_q,
                    "per_page": "1",
                    "orientation": "landscape",
                    "content_filter": "high",
                },
                headers={"Authorization": f"Client-ID {api_key}"},
            )
        except Exception:
            return _empty_cover()

        if r.status_code != 200:
            return _empty_cover()

        results = (r.json().get("results") or [])
        photo = results[0] if results else None
        if not isinstance(photo, dict):
            if cfg:
                base, skey = cfg
                try:
                    await _upsert_row(
                        client,
                        base,
                        skey,
                        {
                            "query": query,
                            "photo_url": None,
                            "author_name": None,
                            "author_url": None,
                            "download_location": None,
                            "miss": True,
                            "resolved_at": now_iso(),
                        },
                    )
                except Exception:
                    pass
            return _empty_cover()

        raw = (photo.get("urls") or {}).get("raw")
        if not isinstance(raw, str) or not raw.strip():
            if cfg:
                base, skey = cfg
                try:
                    await _upsert_row(
                        client,
                        base,
                        skey,
                        {
                            "query": query,
                            "photo_url": None,
                            "author_name": None,
                            "author_url": None,
                            "download_location": None,
                            "miss": True,
                            "resolved_at": now_iso(),
                        },
                    )
                except Exception:
                    pass
            return _empty_cover()

        url = f"{raw}&w=600&h=300&fit=crop&q=80"
        user = photo.get("user") or {}
        author_name = user.get("name") if isinstance(user, dict) else None
        links = user.get("links") if isinstance(user, dict) else None
        author_url = links.get("html") if isinstance(links, dict) else None
        download_location = (photo.get("links") or {}).get("download_location")
        if not isinstance(download_location, str):
            download_location = None

        if download_location:
            await _trigger_download(client, api_key, download_location)

        if cfg:
            base, skey = cfg
            try:
                await _upsert_row(
                    client,
                    base,
                    skey,
                    {
                        "query": query,
                        "photo_url": url,
                        "author_name": author_name if isinstance(author_name, str) else None,
                        "author_url": author_url if isinstance(author_url, str) else None,
                        "download_location": download_location,
                        "miss": False,
                        "resolved_at": now_iso(),
                    },
                )
            except Exception:
                pass

        return {
            "url": url,
            "author_name": author_name if isinstance(author_name, str) else None,
            "author_url": author_url if isinstance(author_url, str) else None,
        }


@router.get("/cover")
async def get_cover(q: str = Query(""), _user=Depends(require_user)):
    """
    Portada Unsplash por zona. 200 {"url", "author_name", "author_url"} (nulls si no hay foto).

    La UI debe mostrar atribución cuando haya author_*. No desplegar a producción sin T1.2.
    """
    query = normalize_query(q)
    if not query:
        return JSONResponse(_empty_cover())

    async def run() -> dict[str, Any]:
        return await _resolve_cover(query)

    result = await single_flight(f"cover:{query}", run)
    return JSONResponse(result)
