"""OCR: elección de candidato, guardia SSRF, fail-open. Cero PNG en CI."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import respx

from instagram import InstagramMedia, InstagramText, instagram_llm_text, should_run_ocr
from instagram_ocr import (
    ImageCandidate,
    OcrResult,
    download_ocr_images,
    ocr_instagram_slides,
    pick_ocr_candidate,
    visual_tokens_for,
)

TINY_JPEG = b"\xff\xd8\xff\xdb\x00\x43" + b"\x00" * 64 + b"\xff\xd9"


def test_pick_ocr_candidate_prefers_min_width():
    cands = [
        ImageCandidate(url="https://cdn.example/1080.jpg", width=1080, height=1350),
        ImageCandidate(url="https://cdn.example/640.jpg", width=640, height=800),
        ImageCandidate(url="https://cdn.example/750.jpg", width=750, height=937),
    ]
    picked = pick_ocr_candidate(
        cands, fallback="https://cdn.example/native.jpg", min_width=640
    )
    assert picked is not None
    assert picked.url.endswith("640.jpg")
    assert picked.width == 640


def test_pick_ocr_candidate_falls_back_without_sizes():
    picked = pick_ocr_candidate(
        [], fallback="https://cdn.example/display.jpg", min_width=640
    )
    assert picked is not None
    assert picked.url.endswith("display.jpg")


def test_visual_tokens_cap():
    assert visual_tokens_for(640, 800) == 23 * 29
    assert visual_tokens_for(4000, 4000) == 1568


@pytest.mark.asyncio
@respx.mock
async def test_download_rejects_loopback_without_request():
    route = respx.get("http://127.0.0.1/secret.jpg").mock(
        return_value=httpx.Response(200, content=TINY_JPEG)
    )
    slides = await download_ocr_images(["http://127.0.0.1/secret.jpg"])
    assert slides == []
    assert route.call_count == 0


@pytest.mark.asyncio
@respx.mock
async def test_download_rejects_private_ip_without_request():
    route = respx.get("http://10.0.0.5/x.jpg").mock(
        return_value=httpx.Response(200, content=TINY_JPEG)
    )
    slides = await download_ocr_images(["http://10.0.0.5/x.jpg"])
    assert slides == []
    assert route.call_count == 0


@pytest.mark.asyncio
@respx.mock
async def test_download_discards_html_content_type():
    respx.get("https://cdn.example/not-an-image.jpg").mock(
        return_value=httpx.Response(
            200,
            headers={"content-type": "text/html"},
            content=b"<html>login</html>",
        )
    )
    with patch("instagram_ocr.is_public_http_url", return_value=True):
        slides = await download_ocr_images(["https://cdn.example/not-an-image.jpg"])
    assert slides == []


@pytest.mark.asyncio
@respx.mock
async def test_download_accepts_jpeg():
    respx.get("https://cdn.example/ok.jpg").mock(
        return_value=httpx.Response(
            200,
            headers={"content-type": "image/jpeg"},
            content=TINY_JPEG,
        )
    )
    with patch("instagram_ocr.is_public_http_url", return_value=True):
        slides = await download_ocr_images(["https://cdn.example/ok.jpg"])
    assert len(slides) == 1
    assert slides[0].media_type == "image/jpeg"


@pytest.mark.asyncio
async def test_ocr_fail_open_on_client_error():
    from instagram_ocr import DownloadedSlide

    media = InstagramMedia(
        shortcode="x",
        caption="un caption de listicle sin días " * 8,
        owner_username="u",
        display_urls=["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
    )
    downloaded = [
        DownloadedSlide(index=1, data=TINY_JPEG, media_type="image/jpeg", width=640, height=800),
        DownloadedSlide(index=2, data=TINY_JPEG, media_type="image/jpeg", width=640, height=800),
    ]
    client = MagicMock()
    client.messages.create.side_effect = RuntimeError("boom")
    with patch("instagram_ocr.download_ocr_images", new=AsyncMock(return_value=downloaded)):
        result = await ocr_instagram_slides(media, client=client)
    assert result.error == "RuntimeError"
    assert result.slides == []


@pytest.mark.asyncio
async def test_ocr_fail_open_on_empty_json():
    from instagram_ocr import DownloadedSlide

    media = InstagramMedia(
        shortcode="x",
        caption="un caption de listicle sin días " * 8,
        owner_username="u",
        display_urls=["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
    )
    downloaded = [
        DownloadedSlide(index=1, data=TINY_JPEG, media_type="image/jpeg", width=640, height=800),
        DownloadedSlide(index=2, data=TINY_JPEG, media_type="image/jpeg", width=640, height=800),
    ]
    message = MagicMock()
    message.stop_reason = "end_turn"
    block = MagicMock()
    block.type = "text"
    block.text = "{}"
    message.content = [block]
    client = MagicMock()
    client.messages.create.return_value = message
    with patch("instagram_ocr.download_ocr_images", new=AsyncMock(return_value=downloaded)):
        result = await ocr_instagram_slides(media, client=client)
    assert result.error in {"empty", "invalid_json"}
    assert result.slides == []


@pytest.mark.asyncio
async def test_instagram_llm_text_merges_overlay(monkeypatch):
    monkeypatch.setenv("INSTAGRAM_OCR_ENABLED", "true")
    media = InstagramMedia(
        shortcode="x",
        caption="Listicle de piscinas naturales en Extremadura. " * 4,
        owner_username="u",
        display_urls=["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
    )
    fake = OcrResult(
        slides=[(1, "DÍA 1 Fowey"), (2, "DÍA 2 Heligan")],
        visual_tokens=667,
        ms=12,
        error=None,
    )
    with patch("instagram.ocr_instagram_slides", new=AsyncMock(return_value=fake)):
        text = await instagram_llm_text(media, allow_ocr=True)
    assert "OVERLAY TEXT" in text.plain_text
    assert "Slide 1: DÍA 1 Fowey" in text.plain_text
    assert "Texto de las diapositivas" in text.chronicle_html
    assert text.ocr_flipped_structured is True
    assert text.ocr_visual_tokens == 667
    assert should_run_ocr(media, allow_ocr=True) is True


@pytest.mark.asyncio
async def test_instagram_llm_text_skips_ocr_when_caption_has_days(monkeypatch):
    monkeypatch.setenv("INSTAGRAM_OCR_ENABLED", "true")
    media = InstagramMedia(
        shortcode="x",
        caption="🌿 DÍA 1: Fowey\n🌿 DÍA 2: Heligan\n" + ("ruta " * 20),
        owner_username="u",
        display_urls=["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
    )
    with patch("instagram.ocr_instagram_slides", new=AsyncMock()) as ocr:
        text = await instagram_llm_text(media, allow_ocr=True)
    ocr.assert_not_awaited()
    assert "OVERLAY TEXT" not in text.plain_text
    assert isinstance(text, InstagramText)
