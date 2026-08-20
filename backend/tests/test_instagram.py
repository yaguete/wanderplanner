"""Parseo, detector de días, coerce del Caso B y fetch mockeado. Cero red."""
from __future__ import annotations

from pathlib import Path

import pytest

from instagram import (
    IG_PIPELINE_VERSION,
    InstagramCaptionTooShort,
    InstagramError,
    InstagramMedia,
    InstagramNotConfigured,
    InstagramNotPublic,
    InstagramText,
    caption_has_day_markers,
    caption_to_html,
    coerce_instagram_itinerary,
    day_markers,
    fetch_instagram,
    get_resolver,
    instagram_content_hash,
    media_from_oembed,
    parse_media_payload,
    should_run_ocr,
)
from instagram_url import canonical_instagram_url, parse_instagram_shortcode

FIXTURES = Path(__file__).parent / "fixtures" / "instagram"
CASE_A = (FIXTURES / "case_a_cornwall.txt").read_text(encoding="utf-8")
CASE_B = (FIXTURES / "case_b_extremadura.txt").read_text(encoding="utf-8")

CASE_A_URL = (
    "https://www.instagram.com/p/DblDYKZjOhx/"
    "?utm_source=ig_web_copy_link&igsi=MzRlODBiNWFlZA=="
)
CASE_B_URL = (
    "https://www.instagram.com/reel/DbYAsLVM7Yd/"
    "?utm_source=ig_web_copy_link&igsi=MzRlODBiNWFlZA=="
)


def test_parse_shortcode_case_a_and_b():
    assert parse_instagram_shortcode(CASE_A_URL) == "DblDYKZjOhx"
    assert parse_instagram_shortcode(CASE_B_URL) == "DbYAsLVM7Yd"
    assert canonical_instagram_url(CASE_B_URL) == "https://www.instagram.com/p/DbYAsLVM7Yd"
    assert (
        parse_instagram_shortcode(
            "https://www.instagram.com/lacosmopolilla/p/DblDYKZjOhx/"
        )
        == "DblDYKZjOhx"
    )
    assert parse_instagram_shortcode("https://m.instagram.com/reel/DbYAsLVM7Yd") == (
        "DbYAsLVM7Yd"
    )
    assert parse_instagram_shortcode("https://www.instagram.com/lacosmopolilla") is None
    assert (
        parse_instagram_shortcode(
            "https://www.instagram.com/stories/lacosmopolilla/123"
        )
        is None
    )


def test_day_markers_real_captions():
    assert caption_has_day_markers(CASE_A) is True
    assert caption_has_day_markers(CASE_B) is False


def test_day_markers_false_positives():
    assert caption_has_day_markers("Ruta de 5 días por Cornualles") is False
    assert caption_has_day_markers("Acabo de pasar unos días geniales") is False
    assert caption_has_day_markers("Día de la Hispanidad en Trujillo") is False
    assert caption_has_day_markers("1. Playas con bandera azul") is False
    assert caption_has_day_markers("holiday 5") is False


def _poi(name: str) -> dict:
    return {
        "name": name,
        "type": "attraction",
        "notes": None,
        "region": None,
        "affiliate_url": "https://invented.example",
    }


def test_coerce_flattens_malicious_extremadura_days():
    itinerary = {
        "destination": "Extremadura, España",
        "total_days": 3,
        "source_structured_by_days": True,
        "days": [
            {
                "day": 1,
                "title": "Piscina",
                "accommodations": [],
                "restaurants": [],
                "transport": [],
                "tips": None,
                "activities": [
                    _poi("Costa Dulce"),
                    _poi("La Dehesa"),
                    _poi("Espolón-Pedroche"),
                ],
            },
            {
                "day": 2,
                "title": "Interior",
                "accommodations": [],
                "restaurants": [],
                "transport": [],
                "tips": None,
                "activities": [
                    _poi("Charco de la Nutria"),
                    _poi("Festival de Teatro Clásico de Mérida"),
                ],
            },
            {
                "day": 3,
                "title": "Cierre",
                "accommodations": [],
                "restaurants": [],
                "transport": [],
                "tips": None,
                "activities": [
                    _poi("Astroturismo en Trujillo"),
                    _poi("Termas de Alange"),
                ],
            },
        ],
        "basics": [],
    }
    out = coerce_instagram_itinerary(itinerary, CASE_B)
    assert out["source_structured_by_days"] is False
    assert out["total_days"] is None
    assert len(out["days"]) == 1
    names = [a["name"] for a in out["days"][0]["activities"]]
    assert "Costa Dulce" in names
    assert "Termas de Alange" in names
    assert "Festival de Teatro Clásico de Mérida" in names
    assert all(a["affiliate_url"] is None for a in out["days"][0]["activities"])


