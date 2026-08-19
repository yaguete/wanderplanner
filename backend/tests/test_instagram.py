"""Parseo, detector de días, coerce del Caso B y fetch mockeado. Cero red."""
from __future__ import annotations

from pathlib import Path

import pytest

from instagram import (
    InstagramCaptionTooShort,
    InstagramError,
    InstagramMedia,
    InstagramNotConfigured,
    InstagramNotPublic,
    caption_has_day_markers,
    caption_to_html,
    coerce_instagram_itinerary,
    fetch_instagram,
    get_resolver,
    media_from_oembed,
    parse_media_payload,
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
    fetched, got = await fetch_instagram(
        CASE_A_URL, resolver=_FakeResolver(media)
    )
    assert got.owner_username == "lacosmopolilla"
    assert fetched.og_title is None
    assert fetched.og_image is None
    assert fetched.article_modified_at is None
    assert CASE_A[:20] in fetched.plain_text
    from article_fetch import content_hash

    assert fetched.content_hash == content_hash(CASE_A)


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
