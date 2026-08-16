"""
Miniaturas vía es.wikipedia + Wikimedia Commons.

Dos llamadas: búsqueda con coordenadas y pageimage, luego imageinfo en Commons.
Sin API key. No cuenta contra photo_lookup ni MAX_PHOTO_LOOKUPS_DAY.

User-Agent identificable (política de Wikimedia).
"""
from __future__ import annotations

import html
import logging
import re
import time
import unicodedata
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

WIKI_USER_AGENT = "WanderPlanner/1.0 (https://wanderplanner.ai; hola@wanderplanner.ai)"
WIKI_TIMEOUT_S = 3.5
WIKI_BUDGET_S = 4.0
MIN_WIDTH = 640
ALLOWED_MIMES = frozenset({"image/jpeg", "image/png", "image/webp"})
AUTHOR_MAX_LEN = 80

_FAIL_SKIP_AFTER = 5
_FAIL_SKIP_S = 180.0

_fail_streak = 0
_skip_until = 0.0

_TAG_RE = re.compile(r"<[^>]+>")
_BAD_CATEGORY_RE = re.compile(
    r"\b(coats? of arms|wappen|flags?|maps?|karte|logos?|diagram|screenshot)\b",
    re.IGNORECASE,
)
_WS_RE = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class WikiThumb:
    url: str
    author: str
    license: str
    credit_url: str

    def attribution(self) -> dict[str, str]:
        return {
            "author": self.author,
            "license": self.license,
            "creditUrl": self.credit_url,
        }


def reset_circuit_for_tests() -> None:
    global _fail_streak, _skip_until
    _fail_streak = 0
    _skip_until = 0.0


def wiki_available() -> bool:
    return time.monotonic() >= _skip_until


def _record_failure() -> None:
    global _fail_streak, _skip_until
    _fail_streak += 1
    if _fail_streak >= _FAIL_SKIP_AFTER:
        _skip_until = time.monotonic() + _FAIL_SKIP_S
        logger.warning(
            "Wikimedia: %s fallos seguidos; se salta %.0fs",
            _fail_streak,
            _FAIL_SKIP_S,
        )


def _record_success() -> None:
    global _fail_streak
    _fail_streak = 0


def normalize_for_match(text: str | None) -> str:
    """Minúsculas ASCII (NFKD) para comparar nombres con acentos."""
    if not text:
        return ""
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return _WS_RE.sub(" ", folded.lower()).strip()


def name_overlap_count(name: str, title: str) -> int:
    n_words = {w for w in normalize_for_match(name).split() if len(w) >= 3}
    if not n_words:
        return 0
    t_words = set(normalize_for_match(title).split())
    return len(n_words & t_words)


def strip_html_text(raw: str | None) -> str:
    if not raw:
        return ""
    plain = html.unescape(_TAG_RE.sub("", raw))
    return " ".join(plain.split()).strip()


def _page_has_coords(page: dict[str, Any]) -> bool:
    coords = page.get("coordinates")
    return isinstance(coords, list) and len(coords) > 0


def _page_has_image(page: dict[str, Any]) -> bool:
    pageimage = page.get("pageimage")
    thumb = page.get("thumbnail")
    return isinstance(pageimage, str) and bool(pageimage.strip()) and isinstance(thumb, dict)


def pick_wikipedia_candidate(
    pages: list[dict[str, Any]],
    name: str,
) -> dict[str, Any] | None:
    """
    Coordenadas + solape con el nombre + miniatura. Desempate: más solape, luego
    menor `index` (rango de CirrusSearch).
    """
    best: dict[str, Any] | None = None
    best_key: tuple[int, int] | None = None
    for page in pages:
        if not isinstance(page, dict):
            continue
        if not _page_has_coords(page):
            continue
        title = (page.get("title") or "").strip()
        overlap = name_overlap_count(name, title)
        if overlap < 1:
            continue
        if not _page_has_image(page):
            continue
        index = page.get("index")
        rank = int(index) if isinstance(index, int) else 10_000
        key = (overlap, -rank)
        if best_key is None or key > best_key:
            best_key = key
            best = page
    return best


def _ext_value(ext: dict[str, Any], key: str) -> str:
    block = ext.get(key)
    if isinstance(block, dict):
        val = block.get("value")
        return val.strip() if isinstance(val, str) else ""
    if isinstance(block, str):
        return block.strip()
    return ""


