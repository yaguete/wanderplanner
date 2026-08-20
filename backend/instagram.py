"""
Adquisición y destilación de posts/reels públicos de Instagram.

La URL se canónica a `https://www.instagram.com/p/{shortcode}` (espejo de
`frontend/lib/instagram-url.ts`). El resto del sistema habla con `InstagramMedia`;
el proveedor (external / graphql / off) queda detrás de `InstagramResolver`.
"""
from __future__ import annotations

import html
import json
import os
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

import httpx

from article_fetch import ArticleFetchResult, content_hash
from instagram_ocr import ImageCandidate, ocr_instagram_slides
from instagram_url import (  # noqa: F401 — reexport para tests y callers
    canonical_instagram_url,
    is_instagram_host,
    is_instagram_media_url,
    parse_instagram_shortcode,
)

INSTAGRAM_PROMPT_PATH = os.path.join(
    os.path.dirname(__file__), "agents", "instagram_itinerary_builder.md"
)

MIN_CAPTION_LEN = 80
DEFAULT_RESOLVE_TIMEOUT_S = 20.0
_PERMANENT_TTL_S = 24 * 3600
_PERMANENT_MAX = 512
# 1 = caption-only (Fase 1); 2 = caption + OCR. El hash NO incluye el overlay:
# tiene que ser calculable sin pagar visión.
IG_PIPELINE_VERSION = 2

_DAY_MARKER_RE = re.compile(
    r"(?:^|[^\w])(?:d[ií]a|day)\s*(\d+)",
    re.IGNORECASE,
)
_HASHTAG_RE = re.compile(r"#\S+")
_IG_WEB_APP_ID = "936619743392459"
_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


class InstagramError(Exception):
    """Error de adquisición. `permanent` → no reintentar ni re-resolver."""

    def __init__(
        self,
        message: str,
        *,
        permanent: bool = False,
        destination: str | None = None,
    ) -> None:
        super().__init__(message)
        self.user_message = message
        self.permanent = permanent
        self.destination = destination


class InstagramNotConfigured(InstagramError):
    def __init__(self) -> None:
        super().__init__(
            "Aún no podemos leer este Instagram.",
            permanent=True,
        )


class InstagramNotPublic(InstagramError):
    def __init__(self, destination: str | None = None) -> None:
        super().__init__(
            "Este post no es público o no se pudo leer.",
            permanent=True,
            destination=destination,
        )


class InstagramCaptionTooShort(InstagramError):
    def __init__(self, destination: str | None = None) -> None:
        super().__init__(
            "Este post no tiene texto suficiente para armar un itinerario.",
            permanent=True,
            destination=destination,
        )


_permanent_errors: dict[str, tuple[float, InstagramError]] = {}


def _sweep_permanent_errors(now: float | None = None) -> None:
    ts_now = time.monotonic() if now is None else now
    expired = [
        key
        for key, (ts, _err) in _permanent_errors.items()
        if ts_now - ts > _PERMANENT_TTL_S
    ]
    for key in expired:
        _permanent_errors.pop(key, None)
    while len(_permanent_errors) > _PERMANENT_MAX:
        oldest = next(iter(_permanent_errors))
        _permanent_errors.pop(oldest, None)


def remember_permanent_error(url: str, err: InstagramError) -> None:
    if not err.permanent or isinstance(err, InstagramNotConfigured):
        return
    key = canonical_instagram_url(url) or url
    _sweep_permanent_errors()
    if key in _permanent_errors:
        _permanent_errors.pop(key, None)
    _permanent_errors[key] = (time.monotonic(), err)
    _sweep_permanent_errors()


def recalled_permanent_error(url: str) -> InstagramError | None:
    key = canonical_instagram_url(url) or url
    hit = _permanent_errors.get(key)
    if hit is None:
        return None
    ts, err = hit
    if time.monotonic() - ts > _PERMANENT_TTL_S:
        _permanent_errors.pop(key, None)
        return None
    return err


def day_markers(text: str) -> set[int]:
    """Números de día declarados (`DÍA 2`, `Day 1`). Vacío si no hay marcas."""
    return {int(m.group(1)) for m in _DAY_MARKER_RE.finditer(text or "")}


