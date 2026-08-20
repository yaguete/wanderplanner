"""Descarga de slides del carrusel + transcripción de overlay (Haiku vision).

Fail-open: cualquier error deja `ocr_error` y el caller sigue con el caption.
Las URLs vienen de un tercero: guardia SSRF de `partners.is_public_http_url`,
sin seguir redirects, tope de bytes, Content-Type de la respuesta.
"""
from __future__ import annotations

import asyncio
import base64
import json
import math
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import anthropic
import httpx

from itinerary_schema import OCR_SLIDES_SCHEMA, output_config_for
from obs import log_kv
from partners import is_public_http_url

import logging

logger = logging.getLogger(__name__)

OCR_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "agents", "instagram_ocr.md")

_ALLOWED_MEDIA_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/gif", "image/webp"}
)
_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_JPEG_MAGIC = b"\xff\xd8\xff"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_GIF_MAGIC = b"GIF8"
_WEBP_MAGIC = b"RIFF"


@dataclass
class ImageCandidate:
    url: str
    width: int | None = None
    height: int | None = None


@dataclass
class DownloadedSlide:
    index: int
    data: bytes
    media_type: str
    width: int | None = None
    height: int | None = None


@dataclass
class OcrResult:
    slides: list[tuple[int, str]]
    visual_tokens: int
    ms: int
    error: str | None = None


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if raw.isdigit() or (raw.startswith("-") and raw[1:].isdigit()):
        return int(raw)
    return default


def ocr_min_width() -> int:
    return max(_env_int("INSTAGRAM_OCR_MIN_WIDTH", 640), 1)


def ocr_max_slides() -> int:
    return min(max(_env_int("INSTAGRAM_OCR_MAX_SLIDES", 8), 1), 20)


def ocr_max_bytes() -> int:
    return min(max(_env_int("INSTAGRAM_OCR_MAX_BYTES", 5_000_000), 10_000), 10_000_000)


def ocr_fetch_budget_s() -> float:
    raw = (os.getenv("INSTAGRAM_OCR_FETCH_BUDGET_S") or "").strip()
    try:
        value = float(raw) if raw else 12.0
    except ValueError:
        value = 12.0
    return min(max(value, 2.0), 60.0)


def ocr_max_output_tokens() -> int:
    return min(max(_env_int("INSTAGRAM_OCR_MAX_OUTPUT_TOKENS", 2000), 256), 8000)


def visual_tokens_for(width: int | None, height: int | None) -> int:
    """Parches de 28×28, tope 1568 (resolución estándar de Haiku 4.5)."""
    w = width if isinstance(width, int) and width > 0 else 640
    h = height if isinstance(height, int) and height > 0 else 800
    return min(1568, math.ceil(w / 28) * math.ceil(h / 28))


def pick_ocr_candidate(
    candidates: list[ImageCandidate],
    *,
    fallback: str | None,
    min_width: int | None = None,
) -> ImageCandidate | None:
    """Candidato más pequeño con ancho ≥ min_width; si no hay, `display_url`."""
    floor = min_width if min_width is not None else ocr_min_width()
    sized = [c for c in candidates if c.width is not None and c.width >= floor]
    if sized:
        return min(sized, key=lambda c: c.width or 10**9)
    if fallback:
        return ImageCandidate(url=fallback, width=None, height=None)
    if candidates:
        return candidates[0]
    return None


def _media_type_from_header(value: str | None) -> str | None:
    if not value:
        return None
    mime = value.split(";", 1)[0].strip().lower()
    if mime == "image/jpg":
        mime = "image/jpeg"
    return mime if mime in _ALLOWED_MEDIA_TYPES else None


def _media_type_from_bytes(data: bytes) -> str | None:
    if data.startswith(_JPEG_MAGIC):
        return "image/jpeg"
    if data.startswith(_PNG_MAGIC):
        return "image/png"
    if data.startswith(_GIF_MAGIC):
        return "image/gif"
    if data.startswith(_WEBP_MAGIC) and b"WEBP" in data[:16]:
        return "image/webp"
    return None


def _allow_fixture_files() -> bool:
    return (os.getenv("INSTAGRAM_PROVIDER") or "").strip().lower() == "fixture"


def _read_fixture_file(url: str, max_bytes: int) -> DownloadedSlide | None:
    parsed = urlparse(url)
    path = Path(parsed.path)
    if not path.is_file():
        return None
    data = path.read_bytes()
    if len(data) > max_bytes:
        return None
    media_type = _media_type_from_bytes(data)
    if media_type is None:
        return None
    return DownloadedSlide(index=0, data=data, media_type=media_type)


async def _download_one(
    client: httpx.AsyncClient,
    url: str,
    *,
    index: int,
    max_bytes: int,
    deadline: float,
) -> DownloadedSlide | None:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        return None
    if url.startswith("file://"):
        if not _allow_fixture_files():
            return None
        slide = _read_fixture_file(url, max_bytes)
        if slide is None:
            return None
        slide.index = index
        return slide
    public = await asyncio.to_thread(is_public_http_url, url)
    if not public:
        return None
    try:
        async with client.stream(
            "GET",
            url,
            timeout=max(0.5, remaining),
            follow_redirects=False,
            headers={
                "User-Agent": _BROWSER_UA,
                "Accept": "image/jpeg,image/png,image/webp,image/gif,*/*",
                "Referer": "https://www.instagram.com/",
            },
        ) as response:
            if response.status_code != 200:
                return None
            media_type = _media_type_from_header(response.headers.get("content-type"))
            if media_type is None:
                return None
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                if time.monotonic() >= deadline:
                    return None
                total += len(chunk)
                if total > max_bytes:
                    return None
                chunks.append(chunk)
            data = b"".join(chunks)
    except (httpx.HTTPError, asyncio.TimeoutError, OSError):
        return None
    if not data:
        return None
    sniffed = _media_type_from_bytes(data)
    if sniffed is not None:
        media_type = sniffed
    elif media_type not in _ALLOWED_MEDIA_TYPES:
        return None
    return DownloadedSlide(index=index, data=data, media_type=media_type)


