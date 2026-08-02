"""
Caché global de extracciones por URL (`public.article_extractions` en Supabase).

Política stale-while-revalidate:
  - fresh  (< REVALIDATE_DAYS): servir al instante, sin revalidar
  - stale  (entre REVALIDATE y HARD_TTL): servir al instante + revalidar en fondo
  - expired / miss: flujo síncrono (fetch + Claude)

La clave de lookup es doble: `url` cruda y, si falla, `canonical_url` normalizada.
Acceso solo con `service_role`. Si faltan env vars, degrada a "sin caché".
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import httpx

from article_fetch import CONTENT_VERSION, normalize_article_url

TABLE = "article_extractions"
DEFAULT_REVALIDATE_DAYS = 15
DEFAULT_HARD_TTL_DAYS = 90

Freshness = Literal["fresh", "stale", "expired", "miss"]

_ROW_SELECT = (
    "url,canonical_url,payload,fetched_at,validated_at,"
    "etag,last_modified,article_modified_at,content_hash,content_version"
)


@dataclass
class CacheEntry:
    url: str
    canonical_url: str | None
    payload: dict[str, Any]
    fetched_at: datetime | None
    validated_at: datetime | None
    etag: str | None
    last_modified: str | None
    article_modified_at: datetime | None
    content_hash: str | None
    content_version: int | None
    freshness: Freshness


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


def _env_days(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if raw.isdigit():
        return max(int(raw), 0)
    return default


def revalidate_days() -> int:
    # EXTRACTION_REVALIDATE_DAYS gana; EXTRACTION_CACHE_TTL_DAYS queda como alias legacy
    # del hard TTL (ver hard_ttl_days).
    return _env_days("EXTRACTION_REVALIDATE_DAYS", DEFAULT_REVALIDATE_DAYS)


def hard_ttl_days() -> int:
    if (os.getenv("EXTRACTION_HARD_TTL_DAYS") or "").strip().isdigit():
        return _env_days("EXTRACTION_HARD_TTL_DAYS", DEFAULT_HARD_TTL_DAYS)
    # Compat: el TTL antiguo pasa a ser el hard TTL.
    if (os.getenv("EXTRACTION_CACHE_TTL_DAYS") or "").strip().isdigit():
        return _env_days("EXTRACTION_CACHE_TTL_DAYS", DEFAULT_HARD_TTL_DAYS)
    return DEFAULT_HARD_TTL_DAYS


def _parse_ts(raw: str | None) -> datetime | None:
    if not raw or not isinstance(raw, str):
        return None
    try:
        stamp = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def classify_freshness(validated_at: datetime | None, *, now: datetime | None = None) -> Freshness:
    if validated_at is None:
        return "expired"
    now = now or datetime.now(timezone.utc)
    age = now - validated_at
    soft = timedelta(days=revalidate_days())
    hard = timedelta(days=hard_ttl_days())
    if age < soft:
        return "fresh"
    if age < hard:
        return "stale"
    return "expired"


def _row_to_entry(row: dict[str, Any]) -> CacheEntry | None:
    payload = row.get("payload")
    if not isinstance(payload, dict):
        return None
    validated_at = _parse_ts(row.get("validated_at")) or _parse_ts(row.get("fetched_at"))
    version = row.get("content_version")
    return CacheEntry(
        url=str(row.get("url") or ""),
        canonical_url=row.get("canonical_url"),
        payload=payload,
        fetched_at=_parse_ts(row.get("fetched_at")),
        validated_at=validated_at,
        etag=row.get("etag"),
        last_modified=row.get("last_modified"),
        article_modified_at=_parse_ts(row.get("article_modified_at")),
        content_hash=row.get("content_hash"),
        content_version=int(version) if isinstance(version, int) else (
            int(version) if isinstance(version, str) and version.isdigit() else None
        ),
        freshness=classify_freshness(validated_at),
    )


async def _fetch_rows(params: dict[str, str]) -> list[dict[str, Any]]:
    cfg = _config()
    if not cfg:
        return []
    base, key = cfg
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{base}/rest/v1/{TABLE}",
                params=params,
                headers=_headers(key),
            )
            if r.status_code != 200:
                return []
            rows = r.json()
            return rows if isinstance(rows, list) else []
    except Exception:
        return []


async def get_cached_extraction(url: str) -> CacheEntry | None:
    """Lookup por URL cruda y, si falla, por canonical_url. Incluye filas expired."""
    if not url:
        return None
    rows = await _fetch_rows(
        {"url": f"eq.{url}", "select": _ROW_SELECT, "limit": "1"},
    )
    if not rows:
        canonical = normalize_article_url(url)
        if canonical and canonical != url:
            rows = await _fetch_rows(
                {"canonical_url": f"eq.{canonical}", "select": _ROW_SELECT, "limit": "1"},
            )
    if not rows or not isinstance(rows[0], dict):
        return None
    return _row_to_entry(rows[0])


async def store_extraction(
    url: str,
    payload: dict[str, Any],
    *,
    etag: str | None = None,
    last_modified: str | None = None,
    article_modified_at: datetime | None = None,
    content_hash_value: str | None = None,
    content_version: int = CONTENT_VERSION,
    cache_url: str | None = None,
) -> None:
    """Upsert completo del payload + metadatos. `cache_url` conserva la PK existente."""
    cfg = _config()
    if not cfg or not url:
        return
    base, key = cfg
    now = datetime.now(timezone.utc)
    primary = cache_url or url
    body = {
        "url": primary,
        "canonical_url": normalize_article_url(url),
        "payload": payload,
        "fetched_at": now.isoformat(),
        "validated_at": now.isoformat(),
        "etag": etag,
        "last_modified": last_modified,
        "article_modified_at": _iso(article_modified_at),
        "content_hash": content_hash_value,
        "content_version": content_version,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.post(
                f"{base}/rest/v1/{TABLE}",
                params={"on_conflict": "url"},
                headers={
                    **_headers(key),
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
                json=body,
            )
    except Exception:
        return


async def touch_validation(
    url: str,
    *,
    etag: str | None = None,
    last_modified: str | None = None,
    article_modified_at: datetime | None = None,
    content_hash_value: str | None = None,
    content_version: int | None = None,
    cache_url: str | None = None,
) -> None:
    """Actualiza solo metadatos de frescura (304 / hash idéntico / bump de content_version)."""
    cfg = _config()
    if not cfg or not url:
        return
    base, key = cfg
    primary = cache_url or url
    patch: dict[str, Any] = {
        "validated_at": datetime.now(timezone.utc).isoformat(),
        "canonical_url": normalize_article_url(url),
    }
    if etag is not None:
        patch["etag"] = etag
    if last_modified is not None:
        patch["last_modified"] = last_modified
    if article_modified_at is not None:
        patch["article_modified_at"] = _iso(article_modified_at)
    if content_hash_value is not None:
        patch["content_hash"] = content_hash_value
    if content_version is not None:
        patch["content_version"] = content_version
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.patch(
                f"{base}/rest/v1/{TABLE}",
                params={"url": f"eq.{primary}"},
                headers={**_headers(key), "Prefer": "return=minimal"},
                json=patch,
            )
    except Exception:
        return