def caption_has_day_markers(caption: str) -> bool:
    """True si el caption declara DÍA n / Day n. No casa «5 días» ni «unos días geniales»."""
    return bool(day_markers(caption))


def caption_plain_for_length(caption: str) -> str:
    stripped = _HASHTAG_RE.sub(" ", caption or "")
    return re.sub(r"\s+", " ", stripped).strip()


def destination_hint(*, location_name: str | None, caption: str) -> str | None:
    loc = (location_name or "").strip()
    if loc:
        return loc
    tags = re.findall(r"#([^\s#]+)", caption or "")
    for tag in tags:
        cleaned = tag.strip().strip(".,;:!?)")
        if len(cleaned) >= 4:
            return cleaned.replace("_", " ")
    return None


def caption_to_html(caption: str) -> str:
    text = (caption or "").strip()
    if not text:
        return ""
    blocks = re.split(r"\n{2,}", text)
    parts: list[str] = []
    for block in blocks:
        inner = "<br>".join(html.escape(line) for line in block.split("\n"))
        parts.append(f"<p>{inner}</p>")
    return "".join(parts)


def llm_plain_text(media: InstagramMedia) -> str:
    kind = media.product_type or ("video" if media.is_video else "post")
    lines = [f"Instagram {kind} by @{media.owner_username}"]
    if media.owner_full_name:
        lines[0] += f" ({media.owner_full_name})"
    if media.location_name:
        lines.append(f"Location: {media.location_name}")
    lines.append("")
    lines.append("CAPTION:")
    lines.append(media.caption.strip())
    return "\n".join(lines)


def instagram_content_hash(caption: str) -> str:
    """Hash calculable sin OCR. Subir IG_PIPELINE_VERSION invalida filas de Fase 1."""
    return content_hash(f"{IG_PIPELINE_VERSION}\x1e{caption or ''}")


