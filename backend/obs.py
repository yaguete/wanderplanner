"""Logging estructurado clave=valor en una línea (sin dependencias extra)."""
from __future__ import annotations

import logging
from typing import Any


def _fmt(v: Any) -> str:
    if v is None:
        return "-"
    if isinstance(v, bool):
        return "true" if v else "false"
    s = str(v)
    if any(c in s for c in (" ", "=", '"')):
        return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return s


def log_kv(logger: logging.Logger, **fields: Any) -> None:
    logger.info(" ".join(f"{k}={_fmt(v)}" for k, v in fields.items()))
