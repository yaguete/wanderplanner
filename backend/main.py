"""
WanderPlanner API: descarga HTML de un artículo, produce texto con enlaces para el LLM, llama a Claude
con `agents/itinerary_builder.md` y devuelve JSON enriquecido con `article_html` y `og_image`.
Cualquier cambio de esquema JSON del modelo debe alinearse con `frontend/types/itinerary` y con `itinerary-utils`.
"""
import os
import re
import sys
import json
import asyncio
from pathlib import Path
from urllib.parse import urljoin

import httpx
import anthropic
from bs4 import BeautifulSoup, NavigableString, Tag
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

PROMPT_PATH = Path(__file__).parent / "agents" / "itinerary_builder.md"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


ALLOWED_TAGS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "img", "strong",
                "em", "a", "ul", "ol", "li", "blockquote", "figure",
                "figcaption", "br"}

_JUNK_ATTRS_RE = re.compile(
    r'comment|respond|reply|disqus|'
    r'author-bio|author-box|author-info|byline|vcard|entry-meta|post-meta|'
    r'sharedaddy|share-button|jp-relatedposts|'
    r'social-share|related-posts|newsletter|post-nav|'
    r'related_posts|recommended|viajes-recomendados|enlazatom',
    re.I,
)

_TAIL_HEADING_RE = re.compile(
    r'preguntas?\s+frecuentes|(?:^|\b)faq(?:\b|$)|frequently\s+asked|'
    r'\d+\s*comentarios?|^comentarios?$|^comments?$|'
    r'leave\s+a\s+(?:reply|comment)|deja\s+un\s+comentario|'
    r'viajes\s+recomendados|related\s+posts|art[ií]culos?\s+relacionados',
    re.I,
)


_CONTENT_SELECTORS = [
    "[itemprop='articleBody']",
    "div.entry-content",
    "div.post-content",
    "div.article-content",
    "div.td-post-content",
    "div.elementor-widget-theme-post-content",
    "div.tdb-block-inner",
    "div.single-content",
]

_MIN_CONTENT_LEN = 500


def _find_content(soup):
    """Locate the main article content using multiple strategies."""
    main = soup.find("main")
    if main and len(main.get_text(strip=True)) > _MIN_CONTENT_LEN:
        return main

    for selector in _CONTENT_SELECTORS:
        el = soup.select_one(selector)
        if el and len(el.get_text(strip=True)) > _MIN_CONTENT_LEN:
            return el

    articles = soup.find_all("article")
    if articles:
        best = max(articles, key=lambda a: len(a.get_text(strip=True)))
        if len(best.get_text(strip=True)) > _MIN_CONTENT_LEN:
            return best

    # SPA fallback: para apps que reparten el artículo en <section> bajo #__next / #app / #root.
    spa_root = soup.find(id="__next") or soup.find(id="app") or soup.find(id="root")
    if spa_root:
        children = spa_root.find_all(True, recursive=False)
        wrapper = max(children, key=lambda c: len(c.get_text(strip=True))) if children else spa_root

        sections = wrapper.find_all("section", recursive=False)
        rich = [s for s in sections if len(s.find_all("p")) >= 2]
        if rich:
            container = BeautifulSoup("<div></div>", "lxml").find("div")
            for s in rich:
                container.append(s)
            if len(container.get_text(strip=True)) > _MIN_CONTENT_LEN:
                return container

    return soup.find("body")