def test_coerce_keeps_structured_cornwall():
    days = []
    for n, title in enumerate(
        ["Llegada", "Jardines", "Fin del mundo", "Playas", "Padstow"], start=1
    ):
        days.append(
            {
                "day": n,
                "title": title,
                "accommodations": [],
                "restaurants": [],
                "transport": [],
                "tips": None,
                "activities": [_poi(title)],
            }
        )
    itinerary = {
        "destination": "Cornualles, Reino Unido",
        "total_days": None,
        "source_structured_by_days": False,
        "days": days,
        "basics": [],
    }
    out = coerce_instagram_itinerary(itinerary, CASE_A)
    assert out["source_structured_by_days"] is True
    assert out["total_days"] == 5
    assert len(out["days"]) == 5


def test_caption_to_html_escapes():
    html = caption_to_html("Hola <script>x</script>\n\nSegunda")
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert html.count("<p>") == 2


def test_parse_media_payload_own_contract():
    media = parse_media_payload(
        {
            "shortcode": "DblDYKZjOhx",
            "caption": CASE_A,
            "owner_username": "lacosmopolilla",
            "owner_full_name": "La Cosmopolilla",
            "location_name": "Cornwall",
            "display_urls": ["https://cdn.example/1.jpg"],
            "is_video": False,
            "product_type": "carousel_container",
        },
        shortcode="DblDYKZjOhx",
    )
    assert media.owner_username == "lacosmopolilla"
    assert media.location_name == "Cornwall"
    assert "DÍA 2" in media.caption


class _FakeResolver:
    def __init__(self, media: InstagramMedia) -> None:
        self.media = media
        self.calls = 0

    async def resolve(self, shortcode: str) -> InstagramMedia:
        self.calls += 1
        return self.media


@pytest.mark.asyncio
async def test_fetch_instagram_hashes_caption_not_preamble():
    media = InstagramMedia(
        shortcode="DblDYKZjOhx",
        caption=CASE_A,
        owner_username="lacosmopolilla",
        location_name="Cornwall",
    )
    fetched, got, text = await fetch_instagram(
        CASE_A_URL, resolver=_FakeResolver(media)
    )
    assert got.owner_username == "lacosmopolilla"
    assert fetched.og_title is None
    assert fetched.og_image is None
    assert fetched.article_modified_at is None
    assert CASE_A[:20] in fetched.plain_text
    assert text.caption == CASE_A
    assert fetched.content_hash == instagram_content_hash(CASE_A)
    assert fetched.content_hash != instagram_content_hash("other")
    from article_fetch import content_hash

    assert fetched.content_hash != content_hash(CASE_A)
    assert IG_PIPELINE_VERSION == 2


@pytest.mark.asyncio
async def test_fetch_instagram_off_provider(monkeypatch):
    monkeypatch.setenv("INSTAGRAM_PROVIDER", "off")
    from instagram import OffInstagramResolver

    with pytest.raises(InstagramNotConfigured):
        await fetch_instagram(CASE_A_URL, resolver=OffInstagramResolver())


@pytest.mark.asyncio
async def test_fetch_instagram_caption_too_short():
    media = InstagramMedia(
        shortcode="xxx",
        caption="Hola #x",
        owner_username="u",
        location_name="Cornwall",
    )
    with pytest.raises(InstagramCaptionTooShort) as exc:
        await fetch_instagram(
            "https://www.instagram.com/p/DblDYKZjOhx",
            resolver=_FakeResolver(media),
        )
    assert exc.value.permanent is True
    assert exc.value.destination == "Cornwall"


@pytest.mark.asyncio
async def test_fetch_instagram_rejects_profile():
    with pytest.raises(InstagramError):
        await fetch_instagram("https://www.instagram.com/lacosmopolilla")


