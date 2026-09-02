"""
Heurística para distinguir fuentes de inspiración (blogs, guías, crónicas
extraíbles a itinerario) de enlaces de referencia: ministerios, taquillas,
OTAs, webs oficiales de una atracción…

«Añadir fuente» indexa el artículo en el viaje. Citar el origen de un precio
o un horario no debe disparar eso.

Espejo de frontend/lib/inspirational-source.ts: si cambias una, cambia la otra.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

from instagram_url import is_instagram_media_url

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

REFERENCE_HOST_SUFFIXES = (
    "booking.com",
    "expedia.com",
    "hotels.com",
    "airbnb.com",
    "airbnb.es",
    "homeexchange.com",
    "agoda.com",
    "kayak.com",
    "skyscanner.com",
    "skyscanner.es",
    "trivago.com",
    "getyourguide.com",
    "viator.com",
    "tiqets.com",
    "klook.com",
    "musement.com",
    "civitatis.com",
    "headout.com",
    "ticketmaster.com",
    "eventbrite.com",
    "eventim.com",
    "feverup.com",
    "tripadvisor.com",
    "tripadvisor.es",
    "google.com",
    "google.es",
    "maps.google.com",
    "wikipedia.org",
    "wikivoyage.org",
    "wikimedia.org",
    "accuweather.com",
    "weather.com",
    "meteoblue.com",
    "wetter.com",
    "instagram.com",
    "tiktok.com",
    "facebook.com",
    "pinterest.com",
    "youtube.com",
    "youtu.be",
    "twitter.com",
    "x.com",
    "reddit.com",
    "axess.shop",
)

REFERENCE_TLDS = (".shop", ".museum")

REFERENCE_HOST_TOKENS = frozenset(
    {
        "museum",
        "museums",
        "museo",
        "museos",
        "musee",
        "palace",
        "palacio",
        "palais",
        "palazzo",
        "castle",
        "castillo",
        "chateau",
        "schloss",
        "festung",
        "cathedral",
        "catedral",
        "basilica",
        "basilique",
        "zoo",
        "aquarium",
        "airport",
        "aeropuerto",
        "flughafen",
        "tickets",
        "ticket",
        "ticketing",
        "axess",
    }
)

REFERENCE_SUBDOMAIN_LABELS = frozenset(
    {"tickets", "ticket", "shop", "store", "booking", "buy"}
)

REFERENCE_PATH_SEGMENTS = frozenset(
    {
        "ticket",
        "tickets",
        "entrada",
        "entradas",
        "eintrittskarten",
        "biglietti",
        "shop",
        "store",
        "cart",
        "checkout",
        "buy",
        "purchase",
        "prices",
        "price",
        "precio",
        "precios",
        "preise",
        "tarifs",
        "tarifa",
        "tarifas",
        "hours",
        "horarios",
        "horario",
        "opening-hours",
        "opening",
        "orari",
        "visit",
        "visitor",
        "visitors",
    }
)

LOCALE_SEGMENTS = frozenset(
    {
        "en",
        "es",
        "de",
        "fr",
        "it",
        "pt",
        "ja",
        "zh",
        "nl",
        "pl",
        "ru",
        "uk",
        "ca",
        "eu",
        "gl",
        "en-us",
        "en-gb",
        "es-es",
        "pt-br",
        "zh-cn",
        "zh-tw",
    }
)

_FILE_EXT = re.compile(r"\.(?:html?|php|aspx)$", re.I)
_VENUE_IN_LABEL = re.compile(r"museum|museo|musee|festung")
_GO_CC = re.compile(r"\.go\.[a-z]{2}$", re.I)
_GOV_CC = re.compile(r"\.gov\.[a-z]{2,}$", re.I)


def _parse(url: str) -> tuple[str, str] | None:
    raw = (url or "").strip()
    if not raw.startswith(("http://", "https://")):
        return None
    try:
        parsed = urlparse(raw)
    except Exception:
        return None
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if not host:
        return None
    return host, parsed.path or "/"


def _host_labels(host: str) -> list[str]:
    labels: list[str] = []
    for part in host.split("."):
        labels.extend(p for p in part.split("-") if p)
    return labels


def _path_segments(path: str) -> list[str]:
    return [seg.lower() for seg in path.split("/") if seg]


def _matches_suffix(host: str, suffix: str) -> bool:
    bare = suffix.lstrip(".")
    return host == bare or host.endswith(suffix)


def _is_institutional_host(host: str) -> bool:
    if _GO_CC.search(host):
        return True
    for suffix in INSTITUTIONAL_HOST_SUFFIXES:
        if _matches_suffix(host, suffix):
            return True
    if _GOV_CC.search(host):
        return True
    return any(part in host for part in INSTITUTIONAL_HOST_PARTS)


def _is_reference_host(host: str) -> bool:
    if any(_matches_suffix(host, tld) for tld in REFERENCE_TLDS):
        return True
    for suffix in REFERENCE_HOST_SUFFIXES:
        if host == suffix or host.endswith("." + suffix):
            return True
    labels = _host_labels(host)
    if any(label in REFERENCE_HOST_TOKENS for label in labels):
        return True
    if any(_VENUE_IN_LABEL.search(label) for label in labels):
        return True
    first = host.split(".", 1)[0]
    return first in REFERENCE_SUBDOMAIN_LABELS


def _is_reference_path(path: str) -> bool:
    for seg in _path_segments(path):
        if _FILE_EXT.sub("", seg) in REFERENCE_PATH_SEGMENTS:
            return True
    return False


def _looks_like_article_path(path: str) -> bool:
    meaningful = [
        _FILE_EXT.sub("", seg)
        for seg in _path_segments(path)
        if _FILE_EXT.sub("", seg) not in LOCALE_SEGMENTS
    ]
    return bool(meaningful)


def is_institutional_source_url(url: str) -> bool:
    parsed = _parse(url)
    if not parsed:
        return False
    return _is_institutional_host(parsed[0])


def is_inspirational_source_url(url: str) -> bool:
    parsed = _parse(url)
    if not parsed:
        return False
    host, path = parsed
    if _is_institutional_host(host):
        return False
    if is_instagram_media_url(url):
        return True
    if _is_reference_host(host) or _is_reference_path(path):
        return False
    return _looks_like_article_path(path)


def host_is_feedable(host: str) -> bool:
    """¿Este host puede publicar un feed de artículos (no OTA, IG, ministerio…)?"""
    h = (host or "").strip().lower().removeprefix("www.")
    if not h:
        return False
    if _is_institutional_host(h) or _is_reference_host(h):
        return False
    return True