def _text_with_links_for_llm(root, page_url: str) -> str:
    """
    Text for the LLM: like visible text, but <a> becomes [label](absolute_url)
    so affiliate/booking links can be extracted.
    """
    if root is None:
        return ""

    def walk(node) -> str:
        if isinstance(node, NavigableString):
            return str(node)
        if not isinstance(node, Tag):
            return ""
        if node.name == "br":
            return "\n"
        if node.name == "a":
            label = node.get_text(strip=True) or "enlace"
            href = (node.get("href") or "").strip()
            if href and not href.startswith(("#", "javascript:", "mailto:")):
                abs_href = urljoin(page_url, href)
                return f"[{label}]({abs_href})"
            return label
        parts: list[str] = []
        for child in node.children:
            parts.append(walk(child))
        inner = "".join(parts)
        if node.name in (
            "p", "h1", "h2", "h3", "h4", "h5", "h6", "li",
            "tr", "blockquote", "div", "ul", "ol", "section", "table",
        ):
            if inner and not inner.endswith("\n"):
                return inner + "\n"
        return inner

    raw = walk(root).strip()
    lines = [line for line in raw.splitlines() if line.strip()]
    return "\n".join(lines)


def _strip_junk(root):
    """Remove author boxes, comment sections, FAQ blocks and other non-article noise."""
    for el in list(root.find_all(id=_JUNK_ATTRS_RE)):
        el.decompose()
    for el in list(root.find_all(class_=_JUNK_ATTRS_RE)):
        el.decompose()

    for heading in root.find_all(re.compile(r'^h[1-6]$')):
        if _TAIL_HEADING_RE.search(heading.get_text(strip=True)):
            for sib in list(heading.find_next_siblings()):
                sib.decompose()
            heading.decompose()
            break


async def fetch_article(url: str) -> tuple[str, str, str | None]:
    """Returns (plain_text, cleaned_html, og_image)."""
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()

    soup = BeautifulSoup(response.text, "lxml")

    og_image = None
    og_tag = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "twitter:image"})
    if og_tag:
        og_image = og_tag.get("content")

    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
        tag.decompose()

    main = _find_content(soup)
    if main:
        _strip_junk(main)

    # Text for Claude (with [text](url) for links) or fallback
    if main:
        plain_text = _text_with_links_for_llm(main, url)
    else:
        text = soup.get_text(separator="\n", strip=True)
        lines_fb = [line for line in text.splitlines() if line.strip()]
        plain_text = "\n".join(lines_fb)

    # HTML limitado a ALLOWED_TAGS para el lector (Crónica); distinto del texto con enlaces para el LLM.
    html_root = BeautifulSoup(str(main), "lxml").body if main else soup
    for tag in html_root.find_all(True):
        if tag.name not in ALLOWED_TAGS:
            tag.unwrap()
        elif tag.name == "img":
            src = (
                tag.get("data-lazy-src")
                or tag.get("data-src")
                or tag.get("data-original")
                or tag.get("src")
                or ""
            )
            if src.startswith("data:"):
                src = tag.get("data-lazy-src") or tag.get("data-src") or ""
            srcset = tag.get("data-lazy-srcset") or tag.get("srcset") or ""
            attrs: dict[str, str] = {"src": urljoin(url, src), "alt": tag.get("alt", "")}
            if srcset:
                attrs["srcset"] = srcset
                sizes = tag.get("data-lazy-sizes") or tag.get("sizes") or ""
                if sizes:
                    attrs["sizes"] = sizes
            tag.attrs = attrs
        elif tag.name == "a":
            href = tag.get("href", "")
            tag.attrs = {"href": urljoin(url, href), "target": "_blank", "rel": "noopener noreferrer"}
        else:
            tag.attrs = {}
    cleaned_html = html_root.decode_contents()

    return plain_text, cleaned_html, og_image


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


async def build_itinerary(url: str) -> dict:
    plain_text, cleaned_html, og_image = await fetch_article(url)
    itinerary = await asyncio.to_thread(call_claude, plain_text)
    itinerary["og_image"] = og_image
    itinerary["article_html"] = cleaned_html
    await enrich_thumbnails(itinerary)
    return itinerary


# ── FastAPI endpoints ──────────────────────────────────────────────────────────

class ItineraryRequest(BaseModel):
    url: str


@app.get("/")
def root():
    return {"status": "WanderPlanner API running"}


@app.post("/itinerary")
async def generate_itinerary(request: ItineraryRequest):
    try:
        return await build_itinerary(request.url)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Error fetching article: {e}")
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Claude did not return valid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
