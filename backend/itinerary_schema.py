"""JSON Schema de itinerario y de OCR para structured outputs de Haiku 4.5.

`additionalProperties: false` es obligatorio en cada objeto. No hay `minimum` /
`maximum` / `minLength` (la API no los admite). `sub_activities` es un nivel,
nunca recursivo.
"""
from __future__ import annotations

from typing import Any


def _str_or_null() -> dict[str, Any]:
    return {"anyOf": [{"type": "string"}, {"type": "null"}]}


def _int_or_null() -> dict[str, Any]:
    return {"anyOf": [{"type": "integer"}, {"type": "null"}]}


def _named_item(*, with_affiliate: bool, with_sub: bool) -> dict[str, Any]:
    properties: dict[str, Any] = {
        "name": {"type": "string"},
        "type": {"type": "string"},
        "notes": _str_or_null(),
        "region": _str_or_null(),
    }
    required = ["name", "type", "notes", "region"]
    if with_affiliate:
        properties["affiliate_url"] = _str_or_null()
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
                        "from": _str_or_null(),
                        "to": _str_or_null(),
                        "notes": _str_or_null(),
                        "region": _str_or_null(),
                    },
                    "required": ["type", "from", "to", "notes", "region"],
                },
            },
            "tips": _str_or_null(),
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


def itinerary_json_schema(*, total_days_nullable: bool) -> dict[str, Any]:
    total_days: dict[str, Any] = (
        _int_or_null() if total_days_nullable else {"type": "integer"}
    )
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "destination": {"type": "string"},
            "total_days": total_days,
            "source_structured_by_days": {"type": "boolean"},
            "days": {"type": "array", "items": _day_schema()},
            "general_tips": _str_or_null(),
            "basics": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "category": {"type": "string"},
                        "name": {"type": "string"},
                        "vendor": _str_or_null(),
                        "notes": _str_or_null(),
                        "affiliate_url": _str_or_null(),
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


BLOG_ITINERARY_SCHEMA = itinerary_json_schema(total_days_nullable=False)
INSTAGRAM_ITINERARY_SCHEMA = itinerary_json_schema(total_days_nullable=True)

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


def output_config_for(schema: dict[str, Any]) -> dict[str, Any]:
    return {"format": {"type": "json_schema", "schema": schema}}
