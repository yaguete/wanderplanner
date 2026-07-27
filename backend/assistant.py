"""
Asistente de viaje: DeepSeek V4 Flash + tools (Tavily, fetch_url, fichas país, propuestas).
POST /assistant/chat → SSE (delta | tool | action | done | error).
"""
from __future__ import annotations

import json
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
from usage import enforce_usage, record_event
from web_search import tavily_search

PROMPT_PATH = Path(__file__).parent / "agents" / "travel_assistant.md"

router = APIRouter(tags=["assistant"])

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Busca en internet información actual (requisitos, blogs, horarios, etc.) "
                "cuando no esté en las fuentes del usuario ni en la ficha país."
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
                "(blogs, guías o crónicas de viaje). No uses esta herramienta con "
                "webs institucionales (gobiernos, embajadas, visados, inmigración, OMS…). "
                "No la añade automáticamente; el usuario debe confirmar en la UI."
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
                "Propone añadir un ítem a un día del itinerario del usuario. "
                "No lo añade automáticamente; el usuario debe confirmar."
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
                },
                "required": ["day_id", "type", "name"],
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
            plain, _html, og = await fetch_article(url)
            if len(plain) > 24000:
                plain = plain[:24000] + "\n…[truncado]"
            return json.dumps(
                {"url": url, "og_image": og, "text": plain},
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
        action = {
            "kind": "add_source",
            "url": str(args.get("url") or "").strip(),
            "title": str(args.get("title") or "").strip(),
            "why": str(args.get("why") or "").strip(),
        }
        return json.dumps(
            {"status": "proposed", "message": "Propuesta enviada al usuario; espera su confirmación."},
            ensure_ascii=False,
        ), action

    if name == "propose_add_item":
        action = {
            "kind": "add_item",
            "day_id": str(args.get("day_id") or "").strip(),
            "type": str(args.get("type") or "activity").strip(),
            "name": str(args.get("name") or "").strip(),
            "detail": (str(args["detail"]).strip() if args.get("detail") is not None else None),
            "region": (str(args["region"]).strip() if args.get("region") is not None else None),
        }
        return json.dumps(
            {"status": "proposed", "message": "Propuesta enviada al usuario; espera su confirmación."},
            ensure_ascii=False,
        ), action

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


async def _stream_chat(
    req: AssistantRequest,
    user: AuthUser | None,
) -> AsyncIterator[str]:
    rounds_done = 0
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

        for _round in range(max_rounds):
            yield _sse("status", {"label": "Pensando…"})
            stream = await client.chat.completions.create(
                model=model,
                messages=messages,
                tools=TOOLS,
                stream=True,
            )
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

                if delta.tool_calls:
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

            if tool_acc and finish_reason == "tool_calls":
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

                for tc in tool_calls_payload:
                    fname = tc["function"]["name"]
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
                    if action:
                        yield _sse("action", action)
                    yield _sse("tool", {"name": fname, "status": "done"})

                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": tool_content,
                        }
                    )
                continue

            # Respuesta final (sin más tools)
            yield _sse("status", {"label": None})
            if full_content or not tool_acc:
                messages.append(assistant_msg)
            yield _sse("done", {})
            return

        yield _sse("error", {"message": "Demasiadas rondas de herramientas; inténtalo de nuevo."})
    except HTTPException as e:
        yield _sse("error", {"message": str(e.detail)})
    except Exception as e:
        yield _sse("error", {"message": str(e)})
    finally:
        # Contar aunque el cliente cierre el stream (GeneratorExit). Solo si hubo gasto.
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
