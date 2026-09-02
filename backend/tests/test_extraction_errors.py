import anthropic
import httpx
import pytest
from unittest.mock import AsyncMock, patch

import main as main_mod
from extraction_errors import (
    EXTRACTION_GENERIC_FAILURE,
    EXTRACTION_PROVIDER_BUSY,
    looks_like_provider_dump,
    public_extraction_detail,
)


DUMP = (
    "{'type': 'error', 'error': {'details': None, 'type': 'overloaded_error', "
    "'message': 'Overloaded'}, 'request_id': 'req_011CeedFxiV3BCuyDjMb6hWE'}"
)


async def _collect_sse(agen):
    events = []
    async for chunk in agen:
        events.append(chunk)
    return "".join(events)


def test_screenshot_dump_is_provider_busy():
    assert looks_like_provider_dump(DUMP)
    assert public_extraction_detail(Exception(DUMP)) == EXTRACTION_PROVIDER_BUSY


def test_json_dump_is_provider_busy():
    raw = (
        '{"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}, '
        '"request_id": "req_011CeedFxiV3BCuyDjMb6hWE"}'
    )
    assert public_extraction_detail(RuntimeError(raw)) == EXTRACTION_PROVIDER_BUSY


def test_keeps_friendly_value_error():
    msg = "No hemos podido destilar esta fuente. Prueba otra vez en unos segundos."
    assert public_extraction_detail(ValueError(msg)) == msg


def test_unknown_exception_is_generic():
    assert public_extraction_detail(RuntimeError("boom")) == EXTRACTION_GENERIC_FAILURE


def test_busy_copy_is_not_a_dump():
    assert not looks_like_provider_dump(EXTRACTION_PROVIDER_BUSY)
    assert not looks_like_provider_dump(EXTRACTION_GENERIC_FAILURE)


def _status_error(status: int, err_type: str, message: str) -> anthropic.APIStatusError:
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    body = {"type": "error", "error": {"type": err_type, "message": message}}
    response = httpx.Response(status, request=request, json=body)
    return anthropic.APIStatusError(message, response=response, body=body)


def test_anthropic_overloaded_is_busy():
    exc = _status_error(529, "overloaded_error", "Overloaded")
    assert public_extraction_detail(exc) == EXTRACTION_PROVIDER_BUSY


def test_anthropic_rate_limit_is_busy():
    exc = _status_error(429, "rate_limit_error", "Rate limited")
    assert public_extraction_detail(exc) == EXTRACTION_PROVIDER_BUSY


def test_anthropic_bad_request_is_generic():
    exc = _status_error(400, "invalid_request_error", "Invalid")
    assert public_extraction_detail(exc) == EXTRACTION_GENERIC_FAILURE


@pytest.mark.asyncio
async def test_stream_itinerary_does_not_leak_provider_dump():
    dump = Exception(DUMP)
    with patch.object(main_mod, "_distill_article", new=AsyncMock(side_effect=dump)):
        body = await _collect_sse(
            main_mod._stream_itinerary(
                "https://example.com/a", entry=None, user=None, refresh=False
            )
        )
    assert EXTRACTION_PROVIDER_BUSY in body
    assert "overloaded_error" not in body
    assert "req_011" not in body
