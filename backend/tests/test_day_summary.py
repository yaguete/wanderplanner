"""POST /day-summary: saneado y llamada a Haiku sin kwargs rotos del SDK 1.0."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from day_summary import _call_haiku, sanitize_day_summary


def test_sanitize_strips_day_prefix_and_caps_words():
    assert sanitize_day_summary('  "Día 1 · Tapas en Granada."  ') == "Tapas en Granada"
    assert sanitize_day_summary("una dos tres cuatro cinco") == "una dos tres cuatro"


def test_call_haiku_does_not_pass_temperature(monkeypatch):
    """Anthropic SDK 1.0: temperature= en messages.create() es TypeError."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    block = SimpleNamespace(type="text", text="Tapas en Granada")
    usage = SimpleNamespace(output_tokens=6)
    message = SimpleNamespace(content=[block], usage=usage)
    client = MagicMock()
    client.messages.create.return_value = message
    with patch("day_summary.anthropic.Anthropic", return_value=client):
        raw, tokens = _call_haiku("Día 1. Ítems: tapas.")
    assert raw == "Tapas en Granada"
    assert tokens == 6
    kwargs = client.messages.create.call_args.kwargs
    assert "temperature" not in kwargs
    assert "top_p" not in kwargs
    assert "top_k" not in kwargs