def test_media_from_oembed_uses_title_as_caption():
    media = media_from_oembed(
        {
            "title": "🌿 DÍA 1: Fowey\n🌿 DÍA 2: Heligan",
            "author_name": "lacosmopolilla",
            "type": "rich",
        },
        shortcode="DblDYKZjOhx",
    )
    assert media.owner_username == "lacosmopolilla"
    assert "DÍA 1" in media.caption
    assert media.is_video is False


def test_media_from_oembed_username_from_author_url():
    media = media_from_oembed(
        {
            "title": "Un caption suficientemente largo para extraer sitios de viaje.",
            "author_url": "https://www.instagram.com/lacosmopolilla",
            "type": "video",
        },
        shortcode="abc",
    )
    assert media.owner_username == "lacosmopolilla"
    assert media.is_video is True


def test_media_from_oembed_requires_author():
    with pytest.raises(InstagramNotPublic):
        media_from_oembed({"title": "hola"}, shortcode="abc")


def test_get_resolver_oembed(monkeypatch):
    monkeypatch.setenv("INSTAGRAM_PROVIDER", "oembed")
    from instagram import OembedInstagramResolver

    assert isinstance(get_resolver(), OembedInstagramResolver)


def test_get_resolver_fixture(monkeypatch):
    monkeypatch.setenv("INSTAGRAM_PROVIDER", "fixture")
    from instagram import FixtureInstagramResolver

    assert isinstance(get_resolver(), FixtureInstagramResolver)


def _carousel(caption: str, n_urls: int = 3) -> InstagramMedia:
    return InstagramMedia(
        shortcode="ocrCarousel",
        caption=caption,
        owner_username="u",
        display_urls=[f"https://cdn.example/{i}.jpg" for i in range(n_urls)],
    )


def test_should_run_ocr_gate(monkeypatch):
    monkeypatch.setenv("INSTAGRAM_OCR_ENABLED", "true")
    monkeypatch.delenv("INSTAGRAM_OCR_MAX_CAPTION_CHARS", raising=False)
    assert should_run_ocr(_carousel(CASE_A, 5), allow_ocr=True) is False
    assert should_run_ocr(_carousel(CASE_B, 1), allow_ocr=True) is False
    assert should_run_ocr(_carousel(CASE_B, 3), allow_ocr=True) is True
    monkeypatch.setenv("INSTAGRAM_OCR_ENABLED", "false")
    assert should_run_ocr(_carousel(CASE_B, 3), allow_ocr=True) is False
    monkeypatch.setenv("INSTAGRAM_OCR_ENABLED", "true")
    assert should_run_ocr(_carousel(CASE_B, 3), allow_ocr=False) is False
    short = "Guía completa en el link 🔗"
    assert should_run_ocr(_carousel(short, 3), allow_ocr=True) is True


def test_day_markers_set():
    assert day_markers(CASE_A) >= {1, 2, 3, 4, 5}
    assert day_markers(CASE_B) == set()
    assert day_markers("cerrado día 3") == {3}


def test_coerce_overlay_two_days_keeps_structure():
    overlay = (FIXTURES / "ocr_overlay.txt").read_text(encoding="utf-8")
    text = InstagramText(
        plain_text="x",
        detector_text=f"{CASE_B}\n{overlay}",
        chronicle_html="",
        caption=CASE_B,
        overlay=overlay,
    )
    itinerary = {
        "destination": "Cornualles, Reino Unido",
        "total_days": 2,
        "source_structured_by_days": False,
        "days": [
            {
                "day": 1,
                "title": "Uno",
                "accommodations": [],
                "restaurants": [],
                "transport": [],
                "tips": None,
                "activities": [_poi("Fowey")],
            },
            {
                "day": 2,
                "title": "Dos",
                "accommodations": [],
                "restaurants": [],
                "transport": [],
                "tips": None,
                "activities": [_poi("Land's End")],
            },
        ],
        "basics": [],
    }
    out = coerce_instagram_itinerary(itinerary, text)
    assert out["source_structured_by_days"] is True
    assert len(out["days"]) == 2


