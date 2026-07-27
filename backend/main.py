"""
WanderPlanner API: descarga HTML de un artículo, produce texto con enlaces para el LLM, llama a Claude
con `agents/itinerary_builder.md` y devuelve JSON enriquecido con `article_html` y `og_image`.
Cualquier cambio de esquema JSON del modelo debe alinearse con `frontend/types/itinerary` y con `itinerary-utils`.

POST /itinerary responde como SSE (`text/event-stream`), no como un único JSON HTTP:
  - event: progress  data: {"stage":"fetching"|"extracting"}  — heartbeat ~cada 10 s
  - event: result    data: <mismo objeto itinerario que antes>  — payload final sin wrapper
  - event: error     data: {"detail":"..."}  — fallo tras abrir el stream
Auth vía Depends sigue devolviendo HTTP 401/403 antes del body.
"""
import os
import re
import sys
import json
import asyncio
from collections.abc import AsyncIterator, Awaitable
from pathlib import Path
from typing import Any, TypeVar

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
from extraction_cache import get_cached_extraction, store_extraction  # noqa: E402

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

# Salida: itinerarios largos (p. ej. muchas franjas/ítems) superan 8K tokens de JSON; Haiku 4.5 admite ~64K.
def _itinerary_max_output_tokens() -> int:
    raw = (os.getenv("ITINERARY_MAX_OUTPUT_TOKENS") or "").strip()
    if raw.isdigit():
        return min(max(int(raw), 1024), 64000)
    return 32000


