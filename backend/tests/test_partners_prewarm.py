"""Pruebas de POST /partners/prewarm (Turnstile, SSRF, rate limit, caché)."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from article_fetch import CONTENT_VERSION, ArticleFetchResult, content_hash
from extraction_cache import CacheEntry, classify_freshness
import main as main_mod
import partners as partners_mod


def _itinerary_payload() -> dict:
    return {
        "destination": "La Alpujarra granadina, Granada, Spain",
        "total_days": 7,
        "source_structured_by_days": True,
        "days": [
            {
                "day": 1,
                "title": "Día 1",
                "accommodations": [{"name": "Casa"}],
                "activities": [{"name": "Mirador"}, {"name": "Paseo"}],
                "restaurants": [],
                "transport": [{"type": "bus", "from": "Granada", "to": "Órgiva"}],
            }
        ],
        "general_tips": None,
        "basics": [
            {
                "category": "other",
                "name": "10% en el hotel",
                "vendor": "Booking",
                "notes": None,
                "affiliate_url": "https://booking.example/x",
            }
        ],
        "og_image": "https://cdn.example/og.jpg",
        "og_title": "La Alpujarra en 7 días",
        "article_html": "<p>hola</p>",
    }


def _entry(*, age_days: int = 1, url: str = "https://blog.example/ruta/") -> CacheEntry:
    now = datetime.now(timezone.utc)
    validated = now - timedelta(days=age_days)
    entry = CacheEntry(
        url=url,
        canonical_url=url.rstrip("/"),
        payload=_itinerary_payload(),
        fetched_at=validated,
        validated_at=validated,
        etag='"v1"',
        last_modified=None,
        article_modified_at=None,
        content_hash=content_hash("texto"),
        content_version=CONTENT_VERSION,
        freshness="fresh",
    )
    entry.freshness = classify_freshness(entry.validated_at)
    return entry


async def _collect_sse(agen) -> str:
    events = []
    async for chunk in agen:
        events.append(chunk)
    return "".join(events)


def _parse_result(body: str) -> dict:
    for block in body.split("\n\n"):
        if "event: result" in block:
            for line in block.split("\n"):
                if line.startswith("data:"):
                    return json.loads(line[5:].strip())
    raise AssertionError(f"no result in SSE body: {body!r}")


@pytest.mark.asyncio
async def test_prewarm_fresh_hit_cached_without_claude():
    entry = _entry(age_days=1)
    with patch.object(main_mod, "fetch_article", new=AsyncMock()) as fetch:
        with patch.object(main_mod, "call_claude") as claude:
            with patch.object(main_mod, "revalidate_in_background", new=AsyncMock()) as reval:
                with patch.object(main_mod, "record_event", new=AsyncMock()) as record:
                    body = await _collect_sse(
                        main_mod._stream_prewarm(entry.url, entry=entry)
                    )
    result = _parse_result(body)
    assert "event: progress" not in body
    assert result["status"] == "cached"
    assert result["destination"] == "La Alpujarra granadina, Granada, Spain"
    assert result["total_days"] == 7
    assert result["og_title"] == "La Alpujarra en 7 días"
    assert result["counts"] == {
        "accommodations": 1,
        "activities": 2,
        "transport": 1,
        "basics": 1,
    }
    assert "days" not in result  # nunca el payload completo
    fetch.assert_not_called()
    claude.assert_not_called()
    reval.assert_not_called()
    record.assert_not_awaited()


def test_item_kind_counts_includes_sub_activities():
    payload = {
        "days": [
            {
                "accommodations": [{}],
                "activities": [{"name": "A", "sub_activities": [{}, {}]}],
                "transport": [],
            }
        ],
        "basics": [{}, {}],
    }
    assert main_mod._item_kind_counts(payload) == {
        "accommodations": 1,
        "activities": 3,
        "transport": 0,
        "basics": 2,
    }


@pytest.mark.asyncio
async def test_prewarm_stale_hit_schedules_revalidate():
    entry = _entry(age_days=20)
    assert entry.freshness == "stale"
    scheduled = []

    def fake_spawn(coro):
        scheduled.append(coro)
        coro.close()

    with patch.object(main_mod, "_spawn_background", side_effect=fake_spawn):
        body = await _collect_sse(main_mod._stream_prewarm(entry.url, entry=entry))
    result = _parse_result(body)
    assert result["status"] == "cached"
    assert len(scheduled) == 1


@pytest.mark.asyncio
async def test_prewarm_miss_distills_and_records():
    url = "https://blog.example/nueva-ruta/"
    fetched = ArticleFetchResult(
        plain_text="artículo nuevo",
        cleaned_html="<p>nuevo</p>",
        og_image="https://cdn.example/og.jpg",
        content_hash=content_hash("artículo nuevo"),
        content_version=CONTENT_VERSION,
    )
    payload = _itinerary_payload()
    with patch.object(main_mod, "fetch_article", new=AsyncMock(return_value=fetched)):
        with patch.object(
            main_mod, "call_claude", return_value=(dict(payload), 11, 22)
        ) as claude:
            with patch.object(main_mod, "store_extraction", new=AsyncMock()) as store:
                with patch.object(main_mod, "record_event", new=AsyncMock()) as record:
                    body = await _collect_sse(
                        main_mod._stream_prewarm(url, entry=None)
                    )
    result = _parse_result(body)
    assert result["status"] == "extracted"
    assert result["destination"] == payload["destination"]
    assert result["items"] >= 1
    claude.assert_called_once()
    store.assert_awaited()
    record.assert_awaited_once()
    assert record.await_args.args == (None, "partner_prewarm")
    assert record.await_args.kwargs.get("cost_hint") == 22


@pytest.mark.asyncio
async def test_prewarm_endpoint_rejects_private_url():
    req = main_mod.PrewarmRequest(url="http://127.0.0.1/secret", captcha_token="t")
    http_req = MagicMock()
    http_req.headers = {}
    http_req.client = MagicMock(host="1.2.3.4")
    with pytest.raises(HTTPException) as exc:
        await main_mod.partners_prewarm(req, http_req)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_prewarm_endpoint_turnstile_invalid():
    req = main_mod.PrewarmRequest(
        url="https://blog.example/ruta/", captcha_token="bad"
    )
    http_req = MagicMock()
    http_req.headers = {}
    http_req.client = MagicMock(host="1.2.3.4")
    with patch.object(main_mod, "is_public_http_url", return_value=True):
        with patch.object(main_mod, "verify_turnstile", new=AsyncMock(return_value=False)):
            with pytest.raises(HTTPException) as exc:
                await main_mod.partners_prewarm(req, http_req)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_prewarm_rejects_instagram():
    req = main_mod.PrewarmRequest(
        url="https://www.instagram.com/p/DblDYKZjOhx/", captcha_token="ok"
    )
    http_req = MagicMock()
    http_req.headers = {}
    http_req.client = MagicMock(host="1.2.3.4")
    with pytest.raises(HTTPException) as exc:
        await main_mod.partners_prewarm(req, http_req)
    assert exc.value.status_code == 400
    assert "Instagram" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_prewarm_endpoint_fail_closed_without_secret(monkeypatch):
    monkeypatch.setenv("REQUIRE_AUTH", "true")
    monkeypatch.delenv("TURNSTILE_SECRET_KEY", raising=False)
    req = main_mod.PrewarmRequest(
        url="https://blog.example/ruta/", captcha_token="x"
    )
    http_req = MagicMock()
    http_req.headers = {}
    http_req.client = MagicMock(host="1.2.3.4")
    with patch.object(main_mod, "is_public_http_url", return_value=True):
        with pytest.raises(HTTPException) as exc:
            await main_mod.partners_prewarm(req, http_req)
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_prewarm_endpoint_rate_limit_ip(monkeypatch):
    monkeypatch.setenv("PARTNER_PREWARM_MAX_IP_DAY", "1")
    # Reset in-memory counters
    partners_mod._day = None
    partners_mod._ip_counts = {}

    req = main_mod.PrewarmRequest(
        url="https://blog.example/ruta-a/", captcha_token="ok"
    )
    http_req = MagicMock()
    http_req.headers = {}
    http_req.client = MagicMock(host="9.9.9.9")

    with patch.object(main_mod, "is_public_http_url", return_value=True):
        with patch.object(main_mod, "verify_turnstile", new=AsyncMock(return_value=True)):
            with patch.object(
                main_mod, "get_cached_extraction", new=AsyncMock(return_value=None)
            ):
                with patch.object(
                    main_mod, "allow_prewarm_global", new=AsyncMock(return_value=True)
                ):
                    # Primera: consume el cupo y entra al stream (mockeamos el stream).
                    assert partners_mod.allow_prewarm("9.9.9.9") is True
                    # Segunda: denegada
                    with pytest.raises(HTTPException) as exc:
                        await main_mod.partners_prewarm(req, http_req)
    assert exc.value.status_code == 429


def test_is_public_http_url_rejects_localhost():
    assert partners_mod.is_public_http_url("http://localhost/x") is False
    assert partners_mod.is_public_http_url("http://127.0.0.1/x") is False
    assert partners_mod.is_public_http_url("ftp://example.com/x") is False
    assert partners_mod.is_public_http_url("https://user:pass@example.com/ruta/") is False


def test_is_public_http_url_accepts_public(monkeypatch):
    # Evitar DNS real: simular resolución a IP pública.
    fake = [
        (None, None, None, None, ("93.184.216.34", 0)),
    ]
    monkeypatch.setattr(partners_mod.socket, "getaddrinfo", lambda *a, **k: fake)
    assert partners_mod.is_public_http_url("https://example.com/ruta/") is True


@pytest.mark.asyncio
async def test_distill_single_flight_waiter_does_not_double_record():
    """Regresión: record_event de extraction solo lo ejecuta el ganador del vuelo."""
    import asyncio

    from auth import AuthUser

    user = AuthUser(id="u1", email=None, is_anonymous=False)
    calls = {"claude": 0, "records": 0}

    async def slow_fetch(*_a, **_k):
        await asyncio.sleep(0.05)
        return ArticleFetchResult(
            plain_text="texto",
            cleaned_html="<p>x</p>",
            content_hash=content_hash("texto"),
            content_version=CONTENT_VERSION,
        )

    def fake_claude(_text, **_kw):
        calls["claude"] += 1
        return ({"destination": "X", "total_days": 1, "days": [], "basics": []}, 1, 2)

    async def fake_record(*_a, **_k):
        calls["records"] += 1

    async def run():
        return await main_mod.single_flight(  # type: ignore[attr-defined]
            main_mod._flight_key("https://ex.com/a"),
            lambda: main_mod._distill_article(
                "https://ex.com/a", None, usage_user=user
            ),
        )

    # single_flight está en photo_lookup; usamos el mismo patrón que /itinerary.
    from photo_lookup import single_flight

    with patch.object(main_mod, "fetch_article", side_effect=slow_fetch):
        with patch.object(main_mod, "call_claude", side_effect=fake_claude):
            with patch.object(main_mod, "store_extraction", new=AsyncMock()):
                with patch.object(main_mod, "record_event", side_effect=fake_record):
                    a = asyncio.create_task(
                        single_flight(
                            main_mod._flight_key("https://ex.com/sf"),
                            lambda: main_mod._distill_article(
                                "https://ex.com/sf", None, usage_user=user
                            ),
                        )
                    )
                    b = asyncio.create_task(
                        single_flight(
                            main_mod._flight_key("https://ex.com/sf"),
                            lambda: main_mod._distill_article(
                                "https://ex.com/sf", None, usage_user=user
                            ),
                        )
                    )
                    results = await asyncio.gather(a, b)

    assert results[0].payload["destination"] == "X"
    assert results[1].payload["destination"] == "X"
    assert calls["claude"] == 1
    assert calls["records"] == 1
