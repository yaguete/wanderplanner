"""
Heurística para distinguir fuentes de inspiración (blogs, guías) de
enlaces institucionales. Espejo de frontend/lib/inspirational-source.ts:
si cambias una, cambia la otra.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

INSTITUTIONAL_HOST_SUFFIXES = (
    ".gob.es",
    ".gob.mx",
    ".gob.ar",
    ".gob.pe",
    ".gob.cl",
    ".gov",
    ".gov.uk",
    ".gouv.fr",
    ".europa.eu",
    ".who.int",
    ".un.org",
    ".cdc.gov",
)

INSTITUTIONAL_HOST_PARTS = (
    "immigration",
    "visa",
    "visas",
    "consul",
    "embassy",
    "exteriores",
    "maeuec",
    "interior.gob",
    "sanidad",
    "salud",
    "police",
    "customs",
    "aduana",
)


def _host(url: str) -> str:
    try:
        host = (urlparse(url.strip()).hostname or "").lower()
    except Exception:
        return ""
    return host.removeprefix("www.")


def is_institutional_source_url(url: str) -> bool:
    host = _host(url)
    if not host:
        return False
    if re.search(r"\.go\.[a-z]{2}$", host):
        return True
    for suffix in INSTITUTIONAL_HOST_SUFFIXES:
        bare = suffix.lstrip(".")
        if host == bare or host.endswith(suffix):
            return True
    if re.search(r"\.gov\.[a-z]{2,}$", host):
        return True
    return any(part in host for part in INSTITUTIONAL_HOST_PARTS)


def is_inspirational_source_url(url: str) -> bool:
    raw = (url or "").strip()
    if not raw.startswith(("http://", "https://")):
        return False
    return not is_institutional_source_url(raw)
