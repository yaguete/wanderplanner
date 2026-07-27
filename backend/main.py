"""
WanderPlanner API: descarga HTML de un artículo, produce texto con enlaces para el LLM, llama a Claude
con `agents/itinerary_builder.md` y devuelve JSON enriquecido con `article_html` y `og_image`.
Cualquier cambio de esquema JSON del modelo debe alinearse con `frontend/types/itinerary` y con `itinerary-utils`.

POST /itinerary responde como SSE (`text/event-stream`), no como un único JSON HTTP:
  - event: progress  data: {"stage":"fetching"|"extracting"}  — heartbeat ~cada 10 s
  - event: result    data: <mismo objeto itinerario que antes>  — payload final sin wrapper
  - event: error     data: {"detail":"..."}  — fallo tras abrir el stream
Auth vía Depends sigue devolviendo HTTP 401/403 antes del body.

Las miniaturas y portadas NO se resuelven aquí: ver GET /thumb (Places) y GET /cover (Unsplash).
"""
import os
import sys
import json
import time
import asyncio
import logging
from collections.abc import AsyncIterator, Awaitable
from pathlib import Path
from typing import Any, TypeVar
from urllib.parse import urlparse

import httpx
import anthropic
from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

from article_fetch import fetch_article  # noqa: E402
from assistant import router as assistant_router  # noqa: E402
from auth import require_user  # noqa: E402
from covers import router as covers_router  # noqa: E402
from extraction_cache import get_cached_extraction, store_extraction  # noqa: E402
from obs import log_kv  # noqa: E402
from place_thumbs import router as thumbs_router  # noqa: E402

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


def _count_items(itinerary: dict) -> int:
    """Cuenta entidades del payload de extracción (snake_case del prompt)."""
    n = 0
    for day in itinerary.get("days") or []:
        if not isinstance(day, dict):
            continue
        for key in ("accommodations", "restaurants", "transport"):
            items = day.get(key)
            if isinstance(items, list):
                n += len(items)
        activities = day.get("activities")
        if isinstance(activities, list):
            for act in activities:
                n += 1
                if isinstance(act, dict):
                    subs = act.get("sub_activities")
                    if isinstance(subs, list):
                        n += len(subs)
    basics = itinerary.get("basics")
    if isinstance(basics, list):
        n += len(basics)
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


async def _fetch_article_timed(url: str) -> tuple[str, str, str | None, int]:
    t0 = time.perf_counter()
    plain_text, cleaned_html, og_image = await fetch_article(url)
    fetch_ms = int((time.perf_counter() - t0) * 1000)
    return plain_text, cleaned_html, og_image, fetch_ms


def _call_claude_timed(plain_text: str) -> tuple[dict, int | None, int | None, int]:
    t0 = time.perf_counter()
    itinerary, input_tokens, output_tokens = call_claude(plain_text)
    claude_ms = int((time.perf_counter() - t0) * 1000)
    return itinerary, input_tokens, output_tokens, claude_ms


async def _stream_itinerary(url: str) -> AsyncIterator[str]:
    fetch_ms: int | None = None
    claude_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    try:
        cached = await get_cached_extraction(url)
        if cached is not None:
            _strip_thumb_urls(cached)
            _log_extraction(
                url=url,
                outcome="ok",
                cache_hit=True,
                items=_count_items(cached),
            )
            yield _sse("progress", {"stage": "fetching"})
            yield _sse("result", cached)
            return

        yield _sse("progress", {"stage": "fetching"})
        plain_text: str | None = None
        cleaned_html: str | None = None
        og_image: str | None = None
        async for item in _await_with_heartbeats(_fetch_article_timed(url), "fetching"):
            if _is_sse_chunk(item):
                yield item  # type: ignore[misc]
            else:
                plain_text, cleaned_html, og_image, fetch_ms = item  # type: ignore[misc]

        assert plain_text is not None and cleaned_html is not None

        yield _sse("progress", {"stage": "extracting"})
        itinerary: dict | None = None
        async for item in _await_with_heartbeats(
            asyncio.to_thread(_call_claude_timed, plain_text),
            "extracting",
        ):
            if _is_sse_chunk(item):
                yield item  # type: ignore[misc]
            else:
                itinerary, input_tokens, output_tokens, claude_ms = item  # type: ignore[misc]

        assert itinerary is not None
        itinerary["og_image"] = og_image
        itinerary["article_html"] = cleaned_html
        _strip_thumb_urls(itinerary)
        await store_extraction(url, itinerary)
        _log_extraction(
            url=url,
            outcome="ok",
            cache_hit=False,
            fetch_ms=fetch_ms,
            claude_ms=claude_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            items=_count_items(itinerary),
        )
        yield _sse("result", itinerary)
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


@app.get("/")
def root():
    return {"status": "WanderPlanner API running"}


@app.post("/itinerary")
async def generate_itinerary(request: ItineraryRequest, _user=Depends(require_user)):
    return StreamingResponse(
        _stream_itinerary(request.url),
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
        plain_text, cleaned_html, og_image = await fetch_article(url)
        if debug:
            print("─" * 60)
            print(f"ARTICLE TEXT ({len(plain_text)} chars):")
            print(f"OG Image: {og_image}")
            print(f"CLEANED HTML ({len(cleaned_html)} chars)\n")
            print(plain_text[:3000])
            if len(plain_text) > 3000:
                print(f"\n... [{len(plain_text) - 3000} chars más] ...")
            print("─" * 60 + "\n")
        itinerary, _input_tokens, _output_tokens = await asyncio.to_thread(call_claude, plain_text)
        return itinerary

    result = asyncio.run(run())
    print(json.dumps(result, indent=2, ensure_ascii=False))
