"""Tests de GET /country-tasks: parseo, ids, normalización y flujo con mocks."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from country_tasks import (
    DISCLAIMER,
    _call_haiku_distill,
    normalize_tasks_payload,
    parse_country_codes,
    stable_task_id,
)
from country_tasks_cache import CONTENT_VERSION


def test_parse_country_codes_dedupes_and_uppercases():
    assert parse_country_codes("ES, th ,ES,FR") == ["ES", "TH", "FR"]


def test_parse_country_codes_rejects_empty():
    with pytest.raises(HTTPException) as ei:
        parse_country_codes(" , ,")
    assert ei.value.status_code == 400


def test_parse_country_codes_rejects_too_many():
    codes = [f"{a}{b}" for a in "ABCDEF" for b in "ABCDEFGH"][:13]
    assert len(codes) == 13
    with pytest.raises(HTTPException) as ei:
        parse_country_codes(",".join(codes))
    assert ei.value.status_code == 400


def test_stable_task_id_namespace():
    assert stable_task_id("TH", "Visado TDAC") == "country:th:visado-tdac"
    assert stable_task_id("th", "ESTA") == "country:th:esta"


def test_normalize_tasks_payload_filters_invalid():
    tasks = normalize_tasks_payload(
        "TH",
        {
            "tasks": [
                {
                    "id_slug": "tdac",
                    "title": "Tramitar TDAC de Tailandia",
                    "category": "paperwork",
                    "lead_time_days": 3,
                    "details": "Tres días antes.",
                },
                {
                    "id_slug": "seguro",
                    "title": "Contratar seguro",
                    "category": "other",
                },
                {
                    "id_slug": "vacunas",
                    "title": "Vacunas recomendadas",
                    "category": "health",
                    "lead_time_days": None,
                    "details": None,
                },
                {"title": "", "category": "paperwork"},
            ]
        },
    )
    assert [t.id for t in tasks] == [
        "country:th:tdac",
        "country:th:vacunas",
    ]
    assert tasks[0].lead_time_days == 3
    assert tasks[1].category == "health"


def test_normalize_empty_list():
    assert normalize_tasks_payload("FR", {"tasks": []}) == []
    assert normalize_tasks_payload("FR", {}) == []


@pytest.mark.asyncio
async def test_process_country_cache_hit_skips_claude(monkeypatch):
    from country_tasks import _process_country

    brief = {
        "TH": {
            "text": "TDAC tres días antes. Vacunas recomendadas hepatitis A.",
            "meta": {
                "sha256": "abc123",
                "fetched_at": "2026-08-01T00:00:00+00:00",
            },
        }
    }
    cached_payload = {
        "country_code": "TH",
        "tasks": [
            {
                "id": "country:th:tdac",
                "title": "Tramitar TDAC de Tailandia",
                "category": "paperwork",
                "lead_time_days": 3,
                "details": "Completar tres días antes.",
            }
        ],
    }

    with (
        patch("country_tasks.ensure_travel_briefs", AsyncMock(return_value=brief)),
        patch(
            "country_tasks.get_cached_country_tasks",
            AsyncMock(return_value=cached_payload),
        ) as get_cache,
        patch("country_tasks._call_haiku_distill") as distill,
        patch("country_tasks.record_event", AsyncMock()) as record,
        patch("country_tasks.enforce_usage", AsyncMock()) as enforce,
    ):
        entry = await _process_country("TH", user=None)
        assert entry.error is None
        assert entry.cached is True
        assert entry.url is not None
        assert "trc=" in entry.url or "recomendaciones" in entry.url.lower()
        assert len(entry.tasks) == 1
        assert entry.tasks[0].id == "country:th:tdac"
        distill.assert_not_called()
        record.assert_not_called()
        enforce.assert_not_called()
        get_cache.assert_awaited()


@pytest.mark.asyncio
async def test_process_country_miss_distills_and_stores(monkeypatch):
    from auth import AuthUser
    from country_tasks import _process_country

    brief = {
        "TH": {
            "text": "TDAC tres días antes.",
            "meta": {
                "sha256": "sha-th",
                "fetched_at": "2026-08-01T00:00:00+00:00",
            },
        }
    }
    haiku = {
        "country_code": "TH",
        "tasks": [
            {
                "id_slug": "tdac",
                "title": "Tramitar TDAC de Tailandia",
                "category": "paperwork",
                "lead_time_days": 3,
                "details": "Tres días antes.",
            }
        ],
    }
    user = AuthUser(id="user-1", email="a@b.c", is_anonymous=False)

    with (
        patch("country_tasks.ensure_travel_briefs", AsyncMock(return_value=brief)),
        patch("country_tasks.get_cached_country_tasks", AsyncMock(return_value=None)),
        patch(
            "country_tasks._call_haiku_distill",
            return_value=(haiku, 42),
        ) as distill,
        patch("country_tasks.store_country_tasks", AsyncMock()) as store,
        patch("country_tasks.record_event", AsyncMock()) as record,
        patch("country_tasks.enforce_usage", AsyncMock()) as enforce,
    ):
        entry = await _process_country("TH", user=user)
        assert entry.cached is False
        assert entry.tasks[0].id == "country:th:tdac"
        distill.assert_called_once()
        store.assert_awaited()
        enforce.assert_awaited_once()
        record.assert_awaited_once()
        assert record.await_args.args[0] == "user-1"
        assert record.await_args.args[1] == "country_tasks"


@pytest.mark.asyncio
async def test_process_country_brief_error_no_claude():
    from country_tasks import _process_country

    brief = {
        "XX": {
            "text": "",
            "meta": {"error": "HTTP 404"},
        }
    }
    # XX no está en ISO_TO_NAME → error de mapeo antes del brief.
    entry = await _process_country("ZZ", user=None)
    assert entry.tasks == []
    assert entry.error

    with (
        patch("country_tasks.ensure_travel_briefs", AsyncMock(return_value={
            "FR": {"text": "", "meta": {"error": "HTTP 404"}},
        })),
        patch("country_tasks._call_haiku_distill") as distill,
    ):
        entry = await _process_country("FR", user=None)
        assert entry.tasks == []
        assert "no disponible" in (entry.error or "").lower() or "HTTP" in (entry.error or "")
        distill.assert_not_called()


@pytest.mark.asyncio
async def test_single_flight_dedupes_distill():
    from auth import AuthUser
    from country_tasks import _distill_country

    calls = {"n": 0}

    def fake_haiku(code: str, text: str):
        calls["n"] += 1
        return (
            {
                "country_code": code,
                "tasks": [
                    {
                        "id_slug": "tdac",
                        "title": "TDAC",
                        "category": "paperwork",
                        "lead_time_days": 3,
                        "details": None,
                    }
                ],
            },
            10,
        )

    user = AuthUser(id="u1", email=None, is_anonymous=True)

    async def fake_get(code, sha, *, content_version=CONTENT_VERSION):
        return None

    with (
        patch("country_tasks.get_cached_country_tasks", side_effect=fake_get),
        patch("country_tasks._call_haiku_distill", side_effect=fake_haiku),
        patch("country_tasks.store_country_tasks", AsyncMock()),
        patch("country_tasks.record_event", AsyncMock()) as record,
        patch("country_tasks.enforce_usage", AsyncMock()),
    ):
        t1 = asyncio.create_task(
            _distill_country("TH", "brief", "sha", "2026-08-01T00:00:00Z", user)
        )
        t2 = asyncio.create_task(
            _distill_country("TH", "brief", "sha", "2026-08-01T00:00:00Z", user)
        )
        r1, r2 = await asyncio.gather(t1, t2)
        assert calls["n"] == 1
        assert r1[0][0].id == "country:th:tdac"
        assert r2[0][0].id == "country:th:tdac"
        assert record.await_count == 1


def test_thailand_fixture_mentions_tdac():
    """Fixture de aceptación: el texto MAE de TH incluye el trámite real."""
    from pathlib import Path

    fixture = Path(__file__).parent / "fixtures" / "travel_brief_th.txt"
    text = fixture.read_text(encoding="utf-8")
    assert "TDAC" in text or "Tarjeta digital" in text
    assert "visado" in text.lower() or "Visados" in text


def test_disclaimer_mentions_spanish_passport():
    assert "pasaporte español" in DISCLAIMER.lower() or "españoles" in DISCLAIMER.lower()


def test_call_haiku_distill_does_not_pass_temperature(monkeypatch):
    """Anthropic SDK 1.0: temperature= en messages.create() es TypeError."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    payload = '{"tasks": []}'
    block = SimpleNamespace(type="text", text=payload)
    usage = SimpleNamespace(output_tokens=3)
    message = SimpleNamespace(content=[block], usage=usage)
    client = MagicMock()
    client.messages.create.return_value = message
    with patch("country_tasks.anthropic.Anthropic", return_value=client):
        data, tokens = _call_haiku_distill("ES", "brief")
    assert data == {"tasks": []}
    assert tokens == 3
    kwargs = client.messages.create.call_args.kwargs
    assert "temperature" not in kwargs
    assert "top_p" not in kwargs
    assert "top_k" not in kwargs
