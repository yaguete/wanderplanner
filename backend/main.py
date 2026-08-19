"""
WanderPlanner API: descarga HTML de un artículo, produce texto con enlaces para el LLM, llama a Claude
con `agents/itinerary_builder.md` y devuelve JSON enriquecido con `article_html`, `og_image` y `og_title`.
Cualquier cambio de esquema JSON del modelo debe alinearse con `frontend/types/itinerary` y con `itinerary-utils`.

POST /itinerary responde como SSE (`text/event-stream`), no como un único JSON HTTP:
  - event: progress  data: {"stage":"fetching"|"extracting"}  — heartbeat ~cada 10 s
  - event: result    data: <mismo objeto itinerario que antes>  — payload final sin wrapper
  - event: error     data: {"detail":"..."}  — fallo tras abrir el stream
Auth vía Depends sigue devolviendo HTTP 401/403 antes del body.

POST /partners/prewarm (público, Turnstile + límites): misma forma SSE, pero `result`
solo incluye metadatos (destination, total_days, items, og_image) — nunca el payload.

GET /sources/suggest (público): artículos para la landing. Caché curada → Tavily
de dominios conocidos → Tavily abierto (kill switch SOURCE_SUGGEST_WEB_ENABLED).

POST /funnel (público, tope IP): contadores del CTA de blogs (`start_opened`,
`outbound_click`, `account_created`). Siempre 204; sin IP ni user_id.

POST /maps/resolve: despliega short links de Google Maps del artículo (allowlist
de hosts, caché `maps_link_pins`). Kill switch MAPS_LINK_RESOLVE_ENABLED.

Caché global stale-while-revalidate (`article_extractions`):
  - fresh → payload al instante
  - stale → payload al instante + revalidación en fondo
  - expired/miss → fetch + Claude síncrono
  - refresh=true → validación remota síncrona; Claude solo si cambió el contenido útil

Las miniaturas y portadas NO se resuelven aquí: ver GET /thumb (Commons + Places) y GET /cover (Unsplash).
"""
from __future__ import annotations

import os
import sys
import json
import time
import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TypeVar
from urllib.parse import urlparse

import httpx
import anthropic
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

load_dotenv()

from article_fetch import (  # noqa: E402
    CONTENT_VERSION,
    ArticleFetchResult,
    content_hash,
    fetch_article,
    normalize_article_url,
)
from assistant import router as assistant_router  # noqa: E402
from auth import AuthUser, require_user  # noqa: E402
from covers import router as covers_router  # noqa: E402
from country_tasks import router as country_tasks_router  # noqa: E402
from day_summary import router as day_summary_router  # noqa: E402
from extraction_cache import (  # noqa: E402
    CacheEntry,
    get_cached_extraction,
    store_extraction,
    touch_validation,
)
from funnel import router as funnel_router  # noqa: E402
from maps_resolve import router as maps_resolve_router  # noqa: E402
from obs import log_kv  # noqa: E402
from partners import (  # noqa: E402
    TurnstileUnavailable,
    allow_prewarm,
    allow_prewarm_global,
    is_public_http_url,
    verify_turnstile,
)
from photo_lookup import single_flight  # noqa: E402
from place_thumbs import router as thumbs_router  # noqa: E402
from place_search import router as place_search_router  # noqa: E402
from source_suggest import router as source_suggest_router  # noqa: E402
from usage import enforce_usage, record_event  # noqa: E402

logger = logging.getLogger(__name__)

PROMPT_PATH = Path(__file__).parent / "agents" / "itinerary_builder.md"

DEFAULT_ORIGINS = ["http://localhost:3000", "http://localhost:3001"]


def _allowed_origins() -> list[str]:
    raw = (os.getenv("ALLOWED_ORIGINS") or "").strip()
    if not raw:
        return DEFAULT_ORIGINS
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assistant_router)
app.include_router(thumbs_router)
app.include_router(covers_router)
app.include_router(day_summary_router)
app.include_router(country_tasks_router)
app.include_router(place_search_router)
app.include_router(source_suggest_router)
app.include_router(funnel_router)
app.include_router(maps_resolve_router)