async def download_ocr_images(
    urls: list[str],
    *,
    widths: list[int | None] | None = None,
    heights: list[int | None] | None = None,
) -> list[DownloadedSlide]:
    if not urls:
        return []
    max_bytes = ocr_max_bytes()
    deadline = time.monotonic() + ocr_fetch_budget_s()
    sem = asyncio.Semaphore(4)

    async def bound(i: int, url: str) -> DownloadedSlide | None:
        async with sem:
            async with httpx.AsyncClient() as client:
                slide = await _download_one(
                    client,
                    url,
                    index=i + 1,
                    max_bytes=max_bytes,
                    deadline=deadline,
                )
            if slide is not None:
                if widths and i < len(widths):
                    slide.width = widths[i]
                if heights and i < len(heights):
                    slide.height = heights[i]
            return slide

    results = await asyncio.gather(
        *[bound(i, url) for i, url in enumerate(urls)],
        return_exceptions=True,
    )
    out: list[DownloadedSlide] = []
    for item in results:
        if isinstance(item, DownloadedSlide):
            out.append(item)
    out.sort(key=lambda s: s.index)
    return out


def _ocr_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY")).with_options(
        timeout=60.0
    )


def _parse_ocr_payload(payload: Any) -> list[tuple[int, str]] | None:
    if not isinstance(payload, dict):
        return None
    slides = payload.get("slides")
    if not isinstance(slides, list) or not slides:
        return None
    out: list[tuple[int, str]] = []
    for i, row in enumerate(slides, start=1):
        if not isinstance(row, dict):
            continue
        idx = row.get("index")
        text = row.get("text")
        index = int(idx) if isinstance(idx, int) else i
        out.append((index, text.strip() if isinstance(text, str) else ""))
    return out or None


async def ocr_instagram_slides(
    media: Any,
    *,
    client: anthropic.Anthropic | None = None,
) -> OcrResult:
    """Transcribe overlay. Nunca lanza: fail-open a `error` y slides vacíos."""
    t0 = time.perf_counter()
    try:
        n = min(len(media.display_urls), ocr_max_slides())
        if n < 1:
            return OcrResult(slides=[], visual_tokens=0, ms=0, error="no_slides")
        picked: list[ImageCandidate] = []
        for i in range(n):
            fallback = media.display_urls[i]
            cands = (
                media.display_candidates[i]
                if i < len(media.display_candidates)
                else []
            )
            choice = pick_ocr_candidate(cands, fallback=fallback)
            if choice is None:
                continue
            picked.append(choice)
        if len(picked) < 2:
            return OcrResult(
                slides=[],
                visual_tokens=0,
                ms=int((time.perf_counter() - t0) * 1000),
                error="too_few_urls",
            )
        downloaded = await download_ocr_images(
            [c.url for c in picked],
            widths=[c.width for c in picked],
            heights=[c.height for c in picked],
        )
        if len(downloaded) < 2:
            return OcrResult(
                slides=[],
                visual_tokens=0,
                ms=int((time.perf_counter() - t0) * 1000),
                error="download_failed",
            )
        visual_tokens = sum(
            visual_tokens_for(s.width, s.height) for s in downloaded
        )
        prompt = Path(OCR_PROMPT_PATH).read_text(encoding="utf-8")
        content: list[dict[str, Any]] = []
        for slide in downloaded:
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": slide.media_type,
                        "data": base64.standard_b64encode(slide.data).decode("ascii"),
                    },
                }
            )
            content.append({"type": "text", "text": f"Slide {slide.index}:"})
        content.append({"type": "text", "text": prompt})
        active = client or _ocr_client()
        message = await asyncio.to_thread(
            active.messages.create,
            model="claude-haiku-4-5-20251001",
            max_tokens=ocr_max_output_tokens(),
            messages=[{"role": "user", "content": content}],
            extra_body={"output_config": output_config_for(OCR_SLIDES_SCHEMA)},
        )
        stop = getattr(message, "stop_reason", None)
        if stop == "max_tokens":
            return OcrResult(
                slides=[],
                visual_tokens=visual_tokens,
                ms=int((time.perf_counter() - t0) * 1000),
                error="max_tokens",
            )
        raw = "".join(
            block.text
            for block in (message.content or [])
            if getattr(block, "type", None) == "text"
        ).strip()
        if not raw:
            return OcrResult(
                slides=[],
                visual_tokens=visual_tokens,
                ms=int((time.perf_counter() - t0) * 1000),
                error="empty",
            )
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return OcrResult(
                slides=[],
                visual_tokens=visual_tokens,
                ms=int((time.perf_counter() - t0) * 1000),
                error="invalid_json",
            )
        parsed = _parse_ocr_payload(payload)
        if parsed is None:
            return OcrResult(
                slides=[],
                visual_tokens=visual_tokens,
                ms=int((time.perf_counter() - t0) * 1000),
                error="empty",
            )
        return OcrResult(
            slides=parsed,
            visual_tokens=visual_tokens,
            ms=int((time.perf_counter() - t0) * 1000),
            error=None,
        )
    except Exception as exc:
        log_kv(
            logger,
            event="instagram_ocr_failed",
            error=type(exc).__name__,
        )
        return OcrResult(
            slides=[],
            visual_tokens=0,
            ms=int((time.perf_counter() - t0) * 1000),
            error=type(exc).__name__,
        )
