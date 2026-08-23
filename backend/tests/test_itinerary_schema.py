"""JSON Schema de extracción: sin anyOf (límite Anthropic de uniones+arrays)."""
from itinerary_schema import (
    BLOG_ITINERARY_SCHEMA,
    INSTAGRAM_ITINERARY_SCHEMA,
    coerce_optional_blanks,
    usable_affiliate_url,
)


def _count_anyof(node: object) -> int:
    if isinstance(node, dict):
        n = 1 if "anyOf" in node else 0
        return n + sum(_count_anyof(v) for v in node.values())
    if isinstance(node, list):
        return sum(_count_anyof(v) for v in node)
    return 0


def test_blog_and_instagram_schemas_have_no_unions():
    assert _count_anyof(BLOG_ITINERARY_SCHEMA) == 0
    assert _count_anyof(INSTAGRAM_ITINERARY_SCHEMA) == 0


def test_coerce_optional_blanks_nulls_empty_strings():
    payload = {
        "general_tips": "  ",
        "days": [
            {
                "tips": "",
                "activities": [{"notes": "ok", "region": "", "affiliate_url": ""}],
            }
        ],
    }
    coerce_optional_blanks(payload)
    assert payload["general_tips"] is None
    assert payload["days"][0]["tips"] is None
    assert payload["days"][0]["activities"][0]["notes"] == "ok"
    assert payload["days"][0]["activities"][0]["region"] is None
    assert payload["days"][0]["activities"][0]["affiliate_url"] is None


def test_usable_affiliate_url_keeps_http_and_https():
    civitatis = "https://www.civitatis.com/es/riga/paseo-barco-riga/?aid=1006"
    holafly = "http://holafly.sjv.io/19b6NB"
    assert usable_affiliate_url(civitatis) == civitatis
    assert usable_affiliate_url(holafly) == holafly
    assert usable_affiliate_url("  " + civitatis + "  ") == civitatis
    assert usable_affiliate_url("//www.booking.com/hotel/x.html?aid=1") == (
        "https://www.booking.com/hotel/x.html?aid=1"
    )


def test_usable_affiliate_url_drops_sentinels_and_relatives():
    for junk in ("/", "#", "n/a", "N/A", "none", "null", "-", "foo.html", "/start?source=x"):
        assert usable_affiliate_url(junk) is None
    assert usable_affiliate_url("javascript:alert(1)") is None
    assert usable_affiliate_url("mailto:hola@example.com") is None


def test_coerce_optional_blanks_nulls_dummy_affiliate_urls():
    payload = {
        "days": [
            {
                "activities": [
                    {"affiliate_url": "/"},
                    {"affiliate_url": "https://www.civitatis.com/es/riga/?aid=1"},
                ],
            }
        ],
        "basics": [{"affiliate_url": "n/a", "notes": "/"}],
    }
    coerce_optional_blanks(payload)
    assert payload["days"][0]["activities"][0]["affiliate_url"] is None
    assert (
        payload["days"][0]["activities"][1]["affiliate_url"]
        == "https://www.civitatis.com/es/riga/?aid=1"
    )
    assert payload["basics"][0]["affiliate_url"] is None
    assert payload["basics"][0]["notes"] == "/"