# Salida: itinerarios largos (p. ej. muchas franjas/ítems) superan 8K tokens de JSON; Haiku 4.5 admite ~64K.
def _itinerary_max_output_tokens() -> int:
    raw = (os.getenv("ITINERARY_MAX_OUTPUT_TOKENS") or "").strip()
    if raw.isdigit():
        return min(max(int(raw), 1024), 64000)
    return 32000


def call_claude(article_text: str) -> tuple[dict, int | None, int | None]:
    """Sync: Anthropic SDK exige `messages.stream` si `max_tokens` implica >10 min (p. ej. 32K).

    Returns (itinerary, input_tokens, output_tokens).
    """
    prompt = PROMPT_PATH.read_text(encoding="utf-8").replace("{article_content}", article_text)

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    with client.messages.stream(
        model="claude-haiku-4-5-20251001",
        max_tokens=_itinerary_max_output_tokens(),
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        final = stream.get_final_message()
    raw = "".join(
        block.text for block in final.content if getattr(block, "type", None) == "text"
    ).strip()
    # A veces el modelo devuelve bloque ```json ...```; se quita el fence antes de `json.loads`.
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    usage = final.usage
    input_tokens = getattr(usage, "input_tokens", None) if usage is not None else None
    output_tokens = getattr(usage, "output_tokens", None) if usage is not None else None
    return json.loads(raw.strip()), input_tokens, output_tokens


HEARTBEAT_INTERVAL_S = 10.0

T = TypeVar("T")


def _strip_thumb_urls(obj: Any) -> None:
    """Anula thumb_url en el árbol (cachés antiguas con photoUri de Places caducados)."""
    if isinstance(obj, dict):
        if "thumb_url" in obj:
            obj["thumb_url"] = None
        for v in obj.values():
            _strip_thumb_urls(v)
    elif isinstance(obj, list):
        for item in obj:
            _strip_thumb_urls(item)


def _host(url: str) -> str:
    return urlparse(url).hostname or "-"


def _len_list(value: object) -> int:
    return len(value) if isinstance(value, list) else 0


def _item_kind_counts(itinerary: dict) -> dict[str, int]:
    """Desglose para el kit de partners. No incluye restaurantes."""
    accommodations = 0
    activities = 0
    transport = 0
    for day in itinerary.get("days") or []:
        if not isinstance(day, dict):
            continue
        accommodations += _len_list(day.get("accommodations"))
        transport += _len_list(day.get("transport"))
        acts = day.get("activities")
        if isinstance(acts, list):
            for act in acts:
                activities += 1
                if isinstance(act, dict):
                    activities += _len_list(act.get("sub_activities"))
    return {
        "accommodations": accommodations,
        "activities": activities,
        "transport": transport,
        "basics": _len_list(itinerary.get("basics")),
    }


def _count_items(itinerary: dict) -> int:
    """Cuenta entidades del payload de extracción (snake_case del prompt)."""
    n = 0
    for day in itinerary.get("days") or []:
        if not isinstance(day, dict):
            continue
        for key in ("accommodations", "restaurants", "transport"):
            n += _len_list(day.get(key))
        activities = day.get("activities")
        if isinstance(activities, list):
            for act in activities:
                n += 1
                if isinstance(act, dict):
                    n += _len_list(act.get("sub_activities"))
    n += _len_list(itinerary.get("basics"))
    return n


def _log_extraction(
    *,
    url: str,
    outcome: str,
    cache_hit: bool,
    fetch_ms: int | None = None,
    claude_ms: int | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    items: int | None = None,
    error_type: str | None = None,
    freshness: str | None = None,
) -> None:
    fields: dict[str, Any] = {
        "event": "extraction",
        "outcome": outcome,
        "host": _host(url),
        "cache_hit": cache_hit,
        "fetch_ms": fetch_ms,
        "claude_ms": claude_ms,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "items": items,
    }
    if error_type is not None:
        fields["error_type"] = error_type
    if freshness is not None:
        fields["freshness"] = freshness
    log_kv(logger, **fields)


def _sse(event: str, data: dict[str, Any] | Any) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def _is_sse_chunk(item: object) -> bool:
    return isinstance(item, str) and item.startswith("event:")


async def _await_with_heartbeats(
    awaitable: Awaitable[T],
    stage: str,
) -> AsyncIterator[str | T]:
    """Yields progress SSE strings every HEARTBEAT_INTERVAL_S until awaitable completes; then yields the result."""
    task = asyncio.ensure_future(awaitable)
    try:
        while True:
            done, _ = await asyncio.wait({task}, timeout=HEARTBEAT_INTERVAL_S)
            if not done:
                yield _sse("progress", {"stage": stage})
                continue
            yield task.result()
            return
    except BaseException:
        if not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        raise


def _call_claude_timed(plain_text: str) -> tuple[dict, int | None, int | None, int]:
    t0 = time.perf_counter()
    itinerary, input_tokens, output_tokens = call_claude(plain_text)
    claude_ms = int((time.perf_counter() - t0) * 1000)
    return itinerary, input_tokens, output_tokens, claude_ms


# El loop solo guarda referencias débiles a las tasks: sin esto, el GC puede
# cancelar una revalidación de fondo a medias.
_background_tasks: set[asyncio.Task] = set()


def _spawn_background(coro: Awaitable[None]) -> None:
    task = asyncio.ensure_future(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


def _flight_key(url: str) -> str:
    return f"extract:{normalize_article_url(url) or url}"


def _content_unchanged(entry: CacheEntry, fetched: ArticleFetchResult) -> bool:
    """True si no hace falta redestilar (misma fecha o mismo hash útil)."""
    if (
        fetched.article_modified_at is not None
        and entry.article_modified_at is not None
        and fetched.article_modified_at == entry.article_modified_at
    ):
        return True
    if fetched.content_hash and entry.content_hash and fetched.content_hash == entry.content_hash:
        return True
    return False


async def _touch_from_fetch(url: str, entry: CacheEntry, fetched: ArticleFetchResult) -> None:
    await touch_validation(
        url,
        etag=fetched.etag or entry.etag,
        last_modified=fetched.last_modified or entry.last_modified,
        article_modified_at=fetched.article_modified_at or entry.article_modified_at,
        content_hash_value=fetched.content_hash or entry.content_hash,
        content_version=CONTENT_VERSION,
        cache_url=entry.url,
    )


async def _store_from_fetch(
    url: str,
    itinerary: dict,
    fetched: ArticleFetchResult,
    *,
    cache_url: str | None = None,
) -> None:
    await store_extraction(
        url,
        itinerary,
        etag=fetched.etag,
        last_modified=fetched.last_modified,
        article_modified_at=fetched.article_modified_at,
        content_hash_value=fetched.content_hash or content_hash(fetched.plain_text),
        content_version=CONTENT_VERSION,
        cache_url=cache_url,
    )


@dataclass
class Distilled:
    payload: dict
    claude_called: bool
    fetch_ms: int | None = None
    claude_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None


async def _distill_article(
    url: str,
    entry: CacheEntry | None,
    *,
    usage_user: AuthUser | None,
) -> Distilled:
    """
    Fetch + (Claude si hace falta) + store. El record_event de extraction vive
    aquí (solo el ganador del single_flight lo ejecuta).
    """
    t0 = time.perf_counter()
    fetched = await fetch_article(
        url,
        etag=entry.etag if entry else None,
        last_modified=entry.last_modified if entry else None,
    )
    fetch_ms = int((time.perf_counter() - t0) * 1000)

    if fetched.not_modified and entry is not None:
        await _touch_from_fetch(url, entry, fetched)
        payload = dict(entry.payload)
        _strip_thumb_urls(payload)
        return Distilled(payload=payload, claude_called=False, fetch_ms=fetch_ms)

    if entry is not None and not fetched.not_modified and _content_unchanged(
        entry, fetched
    ):
        await _touch_from_fetch(url, entry, fetched)
        payload = dict(entry.payload)
        # Actualizar HTML/og por si el envoltorio cambió sin cambiar el texto útil.
        if fetched.cleaned_html:
            payload["article_html"] = fetched.cleaned_html
        if fetched.og_image:
            payload["og_image"] = fetched.og_image
        if fetched.og_title:
            payload["og_title"] = fetched.og_title
        _strip_thumb_urls(payload)
        await store_extraction(
            url,
            payload,
            etag=fetched.etag,
            last_modified=fetched.last_modified,
            article_modified_at=fetched.article_modified_at,
            content_hash_value=fetched.content_hash,
            content_version=CONTENT_VERSION,
            cache_url=entry.url,
        )
        return Distilled(payload=payload, claude_called=False, fetch_ms=fetch_ms)

    t1 = time.perf_counter()
    itinerary, input_tokens, output_tokens = await asyncio.to_thread(
        call_claude, fetched.plain_text
    )
    claude_ms = int((time.perf_counter() - t1) * 1000)
    itinerary["og_image"] = fetched.og_image
    if fetched.og_title:
        itinerary["og_title"] = fetched.og_title
    itinerary["article_html"] = fetched.cleaned_html
    _strip_thumb_urls(itinerary)
    await _store_from_fetch(
        url,
        itinerary,
        fetched,
        cache_url=entry.url if entry else None,
    )
    if usage_user is not None:
        await record_event(usage_user.id, "extraction", cost_hint=output_tokens)
    return Distilled(
        payload=itinerary,
        claude_called=True,
        fetch_ms=fetch_ms,
        claude_ms=claude_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )


async def _distill_sync(
    url: str,
    *,
    user: AuthUser | None,
    entry: CacheEntry | None = None,
) -> dict:
    """Fetch + Claude + store. Single-flight por URL canónica."""

    async def _run() -> dict:
        fetched = await fetch_article(
            url,
            etag=entry.etag if entry else None,
            last_modified=entry.last_modified if entry else None,
        )
        if fetched.not_modified and entry is not None:
            await _touch_from_fetch(url, entry, fetched)
            payload = dict(entry.payload)
            _strip_thumb_urls(payload)
            return payload

        itinerary, input_tokens, output_tokens = await asyncio.to_thread(
            call_claude, fetched.plain_text
        )
        itinerary["og_image"] = fetched.og_image
        if fetched.og_title:
            itinerary["og_title"] = fetched.og_title
        itinerary["article_html"] = fetched.cleaned_html
        _strip_thumb_urls(itinerary)
        await _store_from_fetch(
            url,
            itinerary,
            fetched,
            cache_url=entry.url if entry else None,
        )
        if user is not None:
            await record_event(user.id, "extraction", cost_hint=output_tokens)
        _log_extraction(
            url=url,
            outcome="ok",
            cache_hit=False,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            items=_count_items(itinerary),
            freshness="miss" if entry is None else entry.freshness,
        )
        return itinerary

    return await single_flight(_flight_key(url), _run)


async def revalidate_in_background(url: str, entry: CacheEntry) -> None:
    """Revalidación de fondo: nunca consume cuota de usuario."""

    async def _run() -> None:
        try:
            fetched = await fetch_article(
                url,
                etag=entry.etag,
                last_modified=entry.last_modified,
            )
            if fetched.not_modified:
                await _touch_from_fetch(url, entry, fetched)
                log_kv(
                    logger,
                    event="extraction_revalidate",
                    outcome="not_modified",
                    host=_host(url),
                )
                return

            # Bump de content_version sin redestilar si el hash «nuevo» solo refleja el limpiador.
            if (
                entry.content_version is not None
                and entry.content_version != CONTENT_VERSION
                and entry.content_hash
            ):
                # Recalculamos hash sobre el texto nuevo; si coincide con lo guardado
                # (raro tras cambio de limpiador) o si dateModified no cambió → solo touch.
                if _content_unchanged(entry, fetched) or (
                    fetched.article_modified_at is None
                    and entry.article_modified_at is None
                    and fetched.content_hash == entry.content_hash
                ):
                    await touch_validation(
                        url,
                        etag=fetched.etag or entry.etag,
                        last_modified=fetched.last_modified or entry.last_modified,
                        article_modified_at=fetched.article_modified_at
                        or entry.article_modified_at,
                        content_hash_value=fetched.content_hash,
                        content_version=CONTENT_VERSION,
                        cache_url=entry.url,
                    )
                    log_kv(
                        logger,
                        event="extraction_revalidate",
                        outcome="version_bump",
                        host=_host(url),
                    )
                    return

            if _content_unchanged(entry, fetched):
                await _touch_from_fetch(url, entry, fetched)
                log_kv(
                    logger,
                    event="extraction_revalidate",
                    outcome="unchanged",
                    host=_host(url),
                )
                return

            itinerary, _in, output_tokens = await asyncio.to_thread(
                call_claude, fetched.plain_text
            )
            itinerary["og_image"] = fetched.og_image
            if fetched.og_title:
                itinerary["og_title"] = fetched.og_title
            itinerary["article_html"] = fetched.cleaned_html
            _strip_thumb_urls(itinerary)
            await _store_from_fetch(url, itinerary, fetched, cache_url=entry.url)
            await record_event(None, "system_revalidation", cost_hint=output_tokens)
            log_kv(
                logger,
                event="extraction_revalidate",
                outcome="redistilled",
                host=_host(url),
                items=_count_items(itinerary),
            )
        except Exception as e:
            # Fallback: no tocar la caché ante error de red del blog.
            log_kv(
                logger,
                event="extraction_revalidate",
                outcome="error",
                host=_host(url),
                error_type=type(e).__name__,
            )

    await single_flight(f"revalidate:{normalize_article_url(url) or url}", _run)


async def _validate_sync_for_refresh(
    url: str,
    entry: CacheEntry,
    *,
    user: AuthUser | None,
) -> dict:
    """Validación síncrona forzada (Recargar): Claude solo si cambió el contenido."""
    t0 = time.perf_counter()
    fetched = await fetch_article(
        url,
        etag=entry.etag,
        last_modified=entry.last_modified,
    )
    fetch_ms = int((time.perf_counter() - t0) * 1000)

    if fetched.not_modified:
        await _touch_from_fetch(url, entry, fetched)
        if user is not None:
            await record_event(user.id, "refresh")
        payload = dict(entry.payload)
        _strip_thumb_urls(payload)
        _log_extraction(
            url=url,
            outcome="ok",
            cache_hit=True,
            fetch_ms=fetch_ms,
            items=_count_items(payload),
            freshness="refresh_not_modified",
        )
        return payload

    if (
        entry.content_version is not None
        and entry.content_version != CONTENT_VERSION
        and _content_unchanged(entry, fetched)
    ):
        await touch_validation(
            url,
            etag=fetched.etag or entry.etag,
            last_modified=fetched.last_modified or entry.last_modified,
            article_modified_at=fetched.article_modified_at or entry.article_modified_at,
            content_hash_value=fetched.content_hash,
            content_version=CONTENT_VERSION,
            cache_url=entry.url,
        )
        if user is not None:
            await record_event(user.id, "refresh")
        payload = dict(entry.payload)
        _strip_thumb_urls(payload)
        return payload

    if _content_unchanged(entry, fetched):
        await _touch_from_fetch(url, entry, fetched)
        if user is not None:
            await record_event(user.id, "refresh")
        payload = dict(entry.payload)
        _strip_thumb_urls(payload)
        _log_extraction(
            url=url,
            outcome="ok",
            cache_hit=True,
            fetch_ms=fetch_ms,
            items=_count_items(payload),
            freshness="refresh_unchanged",
        )
        return payload

    # Contenido cambió → redestilar (cuenta como extraction, no solo refresh).
    await enforce_usage(user, "extraction")
    t1 = time.perf_counter()
    itinerary, input_tokens, output_tokens = await asyncio.to_thread(
        call_claude, fetched.plain_text
    )
    claude_ms = int((time.perf_counter() - t1) * 1000)
    itinerary["og_image"] = fetched.og_image
    if fetched.og_title:
        itinerary["og_title"] = fetched.og_title
    itinerary["article_html"] = fetched.cleaned_html
    _strip_thumb_urls(itinerary)
    await _store_from_fetch(url, itinerary, fetched, cache_url=entry.url)
    if user is not None:
        await record_event(user.id, "extraction", cost_hint=output_tokens)
        await record_event(user.id, "refresh")
    _log_extraction(
        url=url,
        outcome="ok",
        cache_hit=False,
        fetch_ms=fetch_ms,
        claude_ms=claude_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        items=_count_items(itinerary),
        freshness="refresh_changed",
    )
    return itinerary


async def _stream_itinerary(
    url: str,
    *,
    entry: CacheEntry | None,
    user: AuthUser | None,
    refresh: bool,
) -> AsyncIterator[str]:
    fetch_ms: int | None = None
    claude_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    try:
        # ── Refresh forzado ──────────────────────────────────────────────────
        if refresh and entry is not None:
            yield _sse("progress", {"stage": "fetching"})
            result: dict | None = None
            async for item in _await_with_heartbeats(
                _validate_sync_for_refresh(url, entry, user=user),
                "fetching",
            ):
                if _is_sse_chunk(item):
                    yield item  # type: ignore[misc]
                else:
                    result = item  # type: ignore[misc]
            assert result is not None
            yield _sse("result", result)
            return

        if refresh and entry is None:
            # Sin fila: mismo flujo que miss; la cuota de refresh ya se aplicó en el handler.
            if user is not None:
                await record_event(user.id, "refresh")

        # ── Hit fresco / stale ───────────────────────────────────────────────
        if entry is not None and entry.freshness in ("fresh", "stale") and not refresh:
            payload = dict(entry.payload)
            _strip_thumb_urls(payload)
            _log_extraction(
                url=url,
                outcome="ok",
                cache_hit=True,
                items=_count_items(payload),
                freshness=entry.freshness,
            )
            yield _sse("progress", {"stage": "fetching"})
            yield _sse("result", payload)
            if entry.freshness == "stale":
                _spawn_background(revalidate_in_background(url, entry))
            return

        # ── Miss / expired: destilación síncrona con heartbeats ──────────────
        yield _sse("progress", {"stage": "fetching"})

        async def _fetch_then_maybe_claude() -> Distilled:
            return await _distill_article(url, entry, usage_user=user)

        distilled: Distilled | None = None
        # Single-flight envuelve toda la destilación.
        async for item in _await_with_heartbeats(
            single_flight(_flight_key(url), _fetch_then_maybe_claude),
            "extracting",
        ):
            if _is_sse_chunk(item):
                # Distinguir etapa: tras el fetch real preferimos "extracting".
                yield item  # type: ignore[misc]
            else:
                distilled = item  # type: ignore[misc]

        assert distilled is not None
        fetch_ms = distilled.fetch_ms
        claude_ms = distilled.claude_ms
        input_tokens = distilled.input_tokens
        output_tokens = distilled.output_tokens
        _log_extraction(
            url=url,
            outcome="ok",
            cache_hit=False,
            fetch_ms=fetch_ms,
            claude_ms=claude_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            items=_count_items(distilled.payload),
            freshness=entry.freshness if entry else "miss",
        )
        yield _sse("result", distilled.payload)
    except httpx.HTTPError as e:
        _log_extraction(
            url=url,
            outcome="error",
            cache_hit=False,
            fetch_ms=fetch_ms,
            claude_ms=claude_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            error_type=type(e).__name__,
        )
        yield _sse("error", {"detail": f"Error fetching article: {e}"})
    except json.JSONDecodeError as e:
        _log_extraction(
            url=url,
            outcome="error",
            cache_hit=False,
            fetch_ms=fetch_ms,
            claude_ms=claude_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            error_type=type(e).__name__,
        )
        yield _sse("error", {"detail": f"Claude did not return valid JSON: {e}"})
    except Exception as e:
        _log_extraction(
            url=url,
            outcome="error",
            cache_hit=False,
            fetch_ms=fetch_ms,
            claude_ms=claude_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            error_type=type(e).__name__,
        )
        yield _sse("error", {"detail": str(e)})


# ── FastAPI endpoints ──────────────────────────────────────────────────────────

class ItineraryRequest(BaseModel):
    url: str
    refresh: bool = Field(default=False)


@app.get("/")
def root():
    return {"status": "WanderPlanner API running"}


@app.post("/itinerary")
async def generate_itinerary(
    request: ItineraryRequest,
    user: AuthUser | None = Depends(require_user),
):
    entry = await get_cached_extraction(request.url)

    if request.refresh:
        await enforce_usage(user, "refresh")
    # Miss/expired (o refresh sin fila): habrá destilación síncrona → cuota de extraction.
    if entry is None or entry.freshness == "expired":
        await enforce_usage(user, "extraction")

    return StreamingResponse(
        _stream_itinerary(
            request.url,
            entry=entry,
            user=user,
            refresh=request.refresh,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _client_ip(request: Request) -> str | None:
    # Fly inyecta la IP real del cliente. No usar X-Forwarded-For: la primera
    # entrada la controla el cliente y anularía el tope por IP.
    fly = (request.headers.get("fly-client-ip") or "").strip()
    if fly:
        return fly
    if request.client and request.client.host:
        return request.client.host
    return None


def _prewarm_meta(payload: dict, *, status: str) -> dict[str, Any]:
    """Metadatos seguros para el blogger (nunca el itinerario completo)."""
    destination = payload.get("destination")
    total_days = payload.get("total_days")
    og_image = payload.get("og_image")
    og_title = payload.get("og_title")
    title = og_title.strip() if isinstance(og_title, str) else ""
    return {
        "status": status,
        "destination": destination if isinstance(destination, str) else None,
        "total_days": total_days if isinstance(total_days, (int, float)) else None,
        "items": _count_items(payload),
        "counts": _item_kind_counts(payload),
        "og_image": og_image if isinstance(og_image, str) else None,
        "og_title": title or None,
    }


async def _stream_prewarm(
    url: str,
    *,
    entry: CacheEntry | None,
) -> AsyncIterator[str]:
    try:
        if entry is not None and entry.freshness in ("fresh", "stale"):
            # Hit: no fetch, no Claude. El botón se genera con lo ya indexado.
            # Stale: se sirve igual y se revalida en fondo (Claude solo si el artículo cambió).
            payload = dict(entry.payload)
            _strip_thumb_urls(payload)
            _log_extraction(
                url=url,
                outcome="ok",
                cache_hit=True,
                items=_count_items(payload),
                freshness=entry.freshness,
            )
            yield _sse("result", _prewarm_meta(payload, status="cached"))
            if entry.freshness == "stale":
                _spawn_background(revalidate_in_background(url, entry))
            return

        yield _sse("progress", {"stage": "fetching"})

        async def _run() -> Distilled:
            d = await _distill_article(url, entry, usage_user=None)
            if d.claude_called:
                await record_event(None, "partner_prewarm", cost_hint=d.output_tokens)
            return d

        distilled: Distilled | None = None
        async for item in _await_with_heartbeats(
            single_flight(_flight_key(url), _run),
            "extracting",
        ):
            if _is_sse_chunk(item):
                yield item  # type: ignore[misc]
            else:
                distilled = item  # type: ignore[misc]

        assert distilled is not None
        _log_extraction(
            url=url,
            outcome="ok",
            cache_hit=False,
            fetch_ms=distilled.fetch_ms,
            claude_ms=distilled.claude_ms,
            input_tokens=distilled.input_tokens,
            output_tokens=distilled.output_tokens,
            items=_count_items(distilled.payload),
            freshness=entry.freshness if entry else "miss",
        )
        yield _sse(
            "result",
            _prewarm_meta(distilled.payload, status="extracted"),
        )
    except httpx.HTTPError as e:
        yield _sse("error", {"detail": f"Error fetching article: {e}"})
    except json.JSONDecodeError as e:
        yield _sse("error", {"detail": f"Claude did not return valid JSON: {e}"})
    except Exception as e:
        yield _sse("error", {"detail": str(e)})


class PrewarmRequest(BaseModel):
    url: str
    captcha_token: str | None = None


@app.post("/partners/prewarm")
async def partners_prewarm(request: PrewarmRequest, http_request: Request):
    """
    Pre-síntesis pública para el kit de partners. Sin sesión; Turnstile +
    límites por IP/globales. Solo escribe en article_extractions; no devuelve
    el payload de extracción.

    Si la URL ya está en caché y sigue vigente (fresh/stale), no destila:
    responde `status: cached` y genera el botón con lo indexado. Miss o
    expired sí precalientan (Claude). Stale revalida en fondo.
    """
    url = (request.url or "").strip()
    if not url.startswith(("http://", "https://")) or len(url) > 2048:
        raise HTTPException(status_code=400, detail="URL inválida")
    # getaddrinfo es síncrono: fuera del event loop para no congelarlo con DNS lento.
    if not await asyncio.to_thread(is_public_http_url, url):
        raise HTTPException(status_code=400, detail="URL no permitida")

    client_ip = _client_ip(http_request)
    try:
        ok = await verify_turnstile(request.captcha_token, client_ip)
    except TurnstileUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    if not ok:
        raise HTTPException(status_code=403, detail="Captcha inválido o ausente")

    entry = await get_cached_extraction(url)
    needs_distill = entry is None or entry.freshness == "expired"
    if needs_distill:
        if not allow_prewarm(client_ip):
            raise HTTPException(
                status_code=429,
                detail={
                    "message": "Has alcanzado el límite diario de precalentados. Vuelve mañana.",
                    "limit": "daily",
                },
            )
        if not await allow_prewarm_global():
            raise HTTPException(
                status_code=429,
                detail={
                    "message": "El sistema de precalentado está saturado. Inténtalo más tarde.",
                    "limit": "daily",
                },
            )

    return StreamingResponse(
        _stream_prewarm(url, entry=entry),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── CLI ────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python main.py <url>")
        sys.exit(1)

    url = sys.argv[1]
    debug = "--debug" in sys.argv

    print(f"Fetching: {url}\n", flush=True)

    async def run():
        fetched = await fetch_article(url)
        if debug:
            print("─" * 60)
            print(f"ARTICLE TEXT ({len(fetched.plain_text)} chars):")
            print(f"OG Image: {fetched.og_image}")
            print(f"CLEANED HTML ({len(fetched.cleaned_html)} chars)\n")
            print(fetched.plain_text[:3000])
            if len(fetched.plain_text) > 3000:
                print(f"\n... [{len(fetched.plain_text) - 3000} chars más] ...")
            print("─" * 60 + "\n")
        itinerary, _input_tokens, _output_tokens = await asyncio.to_thread(
            call_claude, fetched.plain_text
        )
        return itinerary

    result = asyncio.run(run())
    print(json.dumps(result, indent=2, ensure_ascii=False))