def call_claude(article_text: str) -> dict:
    """Sync: Anthropic SDK exige `messages.stream` si `max_tokens` implica >10 min (p. ej. 32K)."""
    prompt = PROMPT_PATH.read_text(encoding="utf-8").replace("{article_content}", article_text)

    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    with client.messages.stream(
        model="claude-haiku-4-5-20251001",
        max_tokens=_itinerary_max_output_tokens(),
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        raw = stream.get_final_text().strip()
    # A veces el modelo devuelve bloque ```json ...```; se quita el fence antes de `json.loads`.
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


THUMB_QUERY_MAX = 200

_BASIC_CAT_HINT: dict[str, str] = {
    "insurance": "travel insurance",
    "sim": "esim travel",
    "car_rental": "car rental",
    "flight": "flight",
    "other": "travel",
}


def _build_thumb_query(name: str | None, region: str | None, area: str) -> str | None:
    n = (name or "").strip()
    r = (region or "").strip()
    a = (area or "").strip()
    if n and r:
        nl, rl = n.lower(), r.lower()
        q = n if (rl in nl or nl in rl) else f"{n} {r}"
    elif n:
        q = n
    elif r:
        q = r
    else:
        q = a
    q = " ".join(q.split())
    if not q:
        return None
    return q[:THUMB_QUERY_MAX]


def _transport_label(t: dict) -> str:
    f, to = t.get("from"), t.get("to")
    if f and to:
        return f"{f} → {to}"
    typ = t.get("type") or "other"
    if isinstance(typ, str) and typ:
        return typ[0].upper() + typ[1:]
    return "Transport"


def _build_basic_thumb_query(name: str | None, category: str | None, area: str) -> str | None:
    n = (name or "").strip()
    a = (area or "").strip()
    cat = (category or "other")
    hint = _BASIC_CAT_HINT.get(cat, "travel")
    if n:
        q = f"{n} {hint} {a}".strip()
    else:
        q = f"{hint} {a}".strip() if a else None
    if not q:
        return None
    return " ".join(q.split())[:THUMB_QUERY_MAX]


def _collect_thumb_jobs(itinerary: dict) -> list[tuple[dict, str | None]]:
    area = (itinerary.get("destination") or "").strip()
    jobs: list[tuple[dict, str | None]] = []

    for day in itinerary.get("days") or []:
        for a in day.get("accommodations") or []:
            if not isinstance(a, dict):
                continue
            q = _build_thumb_query(a.get("name"), a.get("region"), area)
            jobs.append((a, q))
        for r in day.get("restaurants") or []:
            if not isinstance(r, dict):
                continue
            q = _build_thumb_query(r.get("name"), r.get("region"), area)
            jobs.append((r, q))
        for act in day.get("activities") or []:
            if not isinstance(act, dict):
                continue
            q = _build_thumb_query(act.get("name"), act.get("region"), area)
            jobs.append((act, q))
            for sub in act.get("sub_activities") or []:
                if not isinstance(sub, dict):
                    continue
                reg = sub.get("region") or act.get("region")
                q2 = _build_thumb_query(sub.get("name"), reg, area)
                jobs.append((sub, q2))

    for b in itinerary.get("basics") or []:
        if not isinstance(b, dict):
            continue
        q = _build_basic_thumb_query(b.get("name"), b.get("category"), area)
        jobs.append((b, q))

    return jobs


async def _unsplash_thumb_url(client: httpx.AsyncClient, key: str, query: str) -> str | None:
    if not key or not query:
        return None
    try:
        params: dict[str, str] = {"query": query, "per_page": "1", "content_filter": "high"}
        r = await client.get(
            "https://api.unsplash.com/search/photos",
            params=params,
            headers={"Authorization": f"Client-ID {key}"},
        )
        if r.status_code != 200:
            return None
        data = r.json()
        results = data.get("results") or []
        if not results:
            return None
        raw = (results[0].get("urls") or {}).get("raw")
        if not raw:
            return None
        return f"{raw}&w=128&h=128&fit=crop&q=80"
    except Exception:
        return None


def _normalize_for_match(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _pick_best_google_place(places: list[dict], query: str) -> dict | None:
    if not places:
        return None
    q = _normalize_for_match(query)
    q_words = set(w for w in q.split() if len(w) >= 3)
    best: dict | None = None
    best_score = -1.0
    for p in places:
        name = ((p.get("displayName") or {}).get("text") or "").strip()
        addr = (p.get("formattedAddress") or "").strip()
        hay = _normalize_for_match(f"{name} {addr}")
        words = set(hay.split())
        overlap = len(q_words & words)
        has_photo = 1.0 if (p.get("photos") or []) else 0.0
        score = overlap + has_photo * 0.5
        if score > best_score:
            best_score = score
            best = p
    return best


async def _google_places_thumb_url(client: httpx.AsyncClient, key: str, query: str) -> str | None:
    if not key or not query:
        return None
    headers = {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.photos.name",
        "Content-Type": "application/json",
    }
    payload = {
        "textQuery": query,
        "maxResultCount": 5,
        "languageCode": "es",
    }
    try:
        sr = await client.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers=headers,
            json=payload,
        )
        if sr.status_code != 200:
            return None
        places = (sr.json().get("places") or [])
        if not places:
            return None
        best = _pick_best_google_place(places, query)
        if not isinstance(best, dict):
            return None
        photos = best.get("photos") or []
        if not photos:
            return None
        photo_name = (photos[0] or {}).get("name")
        if not isinstance(photo_name, str) or not photo_name.strip():
            return None
        mr = await client.get(
            f"https://places.googleapis.com/v1/{photo_name}/media",
            params={"maxWidthPx": "256", "maxHeightPx": "256", "skipHttpRedirect": "true"},
            headers={"X-Goog-Api-Key": key},
        )
        if mr.status_code != 200:
            return None
        return (mr.json().get("photoUri") or None)
    except Exception:
        return None


async def enrich_thumbnails(itinerary: dict) -> None:
    google_key = (os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_PLACES_API_KEY") or "").strip()
    unsplash_key = (os.getenv("UNSPLASH_ACCESS_KEY") or os.getenv("NEXT_PUBLIC_UNSPLASH_ACCESS_KEY") or "").strip()
    jobs = _collect_thumb_jobs(itinerary)
    for obj, _q in jobs:
        if isinstance(obj, dict):
            obj["thumb_url"] = None
    if not jobs:
        return
    # Preferimos Google Places Photo (más aproximado al POI). Unsplash queda de fallback.
    if not google_key and not unsplash_key:
        return
    by_query: dict[str, list[dict]] = {}
    for obj, q in jobs:
        if not q or not isinstance(obj, dict):
            continue
        by_query.setdefault(q, []).append(obj)
    if not by_query:
        return
    sem = asyncio.Semaphore(3)

    async with httpx.AsyncClient(timeout=15.0) as httpx_client:

        async def one(q: str) -> tuple[str, str | None]:
            async with sem:
                u = None
                if google_key:
                    u = await _google_places_thumb_url(httpx_client, google_key, q)
                if not u and unsplash_key:
                    u = await _unsplash_thumb_url(httpx_client, unsplash_key, q)
            return (q, u)

        out = await asyncio.gather(*[one(q) for q in by_query])
        for q, u in out:
            for o in by_query.get(q) or []:
                o["thumb_url"] = u


HEARTBEAT_INTERVAL_S = 10.0

T = TypeVar("T")


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


async def build_itinerary(url: str) -> dict:
    # Caché global por URL: el mismo artículo no se vuelve a extraer ni a pagar.
    cached = await get_cached_extraction(url)
    if cached is not None:
        return cached

    plain_text, cleaned_html, og_image = await fetch_article(url)
    itinerary = await asyncio.to_thread(call_claude, plain_text)
    itinerary["og_image"] = og_image
    itinerary["article_html"] = cleaned_html
    await enrich_thumbnails(itinerary)
    await store_extraction(url, itinerary)
    return itinerary


async def _stream_itinerary(url: str) -> AsyncIterator[str]:
    try:
        cached = await get_cached_extraction(url)
        if cached is not None:
            yield _sse("progress", {"stage": "fetching"})
            yield _sse("result", cached)
            return

        yield _sse("progress", {"stage": "fetching"})
        plain_text: str | None = None
        cleaned_html: str | None = None
        og_image: str | None = None
        async for item in _await_with_heartbeats(fetch_article(url), "fetching"):
            if _is_sse_chunk(item):
                yield item  # type: ignore[misc]
            else:
                plain_text, cleaned_html, og_image = item  # type: ignore[misc]

        assert plain_text is not None and cleaned_html is not None

        yield _sse("progress", {"stage": "extracting"})
        itinerary: dict | None = None
        async for item in _await_with_heartbeats(
            asyncio.to_thread(call_claude, plain_text),
            "extracting",
        ):
            if _is_sse_chunk(item):
                yield item  # type: ignore[misc]
            else:
                itinerary = item  # type: ignore[assignment]

        assert itinerary is not None
        itinerary["og_image"] = og_image
        itinerary["article_html"] = cleaned_html

        async for item in _await_with_heartbeats(enrich_thumbnails(itinerary), "extracting"):
            if _is_sse_chunk(item):
                yield item  # type: ignore[misc]

        await store_extraction(url, itinerary)
        yield _sse("result", itinerary)
    except httpx.HTTPError as e:
        yield _sse("error", {"detail": f"Error fetching article: {e}"})
    except json.JSONDecodeError as e:
        yield _sse("error", {"detail": f"Claude did not return valid JSON: {e}"})
    except Exception as e:
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
        return await asyncio.to_thread(call_claude, plain_text)

    result = asyncio.run(run())
    print(json.dumps(result, indent=2, ensure_ascii=False))
