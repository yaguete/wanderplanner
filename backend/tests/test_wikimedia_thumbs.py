"""Selección de candidato Wikipedia y rechazo de archivos Commons (sin red)."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from wikimedia_thumbs import (
    attribution_from_info,
    pick_wikipedia_candidate,
    reject_commons_info,
    strip_html_text,
)

HALLSTATT_PAGES = [
    {
        "title": "Cultura de Hallstatt",
        "index": 1,
        "pageimage": "Hallstatt_culture.png",
        "thumbnail": {"source": "https://example.com/culture.png"},
    },
    {
        "title": "Hallstatt",
        "index": 2,
        "pageimage": "Hallstatt_-_Gesamtansicht.jpg",
        "thumbnail": {"source": "https://example.com/h.jpg"},
        "coordinates": [{"lat": 47.56, "lon": 13.64}],
    },
    {
        "title": "Yacimiento de Hallstatt",
        "index": 3,
        "coordinates": [{"lat": 47.56, "lon": 13.64}],
    },
]

CAFE_PAGES = [
    {
        "title": "Café vienés",
        "index": 1,
        "pageimage": "concepto.jpg",
        "thumbnail": {"source": "x"},
    },
    {
        "title": "Viena",
        "index": 2,
        "pageimage": "schonbrunn.jpg",
        "thumbnail": {"source": "x"},
        "coordinates": [{"lat": 48.2, "lon": 16.37}],
    },
    {
        "title": "Café Central",
        "index": 3,
        "pageimage": "Cafe_Central.jpg",
        "thumbnail": {"source": "x"},
        "coordinates": [{"lat": 48.210, "lon": 16.366}],
    },
    {
        "title": "Café Herrenhof",
        "index": 4,
        "pageimage": "herrenhof.jpg",
        "thumbnail": {"source": "x"},
        "coordinates": [{"lat": 48.21, "lon": 16.36}],
    },
]

TIGRE_PAGES = [
    {
        "title": "Juan Madrid",
        "index": 1,
        "pageimage": "juan.jpg",
        "thumbnail": {"source": "x"},
    },
]


def test_bar_el_tigre_no_coords_is_miss():
    assert pick_wikipedia_candidate(TIGRE_PAGES, "bar el tigre") is None


def test_cafe_central_beats_vienna():
    picked = pick_wikipedia_candidate(CAFE_PAGES, "café central")
    assert picked is not None
    assert picked["title"] == "Café Central"


def test_hallstatt_beats_culture_via_coords():
    picked = pick_wikipedia_candidate(HALLSTATT_PAGES, "hallstatt")
    assert picked is not None
    assert picked["title"] == "Hallstatt"


def test_reject_svg_mime():
    info = {"mime": "image/svg+xml", "width": 2000, "thumburl": "https://x"}
    assert reject_commons_info(info, missing=False) == "mime"


def test_reject_narrow_width():
    info = {"mime": "image/jpeg", "width": 320, "thumburl": "https://x"}
    assert reject_commons_info(info, missing=False) == "width"


def test_reject_restrictions():
    info = {
        "mime": "image/jpeg",
        "width": 2000,
        "thumburl": "https://x",
        "extmetadata": {"Restrictions": {"value": "trademarked"}},
    }
    assert reject_commons_info(info, missing=False) == "restrictions"


def test_reject_coat_of_arms_category():
    info = {
        "mime": "image/png",
        "width": 2000,
        "thumburl": "https://x",
        "extmetadata": {"Categories": {"value": "Coats of arms of Austria|Hallstatt"}},
    }
    assert reject_commons_info(info, missing=False) == "category"


def test_reject_missing_fair_use():
    assert reject_commons_info(None, missing=True) == "missing"


def test_artist_html_and_license_short_name():
    info = {
        "thumburl": "https://upload.wikimedia.org/wikipedia/commons/x.jpg",
        "width": 4000,
        "mime": "image/jpeg",
        "descriptionurl": "https://commons.wikimedia.org/wiki/File:Hallstatt.jpg",
        "extmetadata": {
            "Artist": {
                "value": '<a href="https://commons.wikimedia.org/wiki/User:Taxiarchos228">Taxiarchos228</a>'
            },
            "License": {"value": ""},
            "LicenseShortName": {"value": "FAL"},
            "Restrictions": {"value": ""},
            "Categories": {"value": "Hallstatt|Lakes of Austria"},
        },
    }
    assert reject_commons_info(info, missing=False) is None
    author, license_name, credit_url = attribution_from_info(info)
    assert author == "Taxiarchos228"
    assert license_name == "FAL"
    assert credit_url.endswith("File:Hallstatt.jpg")


def test_strip_html_unescapes():
    assert strip_html_text("<b>Foo &amp; Bar</b>") == "Foo & Bar"


def test_normalize_folds_accents():
    from wikimedia_thumbs import name_overlap_count, normalize_for_match

    assert normalize_for_match("Basílica") == "basilica"
    assert name_overlap_count("basílica de san marcos", "Basílica de San Marcos") >= 1


@pytest.mark.asyncio
async def test_lookup_swallows_network_errors():
    from wikimedia_thumbs import lookup_wikimedia_thumb, reset_circuit_for_tests

    reset_circuit_for_tests()
    with patch("wikimedia_thumbs._wikipedia_pages", new=AsyncMock(side_effect=TimeoutError("boom"))):
        assert await lookup_wikimedia_thumb("hallstatt", "Hallstatt") is None
    reset_circuit_for_tests()
