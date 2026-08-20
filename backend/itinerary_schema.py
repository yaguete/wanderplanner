"""JSON Schema de itinerario y de OCR para structured outputs de Haiku 4.5.

`additionalProperties: false` es obligatorio en cada objeto. No hay `minimum` /
`maximum` / `minLength` (la API no los admite). `sub_activities` es un nivel,
nunca recursivo.

Los opcionales son `string` (vacío = ausente), no `anyOf` string|null: Anthropic
limita a 16 parámetros con uniones o arrays y este esquema ya gasta los arrays.
En Instagram, `total_days` 0 (o < 1) lo aplana `coerce_instagram_itinerary`.
"""
from __future__ import annotations

from typing import Any

OPTIONAL_STRING_KEYS = frozenset(
    {
        "notes",
        "region",
        "affiliate_url",
        "from",
        "to",
        "tips",
        "general_tips",
        "vendor",
    }
)


def _named_item(*, with_affiliate: bool, with_sub: bool) -> dict[str, Any]:
    properties: dict[str, Any] = {
        "name": {"type": "string"},
        "type": {"type": "string"},
        "notes": {"type": "string"},
        "region": {"type": "string"},
    }
    required = ["name", "type", "notes", "region"]
    if with_affiliate:
        properties["affiliate_url"] = {"type": "string"}
        required.append("affiliate_url")
    if with_sub:
        properties["sub_activities"] = {
            "type": "array",
            "items": _named_item(with_affiliate=with_affiliate, with_sub=False),
        }
        required.append("sub_activities")
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": properties,
        "required": required,
    }


def _day_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "day": {"type": "integer"},
            "title": {"type": "string"},
            "accommodations": {
                "type": "array",
                "items": _named_item(with_affiliate=True, with_sub=False),
            },
            "activities": {
                "type": "array",
                "items": _named_item(with_affiliate=True, with_sub=True),
            },
            "restaurants": {
                "type": "array",
                "items": _named_item(with_affiliate=False, with_sub=False),
            },
            "transport": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "type": {"type": "string"},
                        "from": {"type": "string"},
                        "to": {"type": "string"},
                        "notes": {"type": "string"},
                        "region": {"type": "string"},
                    },
                    "required": ["type", "from", "to", "notes", "region"],
                },
            },
            "tips": {"type": "string"},
        },
        "required": [
            "day",
            "title",
            "accommodations",
            "activities",
            "restaurants",
            "transport",
            "tips",
        ],
    }


def itinerary_json_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "destination": {"type": "string"},
            "total_days": {"type": "integer"},
            "source_structured_by_days": {"type": "boolean"},
            "days": {"type": "array", "items": _day_schema()},
            "general_tips": {"type": "string"},
            "basics": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "category": {"type": "string"},
                        "name": {"type": "string"},
                        "vendor": {"type": "string"},
                        "notes": {"type": "string"},
                        "affiliate_url": {"type": "string"},
                    },
                    "required": [
                        "category",
                        "name",
                        "vendor",
                        "notes",
                        "affiliate_url",
                    ],
                },
            },
        },
        "required": [
            "destination",
            "total_days",
            "source_structured_by_days",
            "days",
            "general_tips",
            "basics",
        ],
    }


BLOG_ITINERARY_SCHEMA = itinerary_json_schema()
INSTAGRAM_ITINERARY_SCHEMA = itinerary_json_schema()

OCR_SLIDES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "slides": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "index": {"type": "integer"},
                    "text": {"type": "string"},
                },
                "required": ["index", "text"],
            },
        }
    },
    "required": ["slides"],
}


def coerce_optional_blanks(obj: Any) -> None:
    """Tras structured outputs: string vacío → null en campos opcionales."""
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key in OPTIONAL_STRING_KEYS and isinstance(value, str) and not value.strip():
                obj[key] = None
            else:
                coerce_optional_blanks(value)
    elif isinstance(obj, list):
        for item in obj:
            coerce_optional_blanks(item)


def output_config_for(schema: dict[str, Any]) -> dict[str, Any]:
    return {"format": {"type": "json_schema", "schema": schema}}
