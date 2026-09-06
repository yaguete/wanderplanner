"""POST /share-summary: saneado, tramos de longitud y llamada DeepSeek sin tools."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from share_summary import (
    SHARE_TEXT_MAX,
    _call_deepseek,
    sanitize_share_summary,
    share_length_target,
)


def test_sanitize_strips_fences_bold_preamble_and_nul():
    raw = "```md\nAquí tienes tu resumen:\n**Día 2** · 3 noches\x00 en Granada\n```"
    out = sanitize_share_summary(raw)
    assert "```" not in out
    assert "**" not in out
    assert "\x00" not in out
    assert out.startswith("Día 2")
    assert "3 noches" in out
    assert "Aquí tienes" not in out


def test_sanitize_keeps_day_numbers_and_cuts_at_newline():
    body = "Día 2 · llegada\n" + ("hola mundo\n" * 200)
    out = sanitize_share_summary(body)
    assert len(out) <= SHARE_TEXT_MAX
    assert "Día 2" in out
    assert not out.endswith("mun")  # no corte a mitad de palabra


def test_sanitize_empty_after_strip():
    assert sanitize_share_summary("   \n  ") == ""


def test_share_length_target_boundaries():
    assert share_length_target(1) == (350, 600, 500)
    assert share_length_target(4) == (350, 600, 500)
    assert share_length_target(5) == (700, 1100, 900)
    assert share_length_target(9) == (700, 1100, 900)
    assert share_length_target(10) == (1200, 1800, 1400)
    assert share_length_target(60)[1] <= 1800
    for n in (1, 4, 5, 9, 10, 21):
        _mn, mx, tokens = share_length_target(n)
        assert mx <= 1800
        assert tokens in (500, 900, 1400)


def test_sanitize_drops_orphan_day_heading():
    raw = (
        "Mira el road trip de Alaska.\n"
        "Día 12 · Denali\n"
        "- Vuelo interior y un rato en el parque.\n"
        "Día 13 · Fairbanks y Chena"
    )
    out = sanitize_share_summary(raw)
    assert "Denali" in out
    assert "Fairbanks y Chena" not in out


def test_sanitize_keeps_transfer_day_with_period():
    raw = (
        "Día 4 · Albaycín sin prisa\n"
        "- Tapeo y baños árabes.\n"
        "Día 5 · Vuelta a casa."
    )
    out = sanitize_share_summary(raw)
    assert "Día 5 · Vuelta a casa." in out


def test_sanitize_drops_hanging_credits():
    raw = (
        "Granada en un finde.\n\n"
        "Ideas sacadas de: Guía de tapas (@lacosmopolilla), QUÉ VER (@sinmapa) y"
    )
    out = sanitize_share_summary(raw)
    assert "Granada en un finde." in out
    assert "sinmapa" not in out
    assert not out.endswith(" y")


def test_sanitize_keeps_complete_credits():
    raw = "Granada en un finde.\n\nIdeas sacadas de: Guía de tapas (@lacosmopolilla)"
    out = sanitize_share_summary(raw)
    assert "Ideas sacadas de: Guía de tapas (@lacosmopolilla)" in out


@pytest.mark.asyncio
async def test_call_deepseek_no_tools_and_max_tokens(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test")
    monkeypatch.setenv("SHARE_SUMMARY_MODEL", "deepseek-v4-flash")
    choice = SimpleNamespace(message=SimpleNamespace(content="Día 1 · tapa"))
    usage = SimpleNamespace(completion_tokens=12)
    completion = SimpleNamespace(choices=[choice], usage=usage)
    client = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=completion)
    with patch("share_summary.AsyncOpenAI", return_value=client):
        raw, tokens = await _call_deepseek("plan", 320)
    assert raw == "Día 1 · tapa"
    assert tokens == 12
    kwargs = client.chat.completions.create.await_args.kwargs
    assert "tools" not in kwargs
    assert kwargs["max_tokens"] == 320
    assert kwargs["model"] == "deepseek-v4-flash"
    assert kwargs["extra_body"] == {"thinking": {"type": "disabled"}}


def test_share_plan_keeps_rental_days_and_stay_nights():
    from share_summary import ShareSummaryRequest

    body = ShareSummaryRequest.model_validate(
        {
            "trip_name": "Escocia",
            "num_days": 5,
            "days": [
                {
                    "index": 1,
                    "items": [
                        {
                            "type": "transport",
                            "name": "Coche de alquiler · Hertz",
                            "region": "Edimburgo → Glasgow",
                            "days": 4,
                            "route": None,
                        },
                        {"type": "stay", "name": "Hotel", "nights": 3},
                    ],
                }
            ],
        }
    )
    dumped = body.model_dump()
    rental = dumped["days"][0]["items"][0]
    stay = dumped["days"][0]["items"][1]
    assert rental["name"] == "Coche de alquiler · Hertz"
    assert rental["days"] == 4
    assert rental["route"] is None
    assert stay["nights"] == 3
    message = body.model_dump(by_alias=True)
    assert message["days"][0]["items"][0]["days"] == 4

