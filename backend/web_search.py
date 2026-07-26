"""Cliente Tavily para búsqueda web del asistente de viaje."""
from __future__ import annotations

import os
from typing import Any

import httpx

TAVILY_URL = "https://api.tavily.com/search"


async def tavily_search(
    query: str,
    *,
    max_results: int = 5,
    include_raw_content: bool = True,
) -> dict[str, Any]:
    """
    Busca en Tavily y devuelve un dict serializable para el LLM.
    """
    api_key = (os.getenv("TAVILY_API_KEY") or "").strip()
    if not api_key:
        return {"error": "TAVILY_API_KEY no configurada en el servidor"}

    q = (query or "").strip()
    if not q:
        return {"error": "query vacía"}

    n = max(1, min(int(max_results or 5), 10))
    payload = {
        "api_key": api_key,
        "query": q,
        "max_results": n,
        "include_raw_content": include_raw_content,
        "search_depth": "basic",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(TAVILY_URL, json=payload)
            if r.status_code != 200:
                return {"error": f"Tavily HTTP {r.status_code}: {r.text[:300]}"}
            data = r.json()
    except Exception as e:
        return {"error": f"Error de red Tavily: {e}"}

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

    return {
        "query": q,
        "answer": data.get("answer"),
        "results": results,
    }