def _env_bool(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    if raw in {"0", "false", "off", "no"}:
        return False
    if raw in {"1", "true", "on", "yes"}:
        return True
    return default


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if raw.isdigit():
        return int(raw)
    return default


def ocr_enabled() -> bool:
    return _env_bool("INSTAGRAM_OCR_ENABLED", True)


def should_run_ocr(media: InstagramMedia, *, allow_ocr: bool) -> bool:
    """Las cinco condiciones del gate. Un reel de una sola imagen queda fuera (alcance)."""
    if not allow_ocr:
        return False
    if not ocr_enabled():
        return False
    if caption_has_day_markers(media.caption):
        return False
    if len(media.display_urls) < 2:
        return False
    max_chars = _env_int("INSTAGRAM_OCR_MAX_CAPTION_CHARS", 0)
    if max_chars > 0 and len(media.caption or "") > max_chars:
        return False
    return True


def overlay_block(slides: list[tuple[int, str]]) -> str:
    if not slides:
        return ""
    lines = [
        "OVERLAY TEXT (transcripción de las imágenes del carrusel, en orden):"
    ]
    for index, text in slides:
        lines.append(f"Slide {index}: {text}")
    return "\n".join(lines)


def overlay_to_html(slides: list[tuple[int, str]]) -> str:
    nonempty = [(i, t) for i, t in slides if (t or "").strip()]
    if not nonempty:
        return ""
    parts = ["<hr>", "<p><strong>Texto de las diapositivas</strong></p>"]
    for index, text in nonempty:
        parts.append(f"<p>Slide {index}: {html.escape(text)}</p>")
    return "".join(parts)


@dataclass
class InstagramText:
    """Única fuente del texto fusionado, del detector y de la Crónica."""

    plain_text: str
    detector_text: str
    chronicle_html: str
    caption: str
    overlay: str
    ocr_slides: int = 0
    ocr_chars: int = 0
    ocr_ms: int | None = None
    ocr_error: str | None = None
    ocr_visual_tokens: int = 0
    ocr_flipped_structured: bool | None = None


def _text_from_caption(media: InstagramMedia) -> InstagramText:
    caption = media.caption or ""
    return InstagramText(
        plain_text=llm_plain_text(media),
        detector_text=caption,
        chronicle_html=caption_to_html(caption),
        caption=caption,
        overlay="",
    )


async def instagram_llm_text(
    media: InstagramMedia,
    *,
    allow_ocr: bool,
) -> InstagramText:
    """Texto que ven el destilado, el coerce y la Crónica. OCR opcional y fail-open."""
    base = _text_from_caption(media)
    if not should_run_ocr(media, allow_ocr=allow_ocr):
        return base
    result = await ocr_instagram_slides(media)
    overlay = overlay_block(result.slides)
    overlay_plain = "\n".join(text for _i, text in result.slides)
    caption_marks = day_markers(media.caption)
    overlay_marks = day_markers(overlay)
    flipped = bool(overlay_marks) and len(overlay_marks) >= 2 and not caption_marks
    plain = base.plain_text
    detector = base.caption
    chronicle = base.chronicle_html
    if overlay:
        plain = f"{plain}\n\n{overlay}"
        detector = f"{media.caption}\n{overlay}"
        chronicle = chronicle + overlay_to_html(result.slides)
    return InstagramText(
        plain_text=plain,
        detector_text=detector,
        chronicle_html=chronicle,
        caption=media.caption or "",
        overlay=overlay_plain,
        ocr_slides=len(result.slides),
        ocr_chars=len(overlay_plain),
        ocr_ms=result.ms,
        ocr_error=result.error,
        ocr_visual_tokens=result.visual_tokens,
        ocr_flipped_structured=flipped if result.slides or result.error else None,
    )


@dataclass
class InstagramMedia:
    shortcode: str
    caption: str
    owner_username: str
    owner_full_name: str | None = None
    location_name: str | None = None
    display_urls: list[str] = field(default_factory=list)
    display_candidates: list[list[ImageCandidate]] = field(default_factory=list)
    taken_at: datetime | None = None
    is_video: bool = False
    product_type: str | None = None


class InstagramResolver(Protocol):
    async def resolve(self, shortcode: str) -> InstagramMedia: ...


def _as_str(value: Any) -> str | None:
    if isinstance(value, str):
        text = value.strip()
        return text or None
    return None


def _caption_from_graphql_node(node: dict[str, Any]) -> str:
    caption = _as_str(node.get("caption")) or _as_str(node.get("text")) or ""
    if caption:
        return caption
    edge = node.get("edge_media_to_caption")
    if isinstance(edge, dict):
        edges = edge.get("edges")
        if isinstance(edges, list) and edges:
            first = edges[0]
            if isinstance(first, dict):
                inner = first.get("node")
                if isinstance(inner, dict):
                    return _as_str(inner.get("text")) or ""
    return ""


def _owner_from_node(node: dict[str, Any]) -> tuple[str, str | None]:
    owner = node.get("owner")
    if isinstance(owner, dict):
        username = (
            _as_str(owner.get("username"))
            or _as_str(owner.get("owner_username"))
            or ""
        )
        full = _as_str(owner.get("full_name"))
        return username, full
    username = (
        _as_str(node.get("owner_username"))
        or _as_str(node.get("username"))
        or ""
    )
    full = _as_str(node.get("owner_full_name")) or _as_str(node.get("full_name"))
    return username, full


def _location_from_node(node: dict[str, Any]) -> str | None:
    loc = node.get("location")
    if isinstance(loc, dict):
        return _as_str(loc.get("name"))
    return _as_str(node.get("location_name"))


def _candidate_from_resource(obj: dict[str, Any]) -> ImageCandidate | None:
    url = (
        _as_str(obj.get("src"))
        or _as_str(obj.get("url"))
        or _as_str(obj.get("display_url"))
    )
    if not url:
        return None
    raw_w = obj.get("config_width") if "config_width" in obj else obj.get("width")
    raw_h = obj.get("config_height") if "config_height" in obj else obj.get("height")
    width = int(raw_w) if isinstance(raw_w, (int, float)) else None
    height = int(raw_h) if isinstance(raw_h, (int, float)) else None
    return ImageCandidate(url=url, width=width, height=height)


def _candidates_from_child(child: dict[str, Any]) -> list[ImageCandidate]:
    out: list[ImageCandidate] = []
    resources = child.get("display_resources")
    if isinstance(resources, list):
        for item in resources:
            if isinstance(item, dict):
                cand = _candidate_from_resource(item)
                if cand:
                    out.append(cand)
    versions = child.get("image_versions2")
    if isinstance(versions, dict):
        listed = versions.get("candidates")
        if isinstance(listed, list):
            for item in listed:
                if isinstance(item, dict):
                    cand = _candidate_from_resource(item)
                    if cand:
                        out.append(cand)
    extra = child.get("candidates")
    if isinstance(extra, list):
        for item in extra:
            if isinstance(item, dict):
                cand = _candidate_from_resource(item)
                if cand:
                    out.append(cand)
    single = _as_str(child.get("display_url")) or _as_str(child.get("url"))
    if single and not any(c.url == single for c in out):
        out.append(ImageCandidate(url=single))
    return out


def _sidecar_children(node: dict[str, Any]) -> list[dict[str, Any]]:
    sidecar = node.get("edge_sidecar_to_children") or node.get("carousel_media")
    children: list[dict[str, Any]] = []
    if isinstance(sidecar, dict):
        edges = sidecar.get("edges")
        if isinstance(edges, list):
            for edge in edges:
                if not isinstance(edge, dict):
                    continue
                child = edge.get("node")
                if isinstance(child, dict):
                    children.append(child)
    if isinstance(sidecar, list):
        for child in sidecar:
            if isinstance(child, dict):
                children.append(child)
    return children


def _slides_from_node(
    node: dict[str, Any],
) -> tuple[list[str], list[list[ImageCandidate]]]:
    children = _sidecar_children(node)
    slides: list[list[ImageCandidate]] = []
    if children:
        for child in children:
            cands = _candidates_from_child(child)
            if cands:
                slides.append(cands)
    listed = node.get("display_urls")
    if isinstance(listed, list) and not slides:
        for item in listed:
            url = _as_str(item)
            if url:
                slides.append([ImageCandidate(url=url)])
    resources = node.get("display_resources")
    if isinstance(resources, list) and resources and not children:
        # Un solo media con varios tamaños, no un carrusel.
        pass
    if not slides:
        cands = _candidates_from_child(node)
        if cands:
            slides.append(cands)
    urls: list[str] = []
    seen: set[str] = set()
    for group in slides:
        url = group[0].url if group else None
        if url and url not in seen:
            seen.add(url)
            urls.append(url)
    return urls, slides


def _display_urls_from_node(node: dict[str, Any]) -> list[str]:
    urls, _slides = _slides_from_node(node)
    return urls


def _taken_at_from_node(node: dict[str, Any]) -> datetime | None:
    raw = node.get("taken_at") or node.get("taken_at_timestamp")
    if isinstance(raw, (int, float)):
        try:
            return datetime.fromtimestamp(int(raw), tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(raw, str) and raw.isdigit():
        try:
            return datetime.fromtimestamp(int(raw), tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    return None


def parse_media_payload(data: dict[str, Any], *, shortcode: str) -> InstagramMedia:
    """Acepta el contrato propio y el nodo GraphQL de un media."""
    node = data
    if isinstance(data.get("data"), dict):
        inner = data["data"]
        if isinstance(inner.get("shortcode_media"), dict):
            node = inner["shortcode_media"]
        elif isinstance(inner.get("xdt_shortcode_media"), dict):
            node = inner["xdt_shortcode_media"]
        elif isinstance(inner.get("media"), dict):
            node = inner["media"]
    if isinstance(data.get("media"), dict) and "caption" in data["media"]:
        node = data["media"]

    caption = _caption_from_graphql_node(node)
    username, full_name = _owner_from_node(node)
    if not username:
        raise InstagramNotPublic()
    code = _as_str(node.get("shortcode")) or shortcode
    product = _as_str(node.get("product_type"))
    is_video = bool(node.get("is_video"))
    urls, slides = _slides_from_node(node)
    return InstagramMedia(
        shortcode=code,
        caption=caption,
        owner_username=username,
        owner_full_name=full_name,
        location_name=_location_from_node(node),
        display_urls=urls,
        display_candidates=slides,
        taken_at=_taken_at_from_node(node),
        is_video=is_video,
        product_type=product,
    )


def _resolve_timeout_s() -> float:
    raw = (os.getenv("INSTAGRAM_RESOLVE_TIMEOUT_S") or "").strip()
    try:
        value = float(raw) if raw else DEFAULT_RESOLVE_TIMEOUT_S
    except ValueError:
        value = DEFAULT_RESOLVE_TIMEOUT_S
    return min(max(value, 3.0), 60.0)


class OffInstagramResolver:
    async def resolve(self, shortcode: str) -> InstagramMedia:
        raise InstagramNotConfigured()


class ExternalInstagramResolver:
    """GET/POST contra INSTAGRAM_PROVIDER_URL. El resto del sistema no conoce el vendor."""

    def __init__(self, endpoint: str, api_key: str) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key

    async def resolve(self, shortcode: str) -> InstagramMedia:
        timeout = _resolve_timeout_s()
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "x-api-key": self.api_key,
        }
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.get(
                    self.endpoint,
                    params={"shortcode": shortcode},
                    headers=headers,
                )
                if response.status_code in (404, 405, 400) and response.request:
                    response = await client.post(
                        self.endpoint,
                        json={"shortcode": shortcode},
                        headers={**headers, "Content-Type": "application/json"},
                    )
        except httpx.TimeoutException as exc:
            raise InstagramError(
                "No pudimos leer Instagram a tiempo. Prueba en unos minutos.",
                permanent=False,
            ) from exc
        except httpx.HTTPError as exc:
            raise InstagramError(
                "No pudimos leer Instagram en este momento. Prueba en unos minutos.",
                permanent=False,
            ) from exc

        if response.status_code in (401, 403, 404, 410):
            raise InstagramNotPublic()
        if response.status_code >= 500:
            raise InstagramError(
                "No pudimos leer Instagram en este momento. Prueba en unos minutos.",
                permanent=False,
            )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise InstagramError(
                "No pudimos leer Instagram en este momento. Prueba en unos minutos.",
                permanent=False,
            ) from exc
        try:
            payload = response.json()
        except ValueError as exc:
            raise InstagramError(
                "No pudimos leer Instagram en este momento. Prueba en unos minutos.",
                permanent=False,
            ) from exc
        if not isinstance(payload, dict):
            raise InstagramNotPublic()
        return parse_media_payload(payload, shortcode=shortcode)


class GraphqlInstagramResolver:
    """Logged-out GraphQL web. Las IPs de datacenter suelen fallar; no es el default."""

    def __init__(self, doc_id: str) -> None:
        self.doc_id = doc_id

    async def resolve(self, shortcode: str) -> InstagramMedia:
        timeout = _resolve_timeout_s()
        headers = {
            "User-Agent": _BROWSER_UA,
            "x-ig-app-id": os.getenv("INSTAGRAM_GRAPHQL_APP_ID") or _IG_WEB_APP_ID,
            "x-requested-with": "XMLHttpRequest",
            "Accept": "*/*",
        }
        body = {
            "variables": f'{{"shortcode":"{shortcode}"}}',
            "doc_id": self.doc_id,
        }
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.post(
                    "https://www.instagram.com/graphql/query",
                    data=body,
                    headers=headers,
                )
        except httpx.TimeoutException as exc:
            raise InstagramError(
                "No pudimos leer Instagram a tiempo. Prueba en unos minutos.",
                permanent=False,
            ) from exc
        except httpx.HTTPError as exc:
            raise InstagramError(
                "No pudimos leer Instagram en este momento. Prueba en unos minutos.",
                permanent=False,
            ) from exc
        if response.status_code in (401, 403, 404):
            raise InstagramNotPublic()
        if response.status_code >= 500:
            raise InstagramError(
                "No pudimos leer Instagram en este momento. Prueba en unos minutos.",
                permanent=False,
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise InstagramNotPublic() from exc
        if not isinstance(payload, dict):
            raise InstagramNotPublic()
        media = parse_media_payload(payload, shortcode=shortcode)
        if not media.caption and not media.location_name:
            raise InstagramNotPublic()
        return media


def media_from_oembed(data: dict[str, Any], *, shortcode: str) -> InstagramMedia:
    """oEmbed de Instagram: `title` es el caption, `author_name` el username."""
    caption = html.unescape(_as_str(data.get("title")) or "")
    username = _as_str(data.get("author_name")) or ""
    if not username:
        author_url = _as_str(data.get("author_url")) or ""
        username = author_url.rstrip("/").rsplit("/", 1)[-1]
    if not username:
        raise InstagramNotPublic()
    kind = (_as_str(data.get("type")) or "").lower()
    return InstagramMedia(
        shortcode=shortcode,
        caption=caption,
        owner_username=username,
        is_video=kind == "video",
        product_type=kind or None,
    )


class OembedInstagramResolver:
    """GET /api/v1/oembed/ logged-out. Mismo gesto que descargar un blog; sin vendor."""

    async def resolve(self, shortcode: str) -> InstagramMedia:
        timeout = _resolve_timeout_s()
        canonical = f"https://www.instagram.com/p/{shortcode}/"
        headers = {
            "User-Agent": _BROWSER_UA,
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                response = await client.get(
                    "https://www.instagram.com/api/v1/oembed/",
                    params={"url": canonical, "hidecaption": "0"},
                    headers=headers,
                )
        except httpx.TimeoutException as exc:
            raise InstagramError(
                "No pudimos leer Instagram a tiempo. Prueba en unos minutos.",
                permanent=False,
            ) from exc
        except httpx.HTTPError as exc:
            raise InstagramError(
                "No pudimos leer Instagram en este momento. Prueba en unos minutos.",
                permanent=False,
            ) from exc
        if response.status_code in (401, 403, 404, 410):
            raise InstagramNotPublic()
        if response.status_code >= 500:
            raise InstagramError(
                "No pudimos leer Instagram en este momento. Prueba en unos minutos.",
                permanent=False,
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise InstagramNotPublic() from exc
        if not isinstance(payload, dict):
            raise InstagramNotPublic()
        media = media_from_oembed(payload, shortcode=shortcode)
        if not media.caption:
            raise InstagramNotPublic()
        return media


class FixtureInstagramResolver:
    """Lee `tests/fixtures/instagram/{shortcode}.json`. Solo con INSTAGRAM_PROVIDER=fixture."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = root

    def _dir(self) -> Path:
        if self.root is not None:
            return self.root
        raw = (os.getenv("INSTAGRAM_FIXTURE_DIR") or "").strip()
        if raw:
            return Path(raw)
        return Path(__file__).resolve().parent / "tests" / "fixtures" / "instagram"

    async def resolve(self, shortcode: str) -> InstagramMedia:
        path = self._dir() / f"{shortcode}.json"
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise InstagramNotPublic() from exc
        except ValueError as exc:
            raise InstagramNotPublic() from exc
        if not isinstance(payload, dict):
            raise InstagramNotPublic()
        return parse_media_payload(payload, shortcode=shortcode)


def provider_name() -> str:
    return (os.getenv("INSTAGRAM_PROVIDER") or "off").strip().lower() or "off"


def get_resolver() -> InstagramResolver:
    name = provider_name()
    if name in {"off", "none", "disabled"}:
        return OffInstagramResolver()
    if name == "graphql":
        doc_id = (os.getenv("INSTAGRAM_GRAPHQL_DOC_ID") or "").strip()
        if not doc_id:
            return OffInstagramResolver()
        return GraphqlInstagramResolver(doc_id)
    if name == "oembed":
        return OembedInstagramResolver()
    if name == "fixture":
        return FixtureInstagramResolver()
    if name == "external":
        endpoint = (os.getenv("INSTAGRAM_PROVIDER_URL") or "").strip()
        key = (os.getenv("INSTAGRAM_PROVIDER_KEY") or "").strip()
        if not endpoint or not key:
            return OffInstagramResolver()
        return ExternalInstagramResolver(endpoint, key)
    return OffInstagramResolver()


def _empty_day(title: str) -> dict[str, Any]:
    return {
        "day": 1,
        "title": title,
        "accommodations": [],
        "activities": [],
        "restaurants": [],
        "transport": [],
        "tips": None,
    }


def _null_affiliates(obj: Any) -> None:
    if isinstance(obj, dict):
        if "affiliate_url" in obj:
            obj["affiliate_url"] = None
        for value in obj.values():
            _null_affiliates(value)
    elif isinstance(obj, list):
        for item in obj:
            _null_affiliates(item)


def _merge_days(days: list[Any], *, title: str) -> dict[str, Any]:
    bag = _empty_day(title)
    tips: list[str] = []
    for day in days:
        if not isinstance(day, dict):
            continue
        for key in ("accommodations", "activities", "restaurants", "transport"):
            items = day.get(key)
            if isinstance(items, list):
                bag[key].extend(items)
        tip = day.get("tips")
        if isinstance(tip, str) and tip.strip():
            tips.append(tip.strip())
    bag["tips"] = " ".join(tips) if tips else None
    return bag


def coerce_instagram_itinerary(
    itinerary: dict[str, Any],
    detector: str | InstagramText,
) -> dict[str, Any]:
    """Cinturón del Caso B: sin marcas de día, aplana aunque Haiku haya repartido.

    Si `detector` es InstagramText, las marcas solo-OCR exigen ≥2 números de día
    distintos. Un caption con marcas sigue valiendo tal cual (Fase 1).
    """
    if isinstance(detector, InstagramText):
        cap = day_markers(detector.caption)
        ovl = day_markers(detector.overlay)
        structured = bool(cap) or len(ovl) >= 2
    else:
        structured = caption_has_day_markers(detector)
    dest = itinerary.get("destination")
    title = dest.strip() if isinstance(dest, str) and dest.strip() else "Destino"
    days_raw = itinerary.get("days")
    days = days_raw if isinstance(days_raw, list) else []

    itinerary["source_structured_by_days"] = structured
    _null_affiliates(itinerary)

    if not structured:
        itinerary["total_days"] = None
        itinerary["days"] = [_merge_days(days, title=title)]
        return itinerary

    numbered = [
        d.get("day")
        for d in days
        if isinstance(d, dict) and isinstance(d.get("day"), int)
    ]
    max_day = max(numbered) if numbered else None
    total = itinerary.get("total_days")
    if not isinstance(total, (int, float)) or total < 1:
        itinerary["total_days"] = max_day
    else:
        itinerary["total_days"] = int(total)
    return itinerary


async def fetch_instagram(
    url: str,
    *,
    resolver: InstagramResolver | None = None,
    allow_ocr: bool = False,
) -> tuple[ArticleFetchResult, InstagramMedia, InstagramText]:
    recalled = recalled_permanent_error(url)
    if recalled is not None:
        raise recalled
    code = parse_instagram_shortcode(url)
    if not code:
        err = InstagramError(
            "Aún no podemos leer perfiles, stories ni hashtags. Pega el enlace de un post o un reel.",
            permanent=True,
        )
        remember_permanent_error(url, err)
        raise err
    active = resolver if resolver is not None else get_resolver()
    try:
        media = await active.resolve(code)
    except InstagramError as err:
        remember_permanent_error(url, err)
        raise
    dest = destination_hint(location_name=media.location_name, caption=media.caption)
    text = await instagram_llm_text(media, allow_ocr=allow_ocr)
    fused_len = len(caption_plain_for_length(text.detector_text))
    if fused_len < MIN_CAPTION_LEN:
        if allow_ocr or not should_run_ocr(media, allow_ocr=True):
            err = InstagramCaptionTooShort(dest)
            remember_permanent_error(url, err)
            raise err
    fetched = ArticleFetchResult(
        plain_text=text.plain_text,
        cleaned_html=text.chronicle_html,
        og_image=None,
        og_title=None,
        etag=None,
        last_modified=None,
        article_modified_at=None,
        content_hash=instagram_content_hash(media.caption),
        content_version=1,
    )
    return fetched, media, text
