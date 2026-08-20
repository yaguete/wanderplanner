"""JSON Schema de extracción: sin anyOf (límite Anthropic de uniones+arrays)."""
from itinerary_schema import (
    BLOG_ITINERARY_SCHEMA,
    INSTAGRAM_ITINERARY_SCHEMA,
    coerce_optional_blanks,
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
