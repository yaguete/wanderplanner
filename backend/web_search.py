"""Cliente Tavily para búsqueda web del asistente de viaje."""
from __future__ import annotations

import os
from typing import Any

import httpx

TAVILY_URL = "https://api.tavily.com/search"


def _normalize_results(data: dict[str, Any]) -> list[dict[str, Any]]:
    results = []
    for item in data.get("results") or []:
        if not isinstance(item, dict):
            continue
        raw = item.get("raw_content") or ""
        if isinstance(raw, str) and len(raw) > 6000:
            raw = raw[:6000] + "…"
        results.append(
            {
                "title": item.get("title"),
                "url": item.get("url"),
                "content": item.get("content"),
                "raw_content": raw or None,
                "score": item.get("score"),
            }
        )
    return results


async def _tavily_call(
    client: httpx.AsyncClient,
    payload: dict[str, Any],
) -> dict[str, Any] | str:
    try:
        r = await client.post(TAVILY_URL, json=payload)
    except Exception as e:
        return f"Error de red Tavily: {e}"
    if r.status_code != 200:
        return f"Tavily HTTP {r.status_code}: {r.text[:300]}"
    data = r.json()
    return data if isinstance(data, dict) else {}


async def tavily_search(
    query: str,
    *,
    max_results: int = 5,
    include_raw_content: bool = True,
    preferred_domains: list[str] | None = None,
    strict: bool = False,
) -> dict[str, Any]:
    """
    Busca en Tavily y devuelve un dict serializable para el LLM.

    Con `preferred_domains` (los blogs y revistas de referencia del usuario) se hace una primera
    pasada restringida a esos dominios; si devuelve poco, se repite la búsqueda abierta y se
    concatenan los resultados, marcando cuáles vienen de una referencia del usuario.

    `strict=True` no cae a la búsqueda abierta: el caller controla el escalón
    (GET /sources/suggest no debe disparar Tavily web sin Turnstile).
    """
    api_key = (os.getenv("TAVILY_API_KEY") or "").strip()
    if not api_key:
        return {"error": "TAVILY_API_KEY no configurada en el servidor"}

    q = (query or "").strip()
    if not q:
        return {"error": "query vacía"}

    n = max(1, min(int(max_results or 5), 10))
    base_payload: dict[str, Any] = {
        "api_key": api_key,
        "query": q,
        "max_results": n,
        "include_raw_content": include_raw_content,
        "search_depth": "basic",
    }
    domains = [d for d in (preferred_domains or []) if d]

    async with httpx.AsyncClient(timeout=30.0) as client:
        preferred_results: list[dict[str, Any]] = []
        if domains:
            first = await _tavily_call(client, {**base_payload, "include_domains": domains})
            if isinstance(first, dict):
                preferred_results = _normalize_results(first)
                for item in preferred_results:
                    item["from_user_reference"] = True
            if len(preferred_results) >= n or strict:
                if isinstance(first, str) and not preferred_results:
                    return {"error": first}
                return {"query": q, "answer": None, "results": preferred_results[:n]}

        remaining = n - len(preferred_results)
        general = await _tavily_call(client, {**base_payload, "max_results": remaining})

    if isinstance(general, str):
        # Falla la abierta pero la restringida trajo algo: mejor eso que un error.
        if preferred_results:
            return {"query": q, "answer": None, "results": preferred_results}
        return {"error": general}

    seen = {item.get("url") for item in preferred_results}
    extra = [item for item in _normalize_results(general) if item.get("url") not in seen]

    return {
        "query": q,
        "answer": general.get("answer"),
        "results": [*preferred_results, *extra][:n],
    }