def test_coerce_single_ocr_day_does_not_structure():
    text = InstagramText(
        plain_text="x",
        detector_text=f"{CASE_B}\ndía 3 cerrado",
        chronicle_html="",
        caption=CASE_B,
        overlay="Entrada 8 €. día 3 cerrado.",
    )
    itinerary = {
        "destination": "Extremadura, España",
        "total_days": 3,
        "source_structured_by_days": True,
        "days": [
            {
                "day": 1,
                "title": "A",
                "accommodations": [],
                "restaurants": [],
                "transport": [],
                "tips": None,
                "activities": [_poi("Costa Dulce")],
            },
            {
                "day": 2,
                "title": "B",
                "accommodations": [],
                "restaurants": [],
                "transport": [],
                "tips": None,
                "activities": [_poi("Mérida")],
            },
            {
                "day": 3,
                "title": "C",
                "accommodations": [],
                "restaurants": [],
                "transport": [],
                "tips": None,
                "activities": [_poi("Trujillo")],
            },
        ],
        "basics": [],
    }
    out = coerce_instagram_itinerary(itinerary, text)
    assert out["source_structured_by_days"] is False
    assert out["total_days"] is None
    assert len(out["days"]) == 1


def test_coerce_case_a_intact_with_and_without_overlay():
    days = [
        {
            "day": n,
            "title": t,
            "accommodations": [],
            "restaurants": [],
            "transport": [],
            "tips": None,
            "activities": [_poi(t)],
        }
        for n, t in enumerate(
            ["Llegada", "Jardines", "Fin del mundo", "Playas", "Padstow"], start=1
        )
    ]
    itinerary = {
        "destination": "Cornualles, Reino Unido",
        "total_days": None,
        "source_structured_by_days": False,
        "days": days,
        "basics": [],
    }
    caption_only = coerce_instagram_itinerary(dict(itinerary), CASE_A)
    fused = InstagramText(
        plain_text="x",
        detector_text=CASE_A,
        chronicle_html="",
        caption=CASE_A,
        overlay="Slide 1: Fowey",
    )
    with_overlay = coerce_instagram_itinerary(dict(itinerary), fused)
    assert caption_only["total_days"] == 5
    assert with_overlay["total_days"] == 5


def test_hash_version_busts_phase1_and_is_stable():
    from article_fetch import content_hash

    caption = "un caption estable"
    v2 = instagram_content_hash(caption)
    assert v2 != content_hash(caption)
    assert instagram_content_hash(caption) == v2


@pytest.mark.asyncio
async def test_short_caption_with_carousel_defers_length_until_ocr(monkeypatch):
    monkeypatch.setenv("INSTAGRAM_OCR_ENABLED", "true")
    media = _carousel("Guía en el link 🔗", 3)
    fetched, got, text = await fetch_instagram(
        "https://www.instagram.com/p/ocrCarousel",
        resolver=_FakeResolver(media),
        allow_ocr=False,
    )
    assert got is media
    assert text.ocr_slides == 0


@pytest.mark.asyncio
async def test_fixture_resolver_reads_json(monkeypatch):
    monkeypatch.setenv("INSTAGRAM_PROVIDER", "fixture")
    from instagram import FixtureInstagramResolver

    media = await FixtureInstagramResolver(root=FIXTURES).resolve("ocrCarousel")
    assert media.owner_username == "fixture_user"
    assert len(media.display_urls) == 3
    assert len(media.display_candidates) == 3
    assert media.display_candidates[0][0].width == 640


