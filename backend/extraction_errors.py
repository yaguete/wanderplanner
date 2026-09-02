"""Mensajes públicos de POST /itinerary y /partners/prewarm.

El catch-all no debe mandar `str(exc)` al cliente: el SDK de Anthropic
serializa 529/429 como un dict Python (`overloaded_error`, `request_id`).
"""

from __future__ import annotations

import re
from typing import Any

import anthropic

# Espejo de frontend/lib/extraction-errors.ts
EXTRACTION_PROVIDER_BUSY = (
    "Para extraer el artículo usamos proveedores de IA que justo ahora "
    "están funcionando regular."
)
EXTRACTION_GENERIC_FAILURE = (
    "No hemos podido destilar esta fuente. Prueba otra vez en unos segundos."
)

_RETRYABLE_STATUS = frozenset({408, 409, 429, 500, 502, 503, 504, 529})
_RETRYABLE_TYPES = frozenset(
    {
        "overloaded_error",
        "rate_limit_error",
        "api_error",
        "timeout_error",
    }
)
_DUMP_RE = re.compile(
    r"overloaded_error|rate_limit_error|request_id|['\"]type['\"]\s*:\s*['\"]error['\"]",
    re.IGNORECASE,
)


def looks_like_provider_dump(text: str) -> bool:
    """True si el texto parece un error crudo del proveedor, no copy nuestro."""
    s = text.strip()
    if not s:
        return False
    if s in (EXTRACTION_PROVIDER_BUSY, EXTRACTION_GENERIC_FAILURE):
        return False
    if "req_" in s and "request_id" in s:
        return True
    return _DUMP_RE.search(s) is not None


def _status_code(exc: BaseException) -> int | None:
    raw: Any = getattr(exc, "status_code", None)
    return raw if isinstance(raw, int) else None


def _error_type(exc: BaseException) -> str | None:
    raw: Any = getattr(exc, "type", None)
    return raw if isinstance(raw, str) and raw.strip() else None


def log_detail(exc: BaseException, limit: int = 300) -> str | None:
    """Mensaje real de la excepción para el log de una línea de `log_kv`.

    El cliente ya solo ve copy nuestro: si esto no se registra, un fallo
    inesperado no deja rastro más allá del nombre de la clase.
    """
    text = " ".join(str(exc).split())
    if not text:
        return None
    return text if len(text) <= limit else text[: limit - 1] + "…"


def public_extraction_detail(exc: BaseException) -> str:
    """Copy seguro para el evento SSE `error`. El tipo real va en los logs."""
    if isinstance(exc, (anthropic.APIConnectionError, anthropic.APITimeoutError)):
        return EXTRACTION_PROVIDER_BUSY
    if isinstance(exc, anthropic.APIStatusError):
        code = _status_code(exc)
        err_type = _error_type(exc)
        if code in _RETRYABLE_STATUS or err_type in _RETRYABLE_TYPES:
            return EXTRACTION_PROVIDER_BUSY
        return EXTRACTION_GENERIC_FAILURE
    if isinstance(exc, ValueError):
        msg = str(exc).strip()
        if msg and not looks_like_provider_dump(msg):
            return msg
    dumped = str(exc)
    if looks_like_provider_dump(dumped):
        return EXTRACTION_PROVIDER_BUSY
    return EXTRACTION_GENERIC_FAILURE