def reject_commons_info(info: dict[str, Any] | None, *, missing: bool) -> str | None:
    """Motivo de rechazo, o None si el archivo vale."""
    if missing or not isinstance(info, dict):
        return "missing"
    mime = (info.get("mime") or "").strip().lower()
    if mime not in ALLOWED_MIMES:
        return "mime"
    width = info.get("width")
    if not isinstance(width, int) or width < MIN_WIDTH:
        return "width"
    thumburl = info.get("thumburl") or info.get("url")
    if not isinstance(thumburl, str) or not thumburl.strip():
        return "thumburl"
    ext = info.get("extmetadata") if isinstance(info.get("extmetadata"), dict) else {}
    restrictions = _ext_value(ext, "Restrictions")
    if restrictions:
        return "restrictions"
    categories = _ext_value(ext, "Categories")
    if categories and _BAD_CATEGORY_RE.search(categories):
        return "category"
    return None


def attribution_from_info(info: dict[str, Any]) -> tuple[str, str, str]:
    ext = info.get("extmetadata") if isinstance(info.get("extmetadata"), dict) else {}
    artist = strip_html_text(_ext_value(ext, "Artist"))
    credit = strip_html_text(_ext_value(ext, "Credit"))
    author = artist or credit or "Wikimedia Commons"
    if len(author) > AUTHOR_MAX_LEN:
        author = author[: AUTHOR_MAX_LEN - 1].rstrip() + "…"
    license_name = _ext_value(ext, "LicenseShortName") or _ext_value(ext, "License") or "Commons"
    credit_url = (info.get("descriptionurl") or "").strip()
    return author, license_name, credit_url


def _wiki_headers() -> dict[str, str]:
    return {"User-Agent": WIKI_USER_AGENT, "Accept": "application/json"}


async def _wikipedia_pages(client: httpx.AsyncClient, query: str) -> list[dict[str, Any]]:
    r = await client.get(
        "https://es.wikipedia.org/w/api.php",
        params={
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "generator": "search",
            "gsrsearch": query,
            "gsrlimit": "5",
            "gsrnamespace": "0",
            "prop": "pageimages|coordinates",
            "piprop": "thumbnail|name",
            "pithumbsize": str(MIN_WIDTH),
            "colimit": "max",
        },
        headers=_wiki_headers(),
    )
    if r.status_code != 200:
        return []
    data = r.json()
    pages = (data.get("query") or {}).get("pages") if isinstance(data, dict) else None
    if not isinstance(pages, list):
        return []
    return [p for p in pages if isinstance(p, dict)]


async def _commons_page(client: httpx.AsyncClient, pageimage: str) -> dict[str, Any] | None:
    title = pageimage.strip()
    if not title.lower().startswith("file:"):
        title = f"File:{title}"
    r = await client.get(
        "https://commons.wikimedia.org/w/api.php",
        params={
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "iiurlwidth": str(MIN_WIDTH),
        },
        headers=_wiki_headers(),
    )
    if r.status_code != 200:
        return None
    data = r.json()
    pages = (data.get("query") or {}).get("pages") if isinstance(data, dict) else None
    if not isinstance(pages, list) or not pages:
        return None
    page = pages[0]
    return page if isinstance(page, dict) else None


async def lookup_wikimedia_thumb(query: str, name: str | None) -> WikiThumb | None:
    """
    Resuelve miniatura Commons o None. Nunca propaga errores de red: un fallo
    es un miss (Places sigue). Circuito: N excepciones seguidas → skip unos minutos.
    """
    if not wiki_available():
        return None
    label = (name or "").strip() or query
    t0 = time.perf_counter()
    try:
        timeout = httpx.Timeout(WIKI_TIMEOUT_S)
        async with httpx.AsyncClient(timeout=timeout) as client:
            pages = await _wikipedia_pages(client, query)
            elapsed = time.perf_counter() - t0
            if elapsed >= WIKI_BUDGET_S:
                _record_success()
                return None
            candidate = pick_wikipedia_candidate(pages, label)
            if not candidate:
                _record_success()
                return None
            pageimage = (candidate.get("pageimage") or "").strip()
            remaining = WIKI_BUDGET_S - (time.perf_counter() - t0)
            if remaining < 0.4:
                _record_success()
                return None
            commons = await _commons_page(client, pageimage)
            if not commons:
                _record_success()
                return None
            missing = commons.get("missing") is True
            infos = commons.get("imageinfo")
            info = infos[0] if isinstance(infos, list) and infos else None
            reason = reject_commons_info(info if isinstance(info, dict) else None, missing=missing)
            if reason or not isinstance(info, dict):
                _record_success()
                return None
            url = (info.get("thumburl") or info.get("url") or "").strip()
            if not url:
                _record_success()
                return None
            author, license_name, credit_url = attribution_from_info(info)
            _record_success()
            return WikiThumb(url=url, author=author, license=license_name, credit_url=credit_url)
    except Exception:
        _record_failure()
        logger.warning("Wikimedia lookup failed", exc_info=True)
        return None
