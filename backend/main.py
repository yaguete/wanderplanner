"""
WanderPlanner API: descarga HTML de un artículo, produce texto con enlaces para el LLM, llama a Claude
con `agents/itinerary_builder.md` y devuelve JSON enriquecido con `article_html`, `og_image` y `og_title`.
Cualquier cambio de esquema JSON del modelo debe alinearse con `frontend/types/itinerary` y con `itinerary-utils`.

POST /itinerary responde como SSE (`text/event-stream`), no como un único JSON HTTP:
  - event: progress  data: {"stage":"fetching"|"extracting"|"resolving"}  — heartbeat ~cada 10 s
  - event: result    data: <mismo objeto itinerario que antes>  — payload final sin wrapper
  - event: error     data: {"detail":"..."} o {"detail":{"message","permanent","destination?"}}
Auth vía Depends sigue devolviendo HTTP 401/403 antes del body.

POST /partners/prewarm (público, Turnstile + límites): misma forma SSE, pero `result`
solo incluye metadatos (destination, total_days, items, og_image) — nunca el payload.

GET /sources/suggest (público): artículos para la landing. Caché curada → Tavily
de dominios conocidos → Tavily abierto (kill switch SOURCE_SUGGEST_WEB_ENABLED).

POST /funnel (público, tope IP): contadores del CTA de blogs (`start_opened`,
`outbound_click`, `account_created`). Siempre 204; sin IP ni user_id.

POST /maps/resolve: despliega short links de Google Maps del artículo (allowlist
de hosts, caché `maps_link_pins`). Kill switch MAPS_LINK_RESOLVE_ENABLED.

Caché global por URL (`article_extractions`):
  - fresh (< 2 días) → payload al instante, sin GET
  - stale/expired en un alta → GET + hash síncrono; Claude solo si el texto útil cambió
  - miss → fetch + Claude síncrono
  - refresh=true (Recargar) → GET + hash siempre, ignora la ventana de 2 días
  - GET fallido / post desaparecido → se conserva la caché
  - prewarm stale → payload al instante + revalidación en fondo (el kit no espera)

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
from trip_share import router as trip_share_router  # noqa: E402
from covers import router as covers_router  # noqa: E402
from country_tasks import router as country_tasks_router  # noqa: E402
from day_summary import router as day_summary_router  # noqa: E402
from share_summary import router as share_summary_router  # noqa: E402
from extraction_cache import (  # noqa: E402
    CacheEntry,
    get_cached_extraction,
    store_extraction,
    touch_validation,
)
from funnel import router as funnel_router  # noqa: E402
from instagram import (  # noqa: E402
    INSTAGRAM_PROMPT_PATH,
    InstagramCaptionTooShort,
    InstagramError,
    InstagramMedia,
    InstagramText,
    MIN_CAPTION_LEN,
    caption_plain_for_length,
    coerce_instagram_itinerary,
    destination_hint,
    fetch_instagram,
    instagram_llm_text,
    remember_permanent_error,
)
from instagram_url import is_instagram_media_url  # noqa: E402
from itinerary_schema import (  # noqa: E402
    BLOG_ITINERARY_SCHEMA,
    INSTAGRAM_ITINERARY_SCHEMA,
    coerce_optional_blanks,
    output_config_for,
)
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
from blog_suggest import router as blog_suggest_router  # noqa: E402
from reference_feed import router as reference_feed_router  # noqa: E402
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
app.include_router(share_summary_router)
app.include_router(country_tasks_router)
app.include_router(place_search_router)
app.include_router(source_suggest_router)
app.include_router(blog_suggest_router)
app.include_router(reference_feed_router)
app.include_router(funnel_router)
app.include_router(maps_resolve_router)
app.include_router(trip_share_router)


# Salida: itinerarios largos (p. ej. muchas franjas/ítems) superan 8K tokens de JSON; Haiku 4.5 admite ~64K.
def _itinerary_max_output_tokens() -> int:
    raw = (os.getenv("ITINERARY_MAX_OUTPUT_TOKENS") or "").strip()
    if raw.isdigit():
        return min(max(int(raw), 1024), 64000)
    return 32000


def call_claude(
    article_text: str,
    *,
    prompt_path: Path | None = None,
) -> tuple[dict, int | None, int | None]:
    """Sync: Anthropic SDK exige `messages.stream` si `max_tokens` implica >10 min (p. ej. 32K).

    Returns (itinerary, input_tokens, output_tokens). Structured outputs
    (`output_config.format`) fuerzan JSON válido. Campos opcionales van como string
    vacío y `coerce_optional_blanks` los pasa a null.
    """
    path = prompt_path or PROMPT_PATH
    prompt = path.read_text(encoding="utf-8").replace("{article_content}", article_text)
    schema = (
        INSTAGRAM_ITINERARY_SCHEMA
        if path == Path(INSTAGRAM_PROMPT_PATH)
        else BLOG_ITINERARY_SCHEMA
    )

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    with client.messages.stream(
        model="claude-haiku-4-5-20251001",
        max_tokens=_itinerary_max_output_tokens(),
        messages=[{"role": "user", "content": prompt}],
        extra_body={"output_config": output_config_for(schema)},
    ) as stream:
        final = stream.get_final_message()
    raw = "".join(
        block.text for block in final.content if getattr(block, "type", None) == "text"
    ).strip()
    usage = final.usage
    input_tokens = getattr(usage, "input_tokens", None) if usage is not None else None
    output_tokens = getattr(usage, "output_tokens", None) if usage is not None else None
    if not raw:
        log_kv(
            logger,
            event="extraction_claude_empty",
            stop_reason=getattr(final, "stop_reason", None),
            blocks=len(final.content or []),
        )
        raise ValueError(
            "No hemos podido destilar esta fuente. Prueba otra vez en unos segundos."
        )
    try:
        payload = json.loads(raw)
        coerce_optional_blanks(payload)
        return payload, input_tokens, output_tokens
    except json.JSONDecodeError as exc:
        log_kv(
            logger,
            event="extraction_claude_invalid_json",
            error=type(exc).__name__,
            raw_len=len(raw),
        )
        raise ValueError(
            "No hemos podido destilar esta fuente. Prueba otra vez en unos segundos."
        ) from exc


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
    source_kind: str | None = None,
    structured: bool | None = None,
    ocr_slides: int | None = None,
    ocr_visual_tokens: int | None = None,
    ocr_chars: int | None = None,
    ocr_ms: int | None = None,
    ocr_error: str | None = None,
    ocr_flipped_structured: bool | None = None,
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
    if source_kind is not None:
        fields["source_kind"] = source_kind
        if source_kind == "instagram" and fetch_ms is not None:
            fields["provider_ms"] = fetch_ms
    if structured is not None:
        fields["structured"] = structured
    if ocr_slides is not None:
        fields["ocr_slides"] = ocr_slides
    if ocr_visual_tokens is not None:
        fields["ocr_visual_tokens"] = ocr_visual_tokens
    if ocr_chars is not None:
        fields["ocr_chars"] = ocr_chars
    if ocr_ms is not None:
        fields["ocr_ms"] = ocr_ms
    if ocr_error is not None:
        fields["ocr_error"] = ocr_error
    if ocr_flipped_structured is not None:
        fields["ocr_flipped_structured"] = ocr_flipped_structured
    log_kv(logger, **fields)


def _sse(event: str, data: dict[str, Any] | Any) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def _is_sse_chunk(item: object) -> bool:
    return isinstance(item, str) and item.startswith("event:")


async def _await_with_heartbeats(
    awaitable: Awaitable[T],
    stage: str | list[str],
) -> AsyncIterator[str | T]:
    """Yields progress SSE strings every HEARTBEAT_INTERVAL_S until awaitable completes; then yields the result."""
    task = asyncio.ensure_future(awaitable)
    try:
        while True:
            done, _ = await asyncio.wait({task}, timeout=HEARTBEAT_INTERVAL_S)
            if not done:
                current = stage[0] if isinstance(stage, list) else stage
                yield _sse("progress", {"stage": current})
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


def _call_claude_timed(
    plain_text: str,
    *,
    prompt_path: Path | None = None,
) -> tuple[dict, int | None, int | None, int]:
    t0 = time.perf_counter()
    itinerary, input_tokens, output_tokens = call_claude(plain_text, prompt_path=prompt_path)
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
    """True si el texto útil no ha cambiado. El hash manda; la fecha no corta."""
    if fetched.content_hash and entry.content_hash:
        return fetched.content_hash == entry.content_hash
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
    source_kind: str = "article"
    structured: bool | None = None
    provider_charged: bool = False
    ocr_slides: int | None = None
    ocr_visual_tokens: int | None = None
    ocr_chars: int | None = None
    ocr_ms: int | None = None
    ocr_error: str | None = None
    ocr_flipped_structured: bool | None = None


def _instagram_prompt() -> Path:
    return Path(INSTAGRAM_PROMPT_PATH)


async def _fetch_source(
    url: str,
    entry: CacheEntry | None,
    *,
    allow_ocr: bool = False,
) -> tuple[ArticleFetchResult, InstagramMedia | None, InstagramText | None]:
    if is_instagram_media_url(url):
        fetched, media, text = await fetch_instagram(url, allow_ocr=allow_ocr)
        return fetched, media, text
    # Sin If-None-Match / If-Modified-Since: WordPress y CDNs mienten el 304
    # y saltaríamos el hash del cuerpo (caso Cosmopolilla Costa Rica).
    fetched = await fetch_article(url)
    return fetched, None, None


def _apply_fetch_to_itinerary(
    itinerary: dict,
    fetched: ArticleFetchResult,
    media: InstagramMedia | None,
    ig_text: InstagramText | None = None,
) -> dict:
    if media is not None:
        # Nunca coercear con media.caption: el detector tiene que ser el texto fusionado.
        itinerary = coerce_instagram_itinerary(
            itinerary, ig_text if ig_text is not None else media.caption
        )
        itinerary["author"] = media.owner_username
        itinerary["og_image"] = None
        itinerary.pop("og_title", None)
        itinerary["article_html"] = (
            ig_text.chronicle_html if ig_text is not None else fetched.cleaned_html
        )
    else:
        itinerary["og_image"] = fetched.og_image
        if fetched.og_title:
            itinerary["og_title"] = fetched.og_title
        itinerary["article_html"] = fetched.cleaned_html
    _strip_thumb_urls(itinerary)
    return itinerary


def _instagram_error_detail(err: InstagramError) -> dict[str, Any]:
    detail: dict[str, Any] = {
        "message": err.user_message,
        "permanent": err.permanent,
    }
    if err.destination:
        detail["destination"] = err.destination
    return detail


async def _enforce_instagram_provider(user: AuthUser | None) -> None:
    if user is None or user.is_anonymous:
        return
    await enforce_usage(user, "extraction_instagram")


async def _record_instagram_provider(
    user: AuthUser | None,
    *,
    cost_hint: int | float | None = None,
) -> None:
    if user is None or user.is_anonymous:
        return
    await record_event(user.id, "extraction_instagram", cost_hint=cost_hint)


def _ocr_fields(text: InstagramText | None) -> dict[str, Any]:
    if text is None:
        return {}
    return {
        "ocr_slides": text.ocr_slides,
        "ocr_visual_tokens": text.ocr_visual_tokens,
        "ocr_chars": text.ocr_chars,
        "ocr_ms": text.ocr_ms,
        "ocr_error": text.ocr_error,
        "ocr_flipped_structured": text.ocr_flipped_structured,
    }


def _set_progress(stage: list[str] | None, value: str) -> None:
    if stage is not None:
        stage[0] = value


async def _maybe_upgrade_instagram_text(
    fetched: ArticleFetchResult,
    media: InstagramMedia | None,
    text: InstagramText | None,
    *,
    allow_ocr: bool,
) -> tuple[ArticleFetchResult, InstagramText | None]:
    """OCR solo si hay que destilar. El hash ya se calculó sin visión."""
    if media is None or text is None or not allow_ocr:
        return fetched, text
    upgraded = await instagram_llm_text(media, allow_ocr=True)
    fetched.plain_text = upgraded.plain_text
    fetched.cleaned_html = upgraded.chronicle_html
    if len(caption_plain_for_length(upgraded.detector_text)) < MIN_CAPTION_LEN:
        dest = destination_hint(
            location_name=media.location_name, caption=media.caption
        )
        err = InstagramCaptionTooShort(dest)
        remember_permanent_error(
            f"https://www.instagram.com/p/{media.shortcode}", err
        )
        raise err
    return fetched, upgraded


async def _distill_article(
    url: str,
    entry: CacheEntry | None,
    *,
    usage_user: AuthUser | None,
    allow_ocr: bool = False,
    progress_stage: list[str] | None = None,
) -> Distilled:
    """
    Fetch + (Claude si hace falta) + store. El record_event de extraction vive
    aquí (solo el ganador del single_flight lo ejecuta).
    """
    ig = is_instagram_media_url(url)
    if ig:
        await _enforce_instagram_provider(usage_user)
    t0 = time.perf_counter()
    fetched, media, ig_text = await _fetch_source(url, entry, allow_ocr=False)
    fetch_ms = int((time.perf_counter() - t0) * 1000)
    _set_progress(progress_stage, "extracting")
    kind = "instagram" if ig else "article"
    structured = (
        bool((entry.payload if entry else {}).get("source_structured_by_days"))
        if entry
        else None
    )

    async def _charge(text: InstagramText | None) -> None:
        if ig:
            await _record_instagram_provider(
                usage_user,
                cost_hint=text.ocr_visual_tokens if text is not None else 0,
            )

    if fetched.not_modified and entry is not None:
        await _charge(ig_text)
        await _touch_from_fetch(url, entry, fetched)
        payload = dict(entry.payload)
        _strip_thumb_urls(payload)
        return Distilled(
            payload=payload,
            claude_called=False,
            fetch_ms=fetch_ms,
            source_kind=kind,
            structured=payload.get("source_structured_by_days")
            if isinstance(payload.get("source_structured_by_days"), bool)
            else structured,
            provider_charged=ig,
            **_ocr_fields(ig_text),
        )

    if entry is not None and not fetched.not_modified and _content_unchanged(
        entry, fetched
    ):
        await _charge(ig_text)
        await _touch_from_fetch(url, entry, fetched)
        payload = dict(entry.payload)
        if fetched.cleaned_html:
            payload["article_html"] = fetched.cleaned_html
        if media is None:
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
        return Distilled(
            payload=payload,
            claude_called=False,
            fetch_ms=fetch_ms,
            source_kind=kind,
            structured=payload.get("source_structured_by_days")
            if isinstance(payload.get("source_structured_by_days"), bool)
            else structured,
            provider_charged=ig,
            **_ocr_fields(ig_text),
        )

    fetched, ig_text = await _maybe_upgrade_instagram_text(
        fetched, media, ig_text, allow_ocr=allow_ocr
    )
    await _charge(ig_text)

    itinerary, input_tokens, output_tokens, claude_ms = await asyncio.to_thread(
        _call_claude_timed,
        fetched.plain_text,
        prompt_path=_instagram_prompt() if ig else None,
    )
    itinerary = _apply_fetch_to_itinerary(itinerary, fetched, media, ig_text)
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
        source_kind=kind,
        structured=bool(itinerary.get("source_structured_by_days"))
        if isinstance(itinerary.get("source_structured_by_days"), bool)
        else None,
        provider_charged=ig,
        **_ocr_fields(ig_text),
    )


async def _distill_sync(
    url: str,
    *,
    user: AuthUser | None,
    entry: CacheEntry | None = None,
) -> dict:
    """Fetch + Claude + store. Single-flight por URL canónica."""

    async def _run() -> dict:
        distilled = await _distill_article(
            url, entry, usage_user=user, allow_ocr=True
        )
        _log_extraction(
            url=url,
            outcome="ok",
            cache_hit=not distilled.claude_called,
            fetch_ms=distilled.fetch_ms,
            claude_ms=distilled.claude_ms,
            input_tokens=distilled.input_tokens,
            output_tokens=distilled.output_tokens,
            items=_count_items(distilled.payload),
            freshness="miss" if entry is None else entry.freshness,
            source_kind=distilled.source_kind,
            structured=distilled.structured,
        )
        return distilled.payload

    return await single_flight(_flight_key(url), _run)


async def revalidate_in_background(url: str, entry: CacheEntry) -> None:
    """Revalidación de fondo: nunca consume cuota de usuario."""

    async def _run() -> None:
        try:
            fetched, media, ig_text = await _fetch_source(url, entry, allow_ocr=False)
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
                # Recalculamos hash sobre el texto nuevo; si coincide con lo
                # guardado (raro tras cambio de limpiador) → solo touch.
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
                call_claude,
                fetched.plain_text,
                prompt_path=_instagram_prompt() if media is not None else None,
            )
            itinerary = _apply_fetch_to_itinerary(itinerary, fetched, media, ig_text)
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
    progress_stage: list[str] | None = None,
    record_refresh: bool = True,
) -> dict:
    """GET + hash síncrono. Claude solo si cambió el texto útil.

    Recargar (`record_refresh=True`) y alta stale/expired (`False`) comparten
    el camino. Si el GET falla, se devuelve la caché.
    """
    t0 = time.perf_counter()
    ig = is_instagram_media_url(url)
    if ig:
        await _enforce_instagram_provider(user)
    tag = "refresh" if record_refresh else "revalidate"

    async def _note_refresh() -> None:
        if record_refresh and user is not None:
            await record_event(user.id, "refresh")

    try:
        fetched, media, ig_text = await _fetch_source(url, entry, allow_ocr=False)
    except Exception as e:
        fetch_ms = int((time.perf_counter() - t0) * 1000)
        log_kv(
            logger,
            event="extraction_revalidate" if not record_refresh else "extraction_refresh",
            outcome="fetch_failed",
            host=_host(url),
            error_type=type(e).__name__,
        )
        payload = dict(entry.payload)
        _strip_thumb_urls(payload)
        _log_extraction(
            url=url,
            outcome="ok",
            cache_hit=True,
            fetch_ms=fetch_ms,
            items=_count_items(payload),
            freshness=f"{tag}_fetch_failed",
            error_type=type(e).__name__,
        )
        return payload

    fetch_ms = int((time.perf_counter() - t0) * 1000)
    _set_progress(progress_stage, "extracting")

    async def _charge() -> None:
        if ig:
            await _record_instagram_provider(
                user,
                cost_hint=ig_text.ocr_visual_tokens if ig_text is not None else 0,
            )

    if fetched.not_modified:
        await _charge()
        await _touch_from_fetch(url, entry, fetched)
        await _note_refresh()
        payload = dict(entry.payload)
        _strip_thumb_urls(payload)
        _log_extraction(
            url=url,
            outcome="ok",
            cache_hit=True,
            fetch_ms=fetch_ms,
            items=_count_items(payload),
            freshness=f"{tag}_not_modified",
            **_ocr_fields(ig_text),
        )
        return payload

    if (
        entry.content_version is not None
        and entry.content_version != CONTENT_VERSION
        and _content_unchanged(entry, fetched)
    ):
        await _charge()
        await touch_validation(
            url,
            etag=fetched.etag or entry.etag,
            last_modified=fetched.last_modified or entry.last_modified,
            article_modified_at=fetched.article_modified_at or entry.article_modified_at,
            content_hash_value=fetched.content_hash,
            content_version=CONTENT_VERSION,
            cache_url=entry.url,
        )
        await _note_refresh()
        payload = dict(entry.payload)
        _strip_thumb_urls(payload)
        return payload

    if _content_unchanged(entry, fetched):
        await _charge()
        await _touch_from_fetch(url, entry, fetched)
        await _note_refresh()
        payload = dict(entry.payload)
        _strip_thumb_urls(payload)
        _log_extraction(
            url=url,
            outcome="ok",
            cache_hit=True,
            fetch_ms=fetch_ms,
            items=_count_items(payload),
            freshness=f"{tag}_unchanged",
            **_ocr_fields(ig_text),
        )
        return payload

    fetched, ig_text = await _maybe_upgrade_instagram_text(
        fetched, media, ig_text, allow_ocr=True
    )
    await _charge()

    # Contenido cambió → redestilar (cuenta como extraction, no solo refresh).
    await enforce_usage(user, "extraction")
    itinerary, input_tokens, output_tokens, claude_ms = await asyncio.to_thread(
        _call_claude_timed,
        fetched.plain_text,
        prompt_path=_instagram_prompt() if media is not None else None,
    )
    itinerary = _apply_fetch_to_itinerary(itinerary, fetched, media, ig_text)
    await _store_from_fetch(url, itinerary, fetched, cache_url=entry.url)
    if user is not None:
        await record_event(user.id, "extraction", cost_hint=output_tokens)
        await _note_refresh()
    _log_extraction(
        url=url,
        outcome="ok",
        cache_hit=False,
        fetch_ms=fetch_ms,
        claude_ms=claude_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        items=_count_items(itinerary),
        freshness=f"{tag}_changed",
        source_kind="instagram" if ig else "article",
        structured=bool(itinerary.get("source_structured_by_days"))
        if isinstance(itinerary.get("source_structured_by_days"), bool)
        else None,
        **_ocr_fields(ig_text),
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
            refresh_box = [
                "resolving" if is_instagram_media_url(url) else "fetching"
            ]
            yield _sse("progress", {"stage": refresh_box[0]})
            result: dict | None = None
            async for item in _await_with_heartbeats(
                _validate_sync_for_refresh(
                    url, entry, user=user, progress_stage=refresh_box
                ),
                refresh_box,
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

        # ── Hit fresco (< 2 días): sin GET ───────────────────────────────────
        if entry is not None and entry.freshness == "fresh" and not refresh:
            payload = dict(entry.payload)
            _strip_thumb_urls(payload)
            hit_structured = payload.get("source_structured_by_days")
            _log_extraction(
                url=url,
                outcome="ok",
                cache_hit=True,
                items=_count_items(payload),
                freshness=entry.freshness,
                source_kind="instagram" if is_instagram_media_url(url) else "article",
                structured=hit_structured if isinstance(hit_structured, bool) else None,
            )
            yield _sse("progress", {"stage": "fetching"})
            yield _sse("result", payload)
            return

        # ── Stale / expired: GET + hash síncrono; Claude solo si cambió ──────
        if entry is not None and not refresh:
            revalidate_box = [
                "resolving" if is_instagram_media_url(url) else "fetching"
            ]
            yield _sse("progress", {"stage": revalidate_box[0]})
            result: dict | None = None
            async for item in _await_with_heartbeats(
                _validate_sync_for_refresh(
                    url,
                    entry,
                    user=user,
                    progress_stage=revalidate_box,
                    record_refresh=False,
                ),
                revalidate_box,
            ):
                if _is_sse_chunk(item):
                    yield item  # type: ignore[misc]
                else:
                    result = item  # type: ignore[misc]
            assert result is not None
            yield _sse("result", result)
            return

        # ── Miss: destilación síncrona con heartbeats ────────────────────────
        stage_box = [
            "resolving" if is_instagram_media_url(url) else "fetching"
        ]
        yield _sse("progress", {"stage": stage_box[0]})

        async def _fetch_then_maybe_claude() -> Distilled:
            return await _distill_article(
                url,
                entry,
                usage_user=user,
                allow_ocr=True,
                progress_stage=stage_box,
            )

        distilled: Distilled | None = None
        # Single-flight envuelve toda la destilación.
        async for item in _await_with_heartbeats(
            single_flight(_flight_key(url), _fetch_then_maybe_claude),
            stage_box,
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
            source_kind=distilled.source_kind,
            structured=distilled.structured,
            ocr_slides=distilled.ocr_slides,
            ocr_visual_tokens=distilled.ocr_visual_tokens,
            ocr_chars=distilled.ocr_chars,
            ocr_ms=distilled.ocr_ms,
            ocr_error=distilled.ocr_error,
            ocr_flipped_structured=distilled.ocr_flipped_structured,
        )
        yield _sse("result", distilled.payload)
    except InstagramError as e:
        _log_extraction(
            url=url,
            outcome="error",
            cache_hit=False,
            fetch_ms=fetch_ms,
            claude_ms=claude_ms,
            error_type=type(e).__name__,
            source_kind="instagram",
        )
        yield _sse("error", {"detail": _instagram_error_detail(e)})
    except HTTPException as e:
        _log_extraction(
            url=url,
            outcome="error",
            cache_hit=False,
            fetch_ms=fetch_ms,
            claude_ms=claude_ms,
            error_type="HTTPException",
        )
        yield _sse("error", {"detail": e.detail})
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
        yield _sse(
            "error",
            {
                "detail": "No hemos podido destilar esta fuente. Prueba otra vez en unos segundos."
            },
        )
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
    # Miss (o refresh sin fila): destilación síncrona → cuota de extraction.
    # Stale/expired hacen GET+hash; la cuota de extraction solo si Claude entra
    # (dentro de _validate_sync_for_refresh).
    if entry is None:
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
                source_kind="instagram" if is_instagram_media_url(url) else "article",
            )
            yield _sse("result", _prewarm_meta(payload, status="cached"))
            if entry.freshness == "stale":
                _spawn_background(revalidate_in_background(url, entry))
            return

        prewarm_stage = "resolving" if is_instagram_media_url(url) else "fetching"
        yield _sse("progress", {"stage": prewarm_stage})

        async def _run() -> Distilled:
            d = await _distill_article(url, entry, usage_user=None)
            if d.claude_called:
                await record_event(None, "partner_prewarm", cost_hint=d.output_tokens)
            return d

        distilled: Distilled | None = None
        async for item in _await_with_heartbeats(
            single_flight(_flight_key(url), _run),
            prewarm_stage if prewarm_stage == "resolving" else "extracting",
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
            source_kind=distilled.source_kind,
            structured=distilled.structured,
        )
        yield _sse(
            "result",
            _prewarm_meta(distilled.payload, status="extracted"),
        )
    except InstagramError as e:
        yield _sse("error", {"detail": _instagram_error_detail(e)})
    except httpx.HTTPError as e:
        yield _sse("error", {"detail": f"Error fetching article: {e}"})
    except json.JSONDecodeError as e:
        yield _sse(
            "error",
            {
                "detail": "No hemos podido destilar esta fuente. Prueba otra vez en unos segundos."
            },
        )
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
    if is_instagram_media_url(url):
        raise HTTPException(
            status_code=400,
            detail="El kit de partners es para artículos de blog. Pega el Instagram en WanderPlanner.",
        )
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
