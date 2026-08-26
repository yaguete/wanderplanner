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
    assert share_length_target(1) == (350, 600, 320)
    assert share_length_target(4) == (350, 600, 320)
    assert share_length_target(5) == (700, 1100, 520)
    assert share_length_target(9) == (700, 1100, 520)
    assert share_length_target(10) == (1200, 1800, 800)
    assert share_length_target(60)[1] <= 1800
    for n in (1, 4, 5, 9, 10, 21):
        _mn, mx, tokens = share_length_target(n)
        assert mx <= 1800
        assert tokens in (320, 520, 800)


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
