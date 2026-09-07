"""Pruebas de GET /sources/suggest (sanitización, cascada, curados, cap)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

import source_suggest as mod
from source_suggest import (
    SuggestHit,
    cache_hits_for_query,
    curated_search_query,
    hit_from_cache_row,
    hit_from_tavily,
    host_is_curated,
    is_destination_index,
    merge_hits,
    rewrite_feed_amp_url,
    sanitize_suggest_query,
    sources_suggest,
    text_matches,
)


def _fresh_iso(days: int = 1) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def test_sanitize_rejects_short_and_strips_syntax():
    assert sanitize_suggest_query("ab") is None
    assert sanitize_suggest_query("  ja  ") is None
    assert sanitize_suggest_query("vietnam") == "vietnam"
    assert sanitize_suggest_query("Costa Rica") == "Costa Rica"
    assert sanitize_suggest_query("japón") == "japón"
    assert sanitize_suggest_query("viet*nam,()") == "vietnam"
    assert sanitize_suggest_query("a" * 80) == "a" * 60


def test_host_is_curated_matches_subdomains():
    assert host_is_curated("lacosmopolilla.com")
    assert host_is_curated("www.lacosmopolilla.com")
    assert host_is_curated("www.japonismo.com")
    assert host_is_curated("blog.japonismo.com")
    assert host_is_curated("evil.example") is False
    assert host_is_curated("exteriores.gob.es") is False


def test_text_matches_folds_accents():
    assert text_matches("japon", "Japón en 15 días")
    assert text_matches("Japón", "Itinerario por japon")
    assert text_matches("costa rica", "Costa Rica, Centroamérica")
    assert text_matches("islandia", "Ruta por Vietnam") is False


def test_curated_query_is_destination_only():
    assert curated_search_query("cuenca") == "cuenca"
    assert curated_search_query("Austria") == "Austria"


def test_rewrite_feed_amp_to_article():
    assert (
        rewrite_feed_amp_url("https://lacosmopolilla.com/cuenca-en-un-dia/feed")
        == "https://lacosmopolilla.com/cuenca-en-un-dia"
    )
    assert (
        rewrite_feed_amp_url("https://blog.com/ruta-austria/amp/")
        == "https://blog.com/ruta-austria"
    )
    assert rewrite_feed_amp_url("https://blog.com/ruta-austria") == "https://blog.com/ruta-austria"


def test_tavily_rewrites_feed_instead_of_dropping():
    hit = hit_from_tavily(
        {
            "url": "https://lacosmopolilla.com/cuenca-en-un-dia/feed",
            "title": "Cuenca en un día",
        },
        origin="curated",
        query="cuenca",
    )
    assert hit is not None
    assert hit.url == "https://lacosmopolilla.com/cuenca-en-un-dia"
    article = hit_from_tavily(
        {"url": "https://lacosmopolilla.com/cuenca-en-un-dia", "title": "Cuenca en un día"},
        origin="curated",
        query="cuenca",
    )
    assert article is not None
    assert article.origin == "curated"


def test_drops_destination_index_pages():
    assert is_destination_index(
        "https://losviajesdeclaudia.com/austria",
        "Viajar a Austria, el país de…",
        "austria",
    )
    assert is_destination_index(
        "https://www.viajeros30.com/europa/austria",
        "Austria",
        "austria",
    )
    assert is_destination_index(
        "https://www.viajeroscallejeros.com/viajes/asia/japon",
        "japón",
        "japon",
    )
    assert is_destination_index(
        "https://viajeroscallejeros.com/guia-de-austria",
        "Guía de Austria: toda la información…",
        "austria",
    )
    assert (
        is_destination_index(
            "https://losviajesdeclaudia.com/austria/que-ver-en-innsbruck-tirol",
            "Qué ver en Innsbruck",
            "austria",
        )
        is False
    )
    assert (
        hit_from_tavily(
            {
                "url": "https://losviajesdeclaudia.com/austria",
                "title": "Austria Archives",
            },
            origin="curated",
            query="austria",
        )
        is None
    )


def test_tavily_drops_off_topic_itineraries():
    assert (
        hit_from_tavily(
            {
                "url": "https://www.mochileandoporelmundo.com/itinerario-viaje-myanmar",
                "title": "Itinerario de viaje a Myanmar de 2 y 3 semanas",
                "content": "Blog de viajes con guías…",
            },
            origin="curated",
            query="zambia",
        )
        is None
    )
    assert (
        hit_from_tavily(
            {
                "url": "https://www.viajeroscallejeros.com/tag/cuenca",
                "title": "Cuenca",
            },
            origin="curated",
            query="cuenca",
        )
        is None
    )
    assert (
        hit_from_tavily(
            {
                "url": "https://www.viajeroscallejeros.com/page/3?s=madrid",
                "title": "madrid",
                "content": "También Cuenca y Teruel",
            },
            origin="curated",
            query="cuenca",
        )
        is None
    )


def test_cache_row_skips_private_hosts_and_expired():
    row = {
        "url": "https://mi-blog-secreto.example/japon/",
        "og_title": "Japón",
        "destination": "Japón",
        "validated_at": _fresh_iso(1),
    }
    assert hit_from_cache_row(row) is None

    expired = {
        "url": "https://lacosmopolilla.com/japon/",
        "og_title": "Japón",
        "destination": "Japón",
        "validated_at": _fresh_iso(400),
    }
    assert hit_from_cache_row(expired) is None

    ok = {
        "url": "https://lacosmopolilla.com/japon/",
        "og_title": "Japón en 15 días",
        "destination": "Japón",
        "total_days": 15,
        "validated_at": _fresh_iso(1),
    }
    hit = hit_from_cache_row(ok)
    assert hit is not None
    assert hit.origin == "cache"
    assert hit.instant is True
    assert hit.host == "lacosmopolilla.com"


def test_cache_row_skips_poisoned_without_title():
    edinburgh = {
        "url": "https://losviajesdeclaudia.com/reino-unido/escocia/que-ver-en-edimburgo-que-hacer",
        "destination": None,
        "og_title": None,
        "total_days": None,
        "validated_at": _fresh_iso(1),
    }
    assert hit_from_cache_row(edinburgh) is None
    scotland = {
        "url": "https://losviajesdeclaudia.com/reino-unido/escocia/que-ver-en-escocia",
        "destination": "No article provided",
        "og_title": None,
        "total_days": 0,
        "validated_at": _fresh_iso(1),
    }
    assert hit_from_cache_row(scotland) is None


def test_cache_row_keeps_real_destination_without_days():
    row = {
        "url": "https://losviajesdeclaudia.com/reino-unido/escocia/que-ver-en-edimburgo-que-hacer",
        "destination": "Escocia, Reino Unido",
        "og_title": None,
        "total_days": 0,
        "validated_at": _fresh_iso(1),
    }
    hit = hit_from_cache_row(row)
    assert hit is not None
    assert hit.instant is True
    assert hit.destination == "Escocia, Reino Unido"


def test_tavily_web_skips_social_hosts():
    assert (
        hit_from_tavily(
            {"url": "https://www.instagram.com/reel/zambia", "title": "Zambia"},
            origin="web",
            query="zambia",
        )
        is None
    )
    hit = hit_from_tavily(
        {
            "url": "https://www.undiaporelmundo.com/que-hacer-en-zambia",
            "title": "Qué hacer en Zambia",
        },
        origin="web",
        query="zambia",
    )
    assert hit is not None
    assert hit.origin == "web"


def test_tavily_drops_institutional():
    assert (
        hit_from_tavily(
            {"url": "https://www.exteriores.gob.es/japon", "title": "MAE"},
            origin="web",
            query="japon",
        )
        is None
    )
    assert (
        hit_from_tavily(
            {"url": "https://belvedere.at/en/tickets", "title": "Tickets"},
            origin="web",
            query="viena",
        )
        is None
    )
    hit = hit_from_tavily(
        {
            "url": "https://lacosmopolilla.com/vietnam-en-12-dias/",
            "title": "Vietnam en 12 días",
            "content": "12 días",
        },
        origin="curated",
        query="vietnam",
    )
    assert hit is not None
    assert hit.instant is False
    assert hit.origin == "curated"


def test_merge_hits_dedupes_and_caps_at_four():
    def hit(url: str, host: str, origin: str = "cache") -> SuggestHit:
        return SuggestHit(
            url=url,
            title=url,
            host=host,
            origin=origin,  # type: ignore[arg-type]
            instant=origin == "cache",
        )

    merged = merge_hits(
        [hit("https://lacosmopolilla.com/a", "lacosmopolilla.com"), hit("https://lacosmopolilla.com/a/", "lacosmopolilla.com")],
        [
            hit("https://lacosmopolilla.com/b", "lacosmopolilla.com", "curated"),
            hit("https://japonismo.com/c", "japonismo.com", "curated"),
            hit("https://viajeroscallejeros.com/d", "viajeroscallejeros.com", "web"),
            hit("https://losviajesdeclaudia.com/e", "losviajesdeclaudia.com", "web"),
        ],
    )
    assert len(merged) == 4
    assert merged[0].url.rstrip("/").endswith("/a")
    hosts = [h.host for h in merged]
    assert hosts.count("lacosmopolilla.com") <= 2


def test_merge_hits_caps_two_per_host():
    def hit(url: str, host: str) -> SuggestHit:
        return SuggestHit(url=url, title=url, host=host, origin="curated", instant=False)

    merged = merge_hits(
        [
            hit("https://viajeroscallejeros.com/a", "viajeroscallejeros.com"),
            hit("https://viajeroscallejeros.com/b", "viajeroscallejeros.com"),
            hit("https://viajeroscallejeros.com/c", "viajeroscallejeros.com"),
            hit("https://losviajesdeclaudia.com/d", "losviajesdeclaudia.com"),
        ],
        limit=4,
    )
    assert len(merged) == 3
    assert [h.host for h in merged].count("viajeroscallejeros.com") == 2


def test_merge_hits_respects_limit():
    def hit(url: str, host: str) -> SuggestHit:
        return SuggestHit(
            url=url,
            title=url,
            host=host,
            origin="cache",
            instant=True,
        )

    hosts = [
        "lacosmopolilla.com",
        "japonismo.com",
        "viajeroscallejeros.com",
        "viajablog.com",
    ]
    merged = merge_hits(
        [hit(f"https://{h}/{i}", h) for h in hosts for i in (1, 2)],
        limit=8,
    )
    assert len(merged) == 8


def test_cache_hits_for_query_dedupes_canonical():
    canonical = "https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias"
    rows = [
        {
            "url": canonical + "/",
            "canonical_url": canonical,
            "og_title": "Del Tirol a Viena",
            "destination": "Austria",
            "validated_at": _fresh_iso(1),
        },
        {
            "url": canonical,
            "canonical_url": canonical,
            "og_title": "Del Tirol a Viena",
            "destination": "Austria",
            "validated_at": _fresh_iso(1),
        },
        {
            "url": "https://lacosmopolilla.com/viena/",
            "canonical_url": "https://lacosmopolilla.com/viena",
            "og_title": "Viena en 3 días",
            "destination": "Viena, Austria",
            "validated_at": _fresh_iso(1),
        },
    ]
    hits = cache_hits_for_query(rows, "austria")
    assert len(hits) == 2
    assert hits[0].url.rstrip("/") == canonical
    assert hits[1].url.rstrip("/") == "https://lacosmopolilla.com/viena"


def test_cache_row_skips_destination_index():
    # Control: mismo host y misma query, pero URL de ruta concreta. Tiene que ser
    # hit sí o sí. Sin este control, sacar el dominio de la lista de curados hace
    # que las dos aserciones de abajo pasen por el motivo equivocado: la fila se
    # descarta en host_is_curated y nunca se llega a is_destination_index.
    article = {
        "url": "https://lacosmopolilla.com/japon-en-15-dias/",
        "og_title": "Japón en 15 días",
        "destination": "Japón",
        "validated_at": _fresh_iso(1),
    }
    assert hit_from_cache_row(article, "japon") is not None

    row = {
        "url": "https://lacosmopolilla.com/guia-de-japon",
        "og_title": "Japan",
        "destination": "Japón",
        "validated_at": _fresh_iso(1),
    }
    # Portada de país: con la query del destino no es una ruta extraíble…
    assert hit_from_cache_row(row, "japon") is None
    # …pero sin query no hay nada que indexar y sigue siendo una fuente válida.
    assert hit_from_cache_row(row) is not None


def test_cache_hits_for_query_filters_by_destination():
    rows = [
        {
            "url": "https://lacosmopolilla.com/japon-en-15-dias/",
            "og_title": "Japón en 15 días",
            "destination": "Japón",
            "validated_at": _fresh_iso(1),
        },
        {
            "url": "https://lacosmopolilla.com/vietnam/",
            "og_title": "Vietnam",
            "destination": "Vietnam",
            "validated_at": _fresh_iso(1),
        },
    ]
    hits = cache_hits_for_query(rows, "japon")
    assert len(hits) == 1
    assert "japon" in hits[0].url


class _Req:
    def __init__(self) -> None:
        self.headers = {}
        self.client = None


@pytest.fixture(autouse=True)
def _reset_suggest_runtime():
    mod.clear_suggest_runtime_state()
    yield
    mod.clear_suggest_runtime_state()


def _auth_user():
    from auth import AuthUser

    return AuthUser(id="user-1", email="a@b.c", is_anonymous=False)


@pytest.mark.asyncio
async def test_endpoint_cache_only_when_tavily_denied(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "false")
    rows = [
        {
            "url": f"https://lacosmopolilla.com/japon-{i}/",
            "og_title": f"Japón {i} días",
            "destination": "Japón",
            "validated_at": _fresh_iso(1),
        }
        for i in range(4)
    ]
    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=rows)):
        with patch.object(mod, "tavily_search", new=AsyncMock()) as tavily:
            with patch.object(mod, "allow_suggest_tavily_global", new=AsyncMock(return_value=False)):
                with patch.object(mod, "record_event", new=AsyncMock()) as record:
                    resp = await sources_suggest(_Req(), q="japón")  # type: ignore[arg-type]
    assert len(resp.results) == 2  # tope 2 por host
    assert all(h.origin == "cache" and h.instant for h in resp.results)
    tavily.assert_not_awaited()
    record.assert_not_awaited()


@pytest.mark.asyncio
async def test_endpoint_full_cache_still_calls_tavily(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "false")
    monkeypatch.setenv("LANDING_SOURCE_SEARCH_MAX_IP_DAY", "20")
    mod._ip_counts = {}
    mod._day = None
    rows = [
        {
            "url": f"https://lacosmopolilla.com/japon-{i}/",
            "og_title": f"Japón {i} días",
            "destination": "Japón",
            "validated_at": _fresh_iso(1),
        }
        for i in range(4)
    ]
    tavily_payload = {
        "results": [
            {"url": "https://japonismo.com/itinerario-japon-15", "title": "Japón 15 días"},
        ]
    }
    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=rows)):
        with patch.object(mod, "tavily_search", new=AsyncMock(return_value=tavily_payload)) as tavily:
            with patch.object(mod, "allow_suggest_tavily_global", new=AsyncMock(return_value=True)):
                with patch.object(mod, "record_event", new=AsyncMock()) as record:
                    resp = await sources_suggest(_Req(), q="japón")  # type: ignore[arg-type]
    tavily.assert_awaited()
    record.assert_awaited()
    origins = {h.origin for h in resp.results}
    assert "cache" in origins
    assert "curated" in origins
    assert tavily.await_args.args[0] == "japón"


@pytest.mark.asyncio
async def test_endpoint_fills_with_curated_tavily(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "true")
    monkeypatch.setenv("LANDING_SOURCE_SEARCH_MAX_IP_DAY", "20")
    mod._ip_counts = {}
    mod._day = None
    rows = [
        {
            "url": "https://lacosmopolilla.com/japon-en-15-dias/",
            "og_title": "Japón en 15 días",
            "destination": "Japón",
            "validated_at": _fresh_iso(1),
        }
    ]
    tavily_payload = {
        "results": [
            {"url": "https://japonismo.com/itinerario-japon-15", "title": "Japón 15 días"},
            {"url": "https://viajablog.com/japon-en-15-dias", "title": "Japón viajablog"},
            {"url": "https://www.exteriores.gob.es/jp", "title": "MAE"},
        ]
    }
    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=rows)):
        with patch.object(mod, "tavily_search", new=AsyncMock(return_value=tavily_payload)) as tavily:
            with patch.object(mod, "allow_suggest_tavily_global", new=AsyncMock(return_value=True)):
                with patch.object(mod, "record_event", new=AsyncMock()) as record:
                    resp = await sources_suggest(_Req(), q="japon")  # type: ignore[arg-type]
    assert tavily.await_count == 1
    assert tavily.await_args.kwargs["strict"] is True
    assert tavily.await_args.args[0] == "japon"
    assert record.await_count == 1
    origins = {h.origin for h in resp.results}
    assert "cache" in origins
    assert "curated" in origins
    assert all("gob.es" not in h.url for h in resp.results)
    assert len(resp.results) <= 4


@pytest.mark.asyncio
async def test_endpoint_web_fallback_when_curated_empty(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "true")
    monkeypatch.setenv("LANDING_SOURCE_SEARCH_MAX_IP_DAY", "20")
    mod._ip_counts = {}
    mod._day = None

    async def fake_tavily(_q: str, **kwargs):
        if kwargs.get("strict"):
            return {
                "results": [
                    {
                        "url": "https://www.mochileandoporelmundo.com/itinerario-viaje-myanmar",
                        "title": "Myanmar",
                    }
                ]
            }
        return {
            "results": [
                {
                    "url": "https://www.undiaporelmundo.com/que-hacer-en-zambia",
                    "title": "Qué hacer en Zambia",
                },
                {
                    "url": "https://www.instagram.com/reel/zambia",
                    "title": "Zambia reel",
                },
            ]
        }

    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=[])):
        with patch.object(mod, "tavily_search", new=AsyncMock(side_effect=fake_tavily)) as tavily:
            with patch.object(mod, "allow_suggest_tavily_global", new=AsyncMock(return_value=True)):
                with patch.object(mod, "record_event", new=AsyncMock()):
                    resp = await sources_suggest(_Req(), q="zambia")  # type: ignore[arg-type]
    assert tavily.await_count == 2
    assert tavily.await_args.kwargs["strict"] is False
    assert [h.origin for h in resp.results] == ["web"]
    assert resp.results[0].url.endswith("/que-hacer-en-zambia")
    assert resp.need_captcha is False


@pytest.mark.asyncio
async def test_endpoint_disabled(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "false")
    with pytest.raises(HTTPException) as exc:
        await sources_suggest(_Req(), q="japon")  # type: ignore[arg-type]
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_endpoint_trip_scope_records_own_kind(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "true")
    mod._ip_counts = {}
    mod._day = None
    tavily_payload = {
        "results": [
            {"url": "https://japonismo.com/itinerario-japon-15", "title": "Japón 15 días"},
        ]
    }
    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=[])):
        with patch.object(mod, "tavily_search", new=AsyncMock(return_value=tavily_payload)):
            with patch.object(mod, "allow_suggest_tavily_global", new=AsyncMock(return_value=True)):
                with patch.object(mod, "peek_user", new=AsyncMock(return_value=_auth_user())):
                    with patch.object(mod, "record_event", new=AsyncMock()) as record:
                        resp = await sources_suggest(_Req(), q="japon", scope="trip")  # type: ignore[arg-type]
    assert len(resp.results) >= 1
    record.assert_awaited()
    assert record.await_args.args[0] == "user-1"
    assert record.await_args.args[1] == "trip_source_search"


@pytest.mark.asyncio
async def test_endpoint_limit_caps_at_eight(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "false")
    hosts = [
        "lacosmopolilla.com",
        "japonismo.com",
        "saltaconmigo.com",
        "losviajesdeclaudia.com",
    ]
    rows = [
        {
            "url": f"https://{host}/japon-{i}/",
            "og_title": f"Japón {host} {i}",
            "destination": "Japón",
            "validated_at": _fresh_iso(1),
        }
        for host in hosts
        for i in (1, 2)
    ]
    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=rows)):
        with patch.object(mod, "tavily_search", new=AsyncMock()) as tavily:
            with patch.object(mod, "allow_suggest_tavily_global", new=AsyncMock(return_value=False)):
                with patch.object(mod, "record_event", new=AsyncMock()) as record:
                    resp = await sources_suggest(_Req(), q="japón", scope="trip", limit=8)  # type: ignore[arg-type]
    assert len(resp.results) == 8
    tavily.assert_not_awaited()
    record.assert_not_awaited()


@pytest.mark.asyncio
async def test_endpoint_cache_dupes_do_not_skip_tavily(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "false")
    monkeypatch.setenv("LANDING_SOURCE_SEARCH_MAX_IP_DAY", "20")
    mod._ip_counts = {}
    mod._day = None
    canonical = "https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias"
    rows = [
        {
            "url": canonical + "/",
            "canonical_url": canonical,
            "og_title": "Austria 10 días",
            "destination": "Austria",
            "validated_at": _fresh_iso(1),
        },
        {
            "url": canonical,
            "canonical_url": canonical,
            "og_title": "Austria 10 días",
            "destination": "Austria",
            "validated_at": _fresh_iso(1),
        },
    ]
    tavily_payload = {
        "results": [
            {"url": "https://viajeroscallejeros.com/que-ver-en-austria", "title": "Qué ver en Austria"},
        ]
    }
    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=rows)):
        with patch.object(mod, "tavily_search", new=AsyncMock(return_value=tavily_payload)) as tavily:
            with patch.object(mod, "allow_suggest_tavily_global", new=AsyncMock(return_value=True)):
                with patch.object(mod, "record_event", new=AsyncMock()):
                    resp = await sources_suggest(_Req(), q="austria")  # type: ignore[arg-type]
    tavily.assert_awaited()
    urls = [h.url.rstrip("/") for h in resp.results]
    assert urls.count(canonical) == 1


@pytest.mark.asyncio
async def test_endpoint_response_cache_skips_second_tavily(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "false")
    tavily_payload = {
        "results": [
            {"url": "https://japonismo.com/itinerario-japon-15", "title": "Japón 15 días"},
        ]
    }
    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=[])):
        with patch.object(mod, "tavily_search", new=AsyncMock(return_value=tavily_payload)) as tavily:
            with patch.object(mod, "allow_suggest_tavily_global", new=AsyncMock(return_value=True)):
                with patch.object(mod, "record_event", new=AsyncMock()) as record:
                    first = await sources_suggest(_Req(), q="japon")  # type: ignore[arg-type]
                    second = await sources_suggest(_Req(), q="japón")  # type: ignore[arg-type]
    assert tavily.await_count == 1
    assert record.await_count == 1
    assert [h.url for h in second.results] == [h.url for h in first.results]


@pytest.mark.asyncio
async def test_endpoint_fresh_bypasses_response_cache(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "false")
    tavily_payload = {
        "results": [
            {"url": "https://japonismo.com/itinerario-japon-15", "title": "Japón 15 días"},
        ]
    }
    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=[])):
        with patch.object(mod, "tavily_search", new=AsyncMock(return_value=tavily_payload)) as tavily:
            with patch.object(mod, "allow_suggest_tavily_global", new=AsyncMock(return_value=True)):
                with patch.object(mod, "record_event", new=AsyncMock()) as record:
                    await sources_suggest(_Req(), q="japon")  # type: ignore[arg-type]
                    await sources_suggest(_Req(), q="japon", fresh=True)  # type: ignore[arg-type]
    assert tavily.await_count == 2
    assert record.await_count == 2


@pytest.mark.asyncio
async def test_endpoint_trip_without_jwt_falls_back_to_landing(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "false")
    tavily_payload = {
        "results": [
            {"url": "https://japonismo.com/itinerario-japon-15", "title": "Japón 15 días"},
        ]
    }
    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=[])):
        with patch.object(mod, "tavily_search", new=AsyncMock(return_value=tavily_payload)):
            with patch.object(mod, "allow_suggest_tavily_global", new=AsyncMock(return_value=True)):
                with patch.object(mod, "peek_user", new=AsyncMock(return_value=None)):
                    with patch.object(mod, "record_event", new=AsyncMock()) as record:
                        await sources_suggest(_Req(), q="japon", scope="trip")  # type: ignore[arg-type]
    record.assert_awaited()
    assert record.await_args.args[0] is None
    assert record.await_args.args[1] == "landing_source_search"


@pytest.mark.asyncio
async def test_endpoint_trip_ip_bucket_separate_from_landing(monkeypatch):
    monkeypatch.setenv("SOURCE_SUGGEST_ENABLED", "true")
    monkeypatch.setenv("SOURCE_SUGGEST_WEB_ENABLED", "false")
    monkeypatch.setenv("LANDING_SOURCE_SEARCH_MAX_IP_DAY", "1")
    monkeypatch.setenv("TRIP_SOURCE_SEARCH_MAX_IP_DAY", "1")
    tavily_payload = {
        "results": [
            {"url": "https://japonismo.com/itinerario-japon-15", "title": "Japón 15 días"},
        ]
    }

    async def fake_peek(authorization: str | None = None):
        return _auth_user() if authorization else None

    with patch.object(mod, "list_extraction_metas", new=AsyncMock(return_value=[])):
        with patch.object(mod, "tavily_search", new=AsyncMock(return_value=tavily_payload)) as tavily:
            with patch.object(mod, "allow_suggest_tavily_global", new=AsyncMock(return_value=True)):
                with patch.object(mod, "peek_user", new=AsyncMock(side_effect=fake_peek)):
                    with patch.object(mod, "record_event", new=AsyncMock()) as record:
                        await sources_suggest(_Req(), q="japon")  # type: ignore[arg-type]
                        mod._response_cache.clear()
                        denied = await sources_suggest(_Req(), q="japon")  # type: ignore[arg-type]
                        mod._response_cache.clear()
                        trip = await sources_suggest(  # type: ignore[arg-type]
                            _Req(),
                            q="japon",
                            scope="trip",
                            authorization="Bearer tok",
                        )
    assert tavily.await_count == 2
    assert denied.results == []
    assert len(trip.results) >= 1
    kinds = [c.args[1] for c in record.await_args_list]
    assert kinds == ["landing_source_search", "trip_source_search"]
