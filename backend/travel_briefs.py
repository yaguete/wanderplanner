"""
Recomendaciones de viaje del MAE (HTML), separadas de las fichas diplomáticas PDF.

Caché en disco: `data/travel_briefs/{ISO}.txt` + `index.json`.
Refresco por TTL en la propia petición (sin cron): si la entrada supera
TRAVEL_BRIEF_TTL_DAYS, se re-descarga antes de servir.

Usado por GET /country-tasks; el asistente sigue usando country_briefs (PDF).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import httpx
from bs4 import BeautifulSoup

from country_briefs import ISO_TO_NAME

DATA_DIR = Path(__file__).parent / "data" / "travel_briefs"
INDEX_PATH = DATA_DIR / "index.json"
REC_BASE = (
    "https://www.exteriores.gob.es/es/ServiciosAlCiudadano/Paginas/"
    "Detalle-recomendaciones-de-viaje.aspx"
)
DEFAULT_TTL_DAYS = 7


def _ttl_days() -> int:
    raw = (os.getenv("TRAVEL_BRIEF_TTL_DAYS") or "").strip()
    if raw.isdigit():
        return max(int(raw), 0)
    return DEFAULT_TTL_DAYS


def recommendation_url(code: str) -> str | None:
    c = code.upper().strip()
    name = ISO_TO_NAME.get(c)
    if not name:
        return None
    return f"{REC_BASE}?trc={quote(name)}"


def _load_index() -> dict:
    if not INDEX_PATH.exists():
        return {}
    try:
        return json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_index(index: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8")


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


def _is_stale(meta: dict, *, now: datetime | None = None) -> bool:
    ttl = _ttl_days()
    if ttl == 0:
        return True
    fetched = _parse_ts(meta.get("fetched_at"))
    if fetched is None:
        return True
    now = now or datetime.now(timezone.utc)
    return now - fetched >= timedelta(days=ttl)


def _extract_html_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header"]):
        tag.decompose()
    # Prefer the main recommendation body if present.
    root = (
        soup.select_one("#ctl00_PlaceHolderMain_ctl01__ControlWrapper_RichHtmlField")
        or soup.select_one("article")
        or soup.select_one("main")
        or soup.body
        or soup
    )
    text = root.get_text("\n", strip=True)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def get_cached_travel_brief(code: str) -> str | None:
    c = code.upper().strip()
    path = DATA_DIR / f"{c}.txt"
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def get_travel_brief_meta(code: str) -> dict | None:
    c = code.upper().strip()
    meta = _load_index().get(c)
    return meta if isinstance(meta, dict) else None


async def fetch_and_cache_travel_brief(code: str, *, force: bool = False) -> dict:
    """
    Descarga la página de Recomendaciones de viaje, extrae texto y cachea.
    Devuelve metadatos: {code, url, fetched_at, sha256, chars, unchanged?} o error.
    """
    c = code.upper().strip()
    url = recommendation_url(c)
    if not url:
        return {"code": c, "error": f"No hay mapeo de recomendaciones para {c}"}

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    txt_path = DATA_DIR / f"{c}.txt"
    index = _load_index()
    prev = index.get(c) or {}

    if not force and txt_path.exists() and prev and not _is_stale(prev):
        return {
            "code": c,
            "name": ISO_TO_NAME.get(c, c),
            "url": prev.get("url") or url,
            "fetched_at": prev.get("fetched_at"),
            "sha256": prev.get("sha256"),
            "chars": prev.get("chars"),
            "path": str(txt_path),
            "unchanged": True,
            "from_cache": True,
        }

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9",
    }
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=45) as client:
            r = await client.get(url, headers=headers)
    except Exception as e:
        return {"code": c, "url": url, "error": f"Error de red: {e}"}

    if r.status_code != 200:
        return {"code": c, "url": url, "error": f"HTTP {r.status_code}"}

    text = _extract_html_text(r.text)
    if not text or len(text) < 200:
        return {"code": c, "url": url, "error": "Página sin texto usable"}

    sha = hashlib.sha256(text.encode("utf-8")).hexdigest()
    if not force and prev.get("sha256") == sha and txt_path.exists():
        # Contenido idéntico: solo refresca fetched_at para el TTL.
        meta = {
            **prev,
            "code": c,
            "name": ISO_TO_NAME.get(c, c),
            "url": url,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "sha256": sha,
            "chars": len(text),
        }
        index[c] = meta
        _save_index(index)
        return {**meta, "path": str(txt_path), "unchanged": True}

    txt_path.write_text(text, encoding="utf-8")
    meta = {
        "code": c,
        "name": ISO_TO_NAME.get(c, c),
        "url": url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "sha256": sha,
        "chars": len(text),
    }
    index[c] = meta
    _save_index(index)
    return {**meta, "path": str(txt_path), "unchanged": False}


async def ensure_travel_briefs(codes: list[str]) -> dict[str, dict]:
    """
    Devuelve {ISO: {text, meta}} para los códigos pedidos.
    Usa caché fresca si existe; si no o está stale, descarga.
    Si el refresh falla pero hay texto stale en disco, lo sirve (degradación).
    """
    out: dict[str, dict] = {}
    for code in codes:
        c = code.upper().strip()
        if not c:
            continue
        meta = get_travel_brief_meta(c) or {}
        text = get_cached_travel_brief(c)
        needs_fetch = text is None or _is_stale(meta)
        if needs_fetch:
            result = await fetch_and_cache_travel_brief(c)
            if result.get("error"):
                # Preferir texto stale en disco a «sin datos».
                if text:
                    stale_meta = {
                        **meta,
                        "stale": True,
                        "refresh_error": result["error"],
                    }
                    if not stale_meta.get("url"):
                        stale_meta["url"] = recommendation_url(c)
                    out[c] = {"text": text, "meta": stale_meta}
                else:
                    out[c] = {"text": "", "meta": result}
                continue
            text = get_cached_travel_brief(c) or ""
            meta = {
                k: v
                for k, v in result.items()
                if k not in ("path", "unchanged", "from_cache")
            }
        out[c] = {"text": text or "", "meta": meta}
    return out
