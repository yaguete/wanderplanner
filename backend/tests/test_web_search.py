"""Detector de consultas meteo: no pegar include_domains de blogs."""
from __future__ import annotations

from unittest.mock import patch

from web_search import looks_like_weather_query, tavily_search


def test_looks_like_weather_query():
    assert looks_like_weather_query("previsión meteorológica para Innsbruck 24 ago")
    assert looks_like_weather_query("Innsbruck weather forecast August 24")
    assert looks_like_weather_query("¿va a llover en Salzburgo?")
    assert looks_like_weather_query("¿Qué tiempo crees que hará en las fechas de mi viaje?")
    assert looks_like_weather_query("el tiempo en Viena")
    assert not looks_like_weather_query("mejores restaurantes Innsbruck")
    assert not looks_like_weather_query("tiempo libre en Viena")
    assert not looks_like_weather_query("cómo moverme por el Tirol")


async def test_weather_query_skips_preferred_blog_domains():
    calls: list[dict] = []

    async def fake_call(_client, payload):
        calls.append(payload)
        return {
            "answer": "Afternoon showers in the Alps.",
            "results": [
                {
                    "title": "Innsbruck weather",
                    "url": "https://www.accuweather.com/en/at/innsbruck",
                    "content": "Showers, 20-22 C",
                }
            ],
        }

    with (
        patch.dict("os.environ", {"TAVILY_API_KEY": "test"}, clear=False),
        patch("web_search._tavily_call", new=fake_call),
    ):
        out = await tavily_search(
            "previsión meteorológica Innsbruck 24 ago – 1 sep",
            preferred_domains=["lacosmopolilla.com", "example-blog.com"],
        )

    assert len(calls) == 1
    assert "include_domains" not in calls[0]
    assert calls[0].get("include_answer") is True
    assert out["answer"] == "Afternoon showers in the Alps."
    assert out["results"][0]["url"].startswith("https://www.accuweather.com")


async def test_non_weather_query_still_prefers_blogs():
    calls: list[dict] = []

    async def fake_call(_client, payload):
        calls.append(payload)
        n = payload.get("max_results") or 5
        domain = (payload.get("include_domains") or ["web"])[0]
        return {
            "results": [
                {
                    "title": f"hit {domain}",
                    "url": f"https://{domain}/p{i}",
                    "content": "guia",
                }
                for i in range(n)
            ]
        }

    with (
        patch.dict("os.environ", {"TAVILY_API_KEY": "test"}, clear=False),
        patch("web_search._tavily_call", new=fake_call),
    ):
        out = await tavily_search(
            "mejores restaurantes Innsbruck",
            max_results=3,
            preferred_domains=["lacosmopolilla.com"],
        )

    assert calls[0].get("include_domains") == ["lacosmopolilla.com"]
    assert "include_answer" not in calls[0]
    assert all(r.get("from_user_reference") for r in out["results"])
