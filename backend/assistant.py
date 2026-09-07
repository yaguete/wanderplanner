"""
Asistente de viaje: DeepSeek V4 Flash + tools (Tavily, fetch_url, fichas país, propuestas).
POST /assistant/chat → SSE (delta | tool | action | done | error).
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import date
from pathlib import Path
from typing import Any, AsyncIterator, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from article_fetch import fetch_article
from auth import AuthUser, require_user
from country_briefs import (
    ISO_TO_NAME,
    ensure_briefs,
    ficha_url,
    format_briefs_for_prompt,
    get_cached_brief,
    iso_to_slug,
    list_known_codes,
    fetch_and_cache,
)
from inspirational_source import is_inspirational_source_url
from itinerary_schema import usable_affiliate_url
from obs import log_kv
from usage import enforce_usage, record_event
from web_search import tavily_search

PROMPT_PATH = Path(__file__).parent / "agents" / "travel_assistant.md"

router = APIRouter(tags=["assistant"])
logger = logging.getLogger(__name__)

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Busca en internet información actual (requisitos, previsión meteorológica, "
                "horarios, blogs) cuando no esté en las fuentes del usuario ni en la ficha país. "
                "Para el tiempo, usa «weather forecast» + ciudad + fechas (AccuWeather, Meteoblue); "
                "no busques en blogs de viaje."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Consulta de búsqueda"},
                    "max_results": {
                        "type": "integer",
                        "description": "Número de resultados (1-10)",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_url",
            "description": "Descarga y limpia el texto principal de una URL (artículo o página).",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL absoluta http(s)"},
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_country_brief",
            "description": (
                "Obtiene la ficha país del Ministerio de Asuntos Exteriores de España "
                "(visados, sanidad, seguridad). Usa código ISO alpha-2 o nombre en español."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "country": {
                        "type": "string",
                        "description": "Código ISO (ES, JP…) o nombre (Japón, Colombia…)",
                    },
                },
                "required": ["country"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_add_source",
            "description": (
                "Propone al usuario añadir una URL como fuente de inspiración "
                "(artículo de blog, guía o crónica de viaje extraíble a itinerario). "
                "No uses esta herramienta con webs institucionales, oficiales de una "
                "atracción (museos, palacios, taquillas), OTAs ni tiendas de entradas: "
                "esas URLs se citan en el texto. No la añade automáticamente; el usuario "
                "debe confirmar en la UI."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "title": {"type": "string"},
                    "why": {"type": "string", "description": "Motivo breve de la propuesta"},
                },
                "required": ["url", "title", "why"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_add_item",
            "description": (
                "Propone añadir un ítem a un día del itinerario. "
                "Si el sitio YA está extraído en Fuentes, pasa source_id y "
                "source_item_id del briefing (consolida autor y afiliado). "
                "Si es una recomendación nueva, omite esos ids. "
                "En activity nueva, pasa url si encontraste la web oficial o de "
                "entradas (museo, taquilla, tour). No inventes URLs. "
                "En stay no pases url: el enlace de Booking se genera solo. "
                "region geocodifica el ítem en el mapa: no lo dejes vacío si conoces el sitio. "
                "No lo añade automáticamente; el usuario confirma."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "day_id": {"type": "string", "description": "id del UserDay del briefing"},
                    "type": {
                        "type": "string",
                        "enum": ["transport", "stay", "food", "activity"],
                    },
                    "name": {"type": "string"},
                    "detail": {"type": "string"},
                    "region": {
                        "type": "string",
                        "description": "Pista geográfica corta (pueblo, provincia)",
                    },
                    "source_id": {
                        "type": "string",
                        "description": "id de la Fuente si consolidar un ítem extraído",
                    },
                    "source_item_id": {
                        "type": "string",
                        "description": "id del ítem extraído (id=`…` en Ítems extraídos)",
                    },
                    "url": {
                        "type": "string",
                        "description": (
                            "Solo recomendaciones nuevas (sin source_id). "
                            "activity: URL oficial o de compra de entradas que hayas "
                            "encontrado. No la uses en stay ni al consolidar de Fuentes. "
                            "No inventes URLs."
                        ),
                    },
                },
                "required": ["day_id", "type", "name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_move_item",
            "description": (
                "Propone mover un ítem que YA está en el itinerario a otro día "
                "o a otra posición del mismo día. Para 'después del palacio' usa "
                "anchor_item_id del palacio y position=after. "
                "No muevas ida/vuelta. El usuario confirma."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "item_id": {"type": "string"},
                    "to_day_id": {"type": "string"},
                    "name": {"type": "string"},
                    "why": {"type": "string"},
                    "anchor_item_id": {
                        "type": "string",
                        "description": "Ítem relativo (id=`…`) para before/after",
                    },
                    "position": {
                        "type": "string",
                        "enum": ["before", "after"],
                    },
                },
                "required": ["item_id", "to_day_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_swap_items",
            "description": (
                "Intercambia dos ítems del plan (de día y/o de posición). "
                "Una llamada por par. No intercambies ida/vuelta. El usuario confirma."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "item_id_a": {"type": "string"},
                    "item_id_b": {"type": "string"},
                    "name_a": {"type": "string"},
                    "name_b": {"type": "string"},
                    "why": {"type": "string"},
                },
                "required": ["item_id_a", "item_id_b"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_remove_item",
            "description": (
                "Propone quitar un ítem del plan. No quites ida/vuelta. "
                "El usuario confirma; se perderá el coste apuntado de esa reserva."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "item_id": {"type": "string"},
                    "name": {"type": "string"},
                    "why": {"type": "string"},
                },
                "required": ["item_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_add_transport",
            "description": (
                "Propone un traslado INTERNO (ciudad A → ciudad B) en un día. "
                "No lo uses para la ida o la vuelta del viaje. Sin coordenadas: "
                "el usuario completará el formulario. El usuario confirma."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "day_id": {"type": "string"},
                    "from": {"type": "string", "description": "Origen (texto, p. ej. Innsbruck)"},
                    "to": {"type": "string", "description": "Destino (texto)"},
                    "mode": {
                        "type": "string",
                        "enum": ["car", "taxi", "train", "bus", "flight", "ferry", "other"],
                    },
                    "why": {"type": "string"},
                },
                "required": ["day_id", "from", "to"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_add_extra_task",
            "description": (
                "Propone una tarea suelta en Básicos (SIM, viñeta, EHIC, peajes, "
                "trámites). category: paperwork o health para trámites; basic para "
                "SIM/seguro; other si no encaja. El usuario confirma."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": [
                            "accommodation",
                            "transport",
                            "activity",
                            "food",
                            "basic",
                            "paperwork",
                            "health",
                            "other",
                        ],
                    },
                    "why": {"type": "string"},
                },
                "required": ["title", "category"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_add_basic",
            "description": (
                "Propone añadir a Básicos un descuento/oferta YA extraído de una "
                "Fuente (source_id + source_basic_id del briefing). Conserva afiliado. "
                "No inventes básicos. El usuario confirma."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "source_id": {"type": "string"},
                    "source_basic_id": {"type": "string"},
                    "why": {"type": "string"},
                },
                "required": ["source_id", "source_basic_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_set_task_cost",
            "description": (
                "Apunta el coste TOTAL de una reserva en trip.tasks. "
                "task_ref es el ref=`…` de ## Tareas del viaje. "
                "SOLO si el usuario da la cifra o pide apuntarla. Nunca inventes precios."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "task_ref": {"type": "string"},
                    "cost": {"type": "number", "description": "Coste total de la reserva, no por persona"},
                    "why": {"type": "string"},
                },
                "required": ["task_ref", "cost"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "suggest_followups",
            "description": (
                "Sugerencias cortas (1-3) para los chips encima del cajón, al cierre "
                "de tu respuesta. Solo cosas que puedes hacer ahora: buscar, ficha "
                "país, o proponer una mutación de esta lista. Nada de auditorías, "
                "clima detallado por día, ni clonar un día de la guía."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "prompts": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 1,
                        "maxItems": 3,
                    },
                },
                "required": ["prompts"],
            },
        },
    },
]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class AssistantRequest(BaseModel):
    trip_briefing: str
    countries: list[str] = Field(default_factory=list)
    messages: list[ChatMessage]
    # Perfil de viajero en markdown (tipos, notas y referencias favoritas).
    user_profile: str | None = None
    # Dominios de las referencias del usuario; Tavily los prioriza en `web_search`.
    preferred_domains: list[str] = Field(default_factory=list)


def _assistant_model() -> str:
    return (os.getenv("ASSISTANT_MODEL") or "deepseek-v4-flash").strip()


def _deepseek_client() -> AsyncOpenAI:
    key = (os.getenv("DEEPSEEK_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY no configurada")
    return AsyncOpenAI(api_key=key, base_url="https://api.deepseek.com")


def _resolve_country_code(country: str) -> str | None:
    raw = (country or "").strip()
    if not raw:
        return None
    if len(raw) == 2 and raw.isalpha():
        code = raw.upper()
        if iso_to_slug(code):
            return code
    # Nombre → ISO
    needle = re.sub(r"\s+", " ", raw).strip().casefold()
    for code, name in ISO_TO_NAME.items():
        if name.casefold() == needle:
            return code
    for code, name in ISO_TO_NAME.items():
        if needle in name.casefold() or name.casefold() in needle:
            return code
    return None


def _opt_str(args: dict[str, Any], key: str) -> str | None:
    raw = args.get(key)
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def _normalize_prompts(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        text = str(item).strip()
        if text and text not in out:
            out.append(text)
        if len(out) >= 3:
            break
    return out


FOLLOWUPS_KIND = "_followups"
TERMINAL_TOOLS = frozenset({"suggest_followups"})
_PROPOSED_ACK = json.dumps(
    {
        "status": "proposed",
        "message": (
            "Tarjeta mostrada. No recuentes la propuesta ni pidas confirmación "
            "en el texto; el usuario ya la ve."
        ),
    },
    ensure_ascii=False,
)


def is_terminal_round(full_content: str, tool_names: list[str]) -> bool:
    """True si esta ronda ya cerró en prosa y solo llamó tools terminales (followups)."""
    return bool(full_content.strip()) and bool(tool_names) and all(
        name in TERMINAL_TOOLS for name in tool_names
    )


def _sse(event: str, data: dict[str, Any]) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


async def _run_tool(
    name: str,
    args: dict[str, Any],
    preferred_domains: list[str] | None = None,
) -> tuple[str, dict[str, Any] | None]:
    """
    Ejecuta una tool. Devuelve (contenido_para_el_modelo, action_event_o_None).
    """
    if name == "web_search":
        result = await tavily_search(
            str(args.get("query") or ""),
            max_results=int(args.get("max_results") or 5),
            preferred_domains=preferred_domains,
        )
        return json.dumps(result, ensure_ascii=False), None

    if name == "fetch_url":
        url = str(args.get("url") or "").strip()
        if not url.startswith(("http://", "https://")):
            return json.dumps({"error": "URL inválida"}, ensure_ascii=False), None
        try:
            fetched = await fetch_article(url)
            plain = fetched.plain_text
            if len(plain) > 24000:
                plain = plain[:24000] + "\n…[truncado]"
            return json.dumps(
                {"url": url, "og_image": fetched.og_image, "text": plain},
                ensure_ascii=False,
            ), None
        except Exception as e:
            return json.dumps({"error": str(e), "url": url}, ensure_ascii=False), None

    if name == "get_country_brief":
        code = _resolve_country_code(str(args.get("country") or ""))
        if not code:
            return json.dumps(
                {
                    "error": "País no reconocido",
                    "hint": "Usa ISO alpha-2 o nombre en español",
                    "examples": list_known_codes()[:20],
                },
                ensure_ascii=False,
            ), None
        text = get_cached_brief(code)
        if text is None:
            meta = await fetch_and_cache(code)
            if meta.get("error"):
                return json.dumps(
                    {"code": code, "error": meta["error"], "url": ficha_url(code)},
                    ensure_ascii=False,
                ), None
            text = get_cached_brief(code) or ""
        if len(text) > 50000:
            text = text[:50000] + "\n…[truncado]"
        return json.dumps(
            {
                "code": code,
                "name": ISO_TO_NAME.get(code, code),
                "url": ficha_url(code),
                "text": text,
            },
            ensure_ascii=False,
        ), None

    if name == "propose_add_source":
        url = str(args.get("url") or "").strip()
        if not is_inspirational_source_url(url):
            return json.dumps(
                {
                    "error": (
                        "Esa URL no es una fuente de inspiración extraíble "
                        "(blog/guía/crónica). Cítala en el texto si es el origen "
                        "de un dato; no la propongas como fuente del viaje."
                    )
                },
                ensure_ascii=False,
            ), None
        action = {
            "kind": "add_source",
            "url": url,
            "title": str(args.get("title") or "").strip(),
            "why": str(args.get("why") or "").strip(),
        }
        return _PROPOSED_ACK, action

    if name == "propose_add_item":
        source_id = _opt_str(args, "source_id")
        source_item_id = _opt_str(args, "source_item_id")
        url = usable_affiliate_url(_opt_str(args, "url"))
        if source_id and source_item_id:
            url = None
        action = {
            "kind": "add_item",
            "day_id": str(args.get("day_id") or "").strip(),
            "type": str(args.get("type") or "activity").strip(),
            "name": str(args.get("name") or "").strip(),
            "detail": _opt_str(args, "detail"),
            "region": _opt_str(args, "region"),
            "source_id": source_id,
            "source_item_id": source_item_id,
            "url": url,
        }
        return _PROPOSED_ACK, action

    if name == "propose_move_item":
        item_id = str(args.get("item_id") or "").strip()
        to_day_id = str(args.get("to_day_id") or "").strip()
        if not item_id or not to_day_id:
            return json.dumps(
                {"error": "item_id y to_day_id son obligatorios"},
                ensure_ascii=False,
            ), None
        position = _opt_str(args, "position")
        if position not in (None, "before", "after"):
            position = None
        action = {
            "kind": "move_item",
            "item_id": item_id,
            "to_day_id": to_day_id,
            "name": _opt_str(args, "name"),
            "why": _opt_str(args, "why"),
            "anchor_item_id": _opt_str(args, "anchor_item_id"),
            "position": position,
        }
        return _PROPOSED_ACK, action

    if name == "propose_swap_items":
        item_id_a = str(args.get("item_id_a") or "").strip()
        item_id_b = str(args.get("item_id_b") or "").strip()
        if not item_id_a or not item_id_b:
            return json.dumps(
                {"error": "item_id_a e item_id_b son obligatorios"},
                ensure_ascii=False,
            ), None
        action = {
            "kind": "swap_items",
            "item_id_a": item_id_a,
            "item_id_b": item_id_b,
            "name_a": _opt_str(args, "name_a"),
            "name_b": _opt_str(args, "name_b"),
            "why": _opt_str(args, "why"),
        }
        return _PROPOSED_ACK, action

    if name == "propose_remove_item":
        item_id = str(args.get("item_id") or "").strip()
        if not item_id:
            return json.dumps({"error": "item_id es obligatorio"}, ensure_ascii=False), None
        action = {
            "kind": "remove_item",
            "item_id": item_id,
            "name": _opt_str(args, "name"),
            "why": _opt_str(args, "why"),
        }
        return _PROPOSED_ACK, action

    if name == "propose_add_transport":
        day_id = str(args.get("day_id") or "").strip()
        from_label = str(args.get("from") or "").strip()
        to_label = str(args.get("to") or "").strip()
        if not day_id or not from_label or not to_label:
            return json.dumps(
                {"error": "day_id, from y to son obligatorios"},
                ensure_ascii=False,
            ), None
        action = {
            "kind": "add_transport",
            "day_id": day_id,
            "from": from_label,
            "to": to_label,
            "mode": _opt_str(args, "mode"),
            "why": _opt_str(args, "why"),
        }
        return _PROPOSED_ACK, action

    if name == "propose_add_extra_task":
        title = str(args.get("title") or "").strip()
        category = str(args.get("category") or "").strip() or "other"
        if not title:
            return json.dumps({"error": "title es obligatorio"}, ensure_ascii=False), None
        action = {
            "kind": "add_extra_task",
            "title": title,
            "category": category,
            "why": _opt_str(args, "why"),
        }
        return _PROPOSED_ACK, action

    if name == "propose_add_basic":
        source_id = str(args.get("source_id") or "").strip()
        source_basic_id = str(args.get("source_basic_id") or "").strip()
        if not source_id or not source_basic_id:
            return json.dumps(
                {"error": "source_id y source_basic_id son obligatorios"},
                ensure_ascii=False,
            ), None
        action = {
            "kind": "add_basic",
            "source_id": source_id,
            "source_basic_id": source_basic_id,
            "why": _opt_str(args, "why"),
        }
        return _PROPOSED_ACK, action

    if name == "propose_set_task_cost":
        task_ref = str(args.get("task_ref") or "").strip()
        if not task_ref:
            return json.dumps({"error": "task_ref es obligatorio"}, ensure_ascii=False), None
        try:
            cost = float(args.get("cost"))
        except (TypeError, ValueError):
            return json.dumps({"error": "cost debe ser un número"}, ensure_ascii=False), None
        action = {
            "kind": "set_task_cost",
            "task_ref": task_ref,
            "cost": cost,
            "why": _opt_str(args, "why"),
        }
        return _PROPOSED_ACK, action

    if name == "suggest_followups":
        prompts = _normalize_prompts(args.get("prompts"))
        if not prompts:
            return json.dumps({"error": "prompts vacío"}, ensure_ascii=False), None
        return json.dumps(
            {"status": "ok", "prompts": prompts},
            ensure_ascii=False,
        ), {"kind": FOLLOWUPS_KIND, "prompts": prompts}

    return json.dumps({"error": f"Herramienta desconocida: {name}"}, ensure_ascii=False), None


def _build_system_prompt(
    trip_briefing: str,
    country_briefs_md: str,
    user_profile: str | None,
) -> str:
    template = PROMPT_PATH.read_text(encoding="utf-8")
    return (
        template
        .replace("{today}", date.today().isoformat())
        .replace("{trip_briefing}", trip_briefing or "(Sin briefing)")
        .replace("{country_briefs}", country_briefs_md)
        .replace("{user_profile}", (user_profile or "").strip() or "(Sin perfil configurado)")
    )


_TOOL_COUNT_KEYS = (
    "web_search",
    "fetch_url",
    "get_country_brief",
    "propose_add_item",
    "propose_add_source",
    "propose_move_item",
    "propose_swap_items",
    "propose_remove_item",
    "propose_add_transport",
    "propose_add_extra_task",
    "propose_add_basic",
    "propose_set_task_cost",
    "suggest_followups",
)


async def _stream_chat(
    req: AssistantRequest,
    user: AuthUser | None,
) -> AsyncIterator[str]:
    rounds_done = 0
    actions_emitted = 0
    rounds_exhausted = False
    tool_counts: dict[str, int] = {k: 0 for k in _TOOL_COUNT_KEYS}
    try:
        briefs = await ensure_briefs(req.countries or [])
        country_md = format_briefs_for_prompt(briefs)
        system = _build_system_prompt(req.trip_briefing, country_md, req.user_profile)

        messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
        for m in req.messages:
            if m.role not in ("user", "assistant"):
                continue
            content = (m.content or "").strip()
            if not content:
                continue
            messages.append({"role": m.role, "content": content})

        if not any(m["role"] == "user" for m in messages):
            yield _sse("error", {"message": "Se necesita al menos un mensaje de usuario"})
            return

        client = _deepseek_client()
        model = _assistant_model()
        max_rounds = 8
        # Última ronda reservada sin tools: el modelo cierra en prosa con lo ya obtenido.
        tool_rounds = max_rounds - 1

        for round_idx in range(max_rounds):
            allow_tools = round_idx < tool_rounds
            if not allow_tools:
                rounds_exhausted = True

            yield _sse("status", {"label": "Pensando…"})
            create_kwargs: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "stream": True,
            }
            if allow_tools:
                create_kwargs["tools"] = TOOLS
            stream = await client.chat.completions.create(**create_kwargs)
            rounds_done += 1

            content_parts: list[str] = []
            # tool_call_index -> accumulated
            tool_acc: dict[int, dict[str, str]] = {}
            finish_reason: str | None = None
            saw_content = False

            async for chunk in stream:
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                finish_reason = choice.finish_reason or finish_reason
                delta = choice.delta
                if delta is None:
                    continue

                if delta.content:
                    if not saw_content:
                        yield _sse("status", {"label": None})
                        saw_content = True
                    content_parts.append(delta.content)
                    yield _sse("delta", {"text": delta.content})

                if allow_tools and delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index if tc.index is not None else 0
                        slot = tool_acc.setdefault(idx, {"id": "", "name": "", "arguments": ""})
                        if tc.id:
                            slot["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                slot["name"] = tc.function.name
                            if tc.function.arguments:
                                slot["arguments"] += tc.function.arguments

            assistant_msg: dict[str, Any] = {"role": "assistant"}
            full_content = "".join(content_parts)
            if full_content:
                assistant_msg["content"] = full_content
            else:
                assistant_msg["content"] = None

            # DeepSeek a veces escribe prosa Y emite tool_calls con
            # finish_reason=stop (no "tool_calls"). Exigir ese valor
            # descartaba la tarjeta: el modelo decía que la había
            # enviado y el usuario no veía nada.
            if allow_tools and tool_acc:
                # Cierra el bocadillo actual antes de las tools (si hubo texto).
                if full_content.strip():
                    yield _sse("segment", {})

                tool_calls_payload = []
                for idx in sorted(tool_acc.keys()):
                    slot = tool_acc[idx]
                    tool_calls_payload.append(
                        {
                            "id": slot["id"] or f"call_{idx}",
                            "type": "function",
                            "function": {
                                "name": slot["name"],
                                "arguments": slot["arguments"] or "{}",
                            },
                        }
                    )
                assistant_msg["tool_calls"] = tool_calls_payload
                messages.append(assistant_msg)

                called_names: list[str] = []
                for tc in tool_calls_payload:
                    fname = tc["function"]["name"]
                    called_names.append(fname)
                    if fname in tool_counts:
                        tool_counts[fname] += 1
                    raw_args = tc["function"]["arguments"]
                    try:
                        args = json.loads(raw_args) if raw_args else {}
                    except json.JSONDecodeError:
                        args = {}
                    if not isinstance(args, dict):
                        args = {}

                    yield _sse("tool", {"name": fname, "status": "running", "args": args})
                    tool_content, action = await _run_tool(
                        fname, args, req.preferred_domains
                    )
                    if action and action.get("kind") == FOLLOWUPS_KIND:
                        yield _sse("followups", {"prompts": action.get("prompts") or []})
                    elif action:
                        actions_emitted += 1
                        yield _sse("action", action)
                    yield _sse("tool", {"name": fname, "status": "done"})

                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": tool_content,
                        }
                    )
                if is_terminal_round(full_content, called_names):
                    yield _sse("status", {"label": None})
                    yield _sse("done", {})
                    return
                continue

            # Respuesta final (sin más tools), o cierre forzado de la ronda reservada.
            yield _sse("status", {"label": None})
            if full_content or not tool_acc:
                messages.append(assistant_msg)
            yield _sse("done", {})
            return

        # No debería alcanzarse: la última ronda no hace continue. Cierre seguro.
        yield _sse("status", {"label": None})
        yield _sse("done", {})
    except HTTPException as e:
        yield _sse("error", {"message": str(e.detail)})
    except Exception as e:
        yield _sse("error", {"message": str(e)})
    finally:
        # Contar aunque el cliente cierre el stream (GeneratorExit). Solo si hubo gasto.
        if rounds_done > 0:
            fields: dict[str, Any] = {
                "event": "assistant_chat",
                "actions": actions_emitted,
                "rounds": rounds_done,
                "rounds_exhausted": rounds_exhausted,
            }
            for name, n in tool_counts.items():
                if n:
                    fields[name] = n
            log_kv(logger, **fields)
        if user is not None and rounds_done > 0:
            await record_event(user.id, "assistant_message", cost_hint=rounds_done)


@router.post("/assistant/chat")
async def assistant_chat(
    request: AssistantRequest,
    user: AuthUser | None = Depends(require_user),
):
    if not (os.getenv("DEEPSEEK_API_KEY") or "").strip():
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY no configurada")

    await enforce_usage(user, "assistant_message")

    return StreamingResponse(
        _stream_chat(request, user),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