@pytest.mark.asyncio
async def test_three_paths_coerce_with_instagram_text_not_caption():
    from datetime import datetime, timezone
    from unittest.mock import AsyncMock, patch

    import main as main_mod
    from article_fetch import ArticleFetchResult
    from auth import AuthUser
    from extraction_cache import CacheEntry

    seen: list[object] = []
    orig = main_mod.coerce_instagram_itinerary

    def spy(itinerary, detector):
        seen.append(detector)
        return orig(itinerary, detector)

    media = InstagramMedia(
        shortcode="DbYAsLVM7Yd",
        caption=CASE_B,
        owner_username="u",
        display_urls=["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
    )
    text = InstagramText(
        plain_text="plain",
        detector_text=CASE_B,
        chronicle_html="<p>c</p>",
        caption=CASE_B,
        overlay="",
    )
    fetched = ArticleFetchResult(
        plain_text=text.plain_text,
        cleaned_html=text.chronicle_html,
        content_hash=instagram_content_hash(CASE_B),
        content_version=1,
    )
    itinerary = {
        "destination": "Extremadura, España",
        "total_days": 3,
        "source_structured_by_days": True,
        "days": [
            {
                "day": 1,
                "title": "A",
                "accommodations": [],
                "activities": [],
                "restaurants": [],
                "transport": [],
                "tips": None,
            }
        ],
        "basics": [],
        "general_tips": None,
    }
    now = datetime.now(timezone.utc)
    entry = CacheEntry(
        url="https://www.instagram.com/p/DbYAsLVM7Yd",
        canonical_url="https://www.instagram.com/p/DbYAsLVM7Yd",
        payload=dict(itinerary),
        fetched_at=now,
        validated_at=now,
        etag=None,
        last_modified=None,
        article_modified_at=None,
        content_hash="stale-hash-from-phase-1",
        content_version=1,
        freshness="stale",
    )
    user = AuthUser(id="u1", email=None, is_anonymous=False)

    async def fake_fetch(*_a, **_k):
        return fetched, media, text

    with patch.object(main_mod, "_fetch_source", side_effect=fake_fetch):
        with patch.object(main_mod, "instagram_llm_text", new=AsyncMock(return_value=text)):
            with patch.object(main_mod, "coerce_instagram_itinerary", side_effect=spy):
                with patch.object(
                    main_mod, "call_claude", return_value=(dict(itinerary), 1, 2)
                ):
                    with patch.object(main_mod, "store_extraction", new=AsyncMock()):
                        with patch.object(main_mod, "record_event", new=AsyncMock()):
                            with patch.object(main_mod, "enforce_usage", new=AsyncMock()):
                                with patch.object(
                                    main_mod, "touch_validation", new=AsyncMock()
                                ):
                                    await main_mod._distill_article(
                                        entry.url,
                                        None,
                                        usage_user=user,
                                        allow_ocr=False,
                                    )
                                    await main_mod.revalidate_in_background(
                                        entry.url, entry
                                    )
                                    await main_mod._validate_sync_for_refresh(
                                        entry.url, entry, user=user
                                    )
    assert len(seen) == 3
    for detector in seen:
        assert isinstance(detector, InstagramText)
        assert detector.caption == CASE_B


@pytest.mark.asyncio
async def test_refresh_unchanged_still_records_instagram():
    from datetime import datetime, timezone
    from unittest.mock import AsyncMock, patch

    import main as main_mod
    from article_fetch import ArticleFetchResult
    from auth import AuthUser
    from extraction_cache import CacheEntry

    media = InstagramMedia(
        shortcode="DbYAsLVM7Yd",
        caption=CASE_B,
        owner_username="u",
    )
    text = InstagramText(
        plain_text="plain",
        detector_text=CASE_B,
        chronicle_html="<p>c</p>",
        caption=CASE_B,
        overlay="",
    )
    digest = instagram_content_hash(CASE_B)
    fetched = ArticleFetchResult(
        plain_text=text.plain_text,
        cleaned_html=text.chronicle_html,
        content_hash=digest,
        content_version=1,
    )
    now = datetime.now(timezone.utc)
    entry = CacheEntry(
        url="https://www.instagram.com/p/DbYAsLVM7Yd",
        canonical_url="https://www.instagram.com/p/DbYAsLVM7Yd",
        payload={"destination": "Extremadura, España", "days": [], "basics": []},
        fetched_at=now,
        validated_at=now,
        etag=None,
        last_modified=None,
        article_modified_at=None,
        content_hash=digest,
        content_version=1,
        freshness="fresh",
    )
    user = AuthUser(id="u1", email=None, is_anonymous=False)
    records: list[str] = []

    async def fake_record(user_id, kind, cost_hint=None):
        records.append(kind)

    async def fake_fetch(*_a, **_k):
        return fetched, media, text

    with patch.object(main_mod, "_fetch_source", side_effect=fake_fetch):
        with patch.object(main_mod, "record_event", side_effect=fake_record):
            with patch.object(main_mod, "enforce_usage", new=AsyncMock()):
                with patch.object(main_mod, "touch_validation", new=AsyncMock()):
                    with patch.object(main_mod, "call_claude") as claude:
                        await main_mod._validate_sync_for_refresh(
                            entry.url, entry, user=user
                        )
    assert "extraction_instagram" in records
    claude.assert_not_called()


