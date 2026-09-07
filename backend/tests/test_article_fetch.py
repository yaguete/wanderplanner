"""Pruebas de señales de frescura y normalización de URL."""
from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest
import respx
from bs4 import BeautifulSoup

from article_fetch import (
    CONTENT_VERSION,
    ArticleUnavailable,
    content_hash,
    extract_article_modified_at,
    fetch_article,
    html_result_usable,
    normalize_article_url,
    parse_article_html,
    slug_from_article_url,
)


def test_normalize_strips_tracking_and_fragment():
    raw = (
        "https://WWW.Example.com/ruta/post/?utm_source=x&fbclid=1&keep=yes#section"
    )
    assert normalize_article_url(raw) == "https://www.example.com/ruta/post?keep=yes"


def test_normalize_trailing_slash():
    assert normalize_article_url("https://blog.com/a/b/") == "https://blog.com/a/b"
    assert normalize_article_url("https://blog.com/") == "https://blog.com"


def test_normalize_instagram_copy_link_case_a():
    raw = (
        "https://www.instagram.com/p/DblDYKZjOhx/"
        "?utm_source=ig_web_copy_link&igsi=MzRlODBiNWFlZA=="
    )
    assert normalize_article_url(raw) == "https://www.instagram.com/p/DblDYKZjOhx"


def test_normalize_instagram_reel_collapses_to_p():
    raw = (
        "https://www.instagram.com/reel/DbYAsLVM7Yd/"
        "?utm_source=ig_web_copy_link&igsh=abc&img_index=1&igshid=legacy"
    )
    assert normalize_article_url(raw) == "https://www.instagram.com/p/DbYAsLVM7Yd"


def test_normalize_instagram_user_path():
    raw = "https://www.instagram.com/lacosmopolilla/p/DblDYKZjOhx/?igsi=x"
    assert normalize_article_url(raw) == "https://www.instagram.com/p/DblDYKZjOhx"


def test_content_hash_stable():
    assert content_hash("hola") == content_hash("hola")
    assert content_hash("hola") != content_hash("hola!")


def test_extract_article_modified_from_og_meta():
    html = """
    <html><head>
      <meta property="article:modified_time" content="2026-08-01T10:00:00+00:00" />
    </head><body><main><p>""" + ("texto " * 100) + """</p></main></body></html>
    """
    soup = BeautifulSoup(html, "lxml")
    stamp = extract_article_modified_at(soup)
    assert stamp == datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc)


def test_extract_article_modified_from_json_ld():
    html = """
    <html><head>
      <script type="application/ld+json">
      {"@type":"Article","dateModified":"2026-07-15T12:00:00Z","datePublished":"2026-01-01T00:00:00Z"}
      </script>
    </head><body><main><p>""" + ("viaje " * 100) + """</p></main></body></html>
    """
    soup = BeautifulSoup(html, "lxml")
    stamp = extract_article_modified_at(soup)
    assert stamp == datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)


def test_extract_ignores_published_only_signals():
    # datePublished no se mueve al editar; no es señal de modificación.
    # El alta compara el hash del texto útil, no esta fecha.
    html = """
    <html><head>
      <meta property="article:published_time" content="2026-01-01T00:00:00+00:00" />
      <script type="application/ld+json">
      {"@type":"Article","datePublished":"2026-01-01T00:00:00Z"}
      </script>
    </head><body><main><p>""" + ("texto " * 100) + """</p></main></body></html>
    """
    soup = BeautifulSoup(html, "lxml")
    assert extract_article_modified_at(soup) is None


def test_parse_article_html_sets_hash_and_version():
    html = """
    <html><head>
      <meta property="og:image" content="https://cdn.example/img.jpg" />
      <meta property="og:title" content="Itinerario por Austria en 10 días | Mi Blog" />
      <meta property="article:modified_time" content="2026-08-01T10:00:00Z" />
    </head><body>
      <main class="entry-content"><p>""" + ("Austria " * 80) + """</p></main>
    </body></html>
    """
    result = parse_article_html(html, "https://example.com/post")
    assert result.content_version == CONTENT_VERSION
    assert result.content_hash == content_hash(result.plain_text)
    assert result.og_image == "https://cdn.example/img.jpg"
    assert result.og_title == "Itinerario por Austria en 10 días"
    assert result.article_modified_at is not None
    assert "Austria" in result.plain_text


_HOST = "blog.example"
_ORIGIN = f"https://{_HOST}"
_BODY = "castillo " * 80
_ARTICLE_HTML = f"""
<html><head>
  <title>Qué ver en Edimburgo</title>
  <meta property="og:title" content="Qué ver en Edimburgo" />
</head><body>
  <div class="elementor-widget-theme-post-content"><p>{_BODY}</p></div>
</body></html>
"""
_WP_POST = [
    {
        "title": {"rendered": "Qué ver en Edimburgo, la ciudad mágica"},
        "content": {"rendered": f"<p>{_BODY}</p>"},
        "modified_gmt": "2026-09-06T10:00:00",
        "link": f"{_ORIGIN}/edimburgo/",
        "_embedded": {
            "wp:featuredmedia": [
                {"source_url": "https://cdn.example/edi.jpg"}
            ]
        },
    }
]


def _allow_public(monkeypatch):
    monkeypatch.setattr("article_fetch.is_public_http_url", lambda _url: True)


def test_slug_from_article_url_uses_last_segment():
    assert (
        slug_from_article_url(
            f"{_ORIGIN}/reino-unido/escocia/que-ver-en-edimburgo-que-hacer/"
        )
        == "que-ver-en-edimburgo-que-hacer"
    )


def test_short_html_with_title_is_usable():
    result = parse_article_html(
        "<html><head><title>Mini</title></head><body><p>hola</p></body></html>",
        f"{_ORIGIN}/mini/",
    )
    assert html_result_usable(result) is True


def test_empty_html_without_title_is_unusable():
    result = parse_article_html("<html><body></body></html>", f"{_ORIGIN}/empty/")
    assert html_result_usable(result) is False


@pytest.mark.asyncio
@respx.mock
async def test_usable_html_does_not_call_wp_rest(monkeypatch):
    _allow_public(monkeypatch)
    page = f"{_ORIGIN}/ruta/"
    respx.get(page).mock(return_value=httpx.Response(200, text=_ARTICLE_HTML))
    result = await fetch_article(page)
    assert result.fetch_path == "html"
    assert result.og_title == "Qué ver en Edimburgo"


@pytest.mark.asyncio
@respx.mock
async def test_challenge_202_falls_back_to_wp_rest(monkeypatch):
    _allow_public(monkeypatch)
    page = f"{_ORIGIN}/edimburgo/"
    respx.get(page).mock(
        return_value=httpx.Response(202, content=b"<html>sgcaptcha</html>")
    )
    respx.get(url__regex=r".*/wp-json/wp/v2/posts.*").mock(
        return_value=httpx.Response(200, json=_WP_POST)
    )
    result = await fetch_article(page)
    assert result.fetch_path == "wp-rest"
    assert result.og_title == "Qué ver en Edimburgo, la ciudad mágica"
    assert result.og_image == "https://cdn.example/edi.jpg"
    assert result.article_modified_at is not None
    assert "castillo" in result.plain_text


@pytest.mark.asyncio
@respx.mock
async def test_empty_body_falls_back_to_wp_rest(monkeypatch):
    _allow_public(monkeypatch)
    page = f"{_ORIGIN}/edimburgo/"
    respx.get(page).mock(return_value=httpx.Response(200, content=b""))
    respx.get(url__regex=r".*/wp-json/wp/v2/posts.*").mock(
        return_value=httpx.Response(200, json=_WP_POST)
    )
    result = await fetch_article(page)
    assert result.fetch_path == "wp-rest"
    assert result.og_title is not None


@pytest.mark.asyncio
@respx.mock
async def test_403_enters_wp_rest_instead_of_raising(monkeypatch):
    _allow_public(monkeypatch)
    page = f"{_ORIGIN}/edimburgo/"
    respx.get(page).mock(return_value=httpx.Response(403, content=b"forbidden"))
    respx.get(url__regex=r".*/wp-json/wp/v2/posts.*").mock(
        return_value=httpx.Response(200, json=_WP_POST)
    )
    result = await fetch_article(page)
    assert result.fetch_path == "wp-rest"


@pytest.mark.asyncio
@respx.mock
async def test_wp_rest_slug_comes_from_final_url(monkeypatch):
    _allow_public(monkeypatch)
    old = f"{_ORIGIN}/que-ver-en-edimburgo/"
    final = f"{_ORIGIN}/que-ver-en-edimburgo-que-hacer/"
    respx.get(old).mock(
        return_value=httpx.Response(301, headers={"Location": final})
    )
    respx.get(final).mock(
        return_value=httpx.Response(202, content=b"sgcaptcha")
    )

    def wp_side_effect(request: httpx.Request) -> httpx.Response:
        slug = request.url.params.get("slug")
        if slug == "que-ver-en-edimburgo-que-hacer":
            return httpx.Response(200, json=_WP_POST)
        return httpx.Response(200, json=[])

    wp = respx.get(url__regex=r".*/wp-json/wp/v2/posts.*").mock(
        side_effect=wp_side_effect
    )
    result = await fetch_article(old)
    assert result.fetch_path == "wp-rest"
    called_slugs = [call.request.url.params.get("slug") for call in wp.calls]
    assert called_slugs[0] == "que-ver-en-edimburgo-que-hacer"


@pytest.mark.asyncio
@respx.mock
async def test_rest_route_when_wp_json_is_challenge(monkeypatch):
    _allow_public(monkeypatch)
    page = f"{_ORIGIN}/edimburgo/"
    respx.get(page).mock(
        return_value=httpx.Response(202, content=b"sgcaptcha")
    )
    respx.get(url__regex=r".*/wp-json/wp/v2/posts.*").mock(
        return_value=httpx.Response(202, content=b"sgcaptcha")
    )
    respx.get(url__regex=r".*rest_route=").mock(
        return_value=httpx.Response(200, json=_WP_POST)
    )
    result = await fetch_article(page)
    assert result.fetch_path == "rest-route"
    assert result.og_title == "Qué ver en Edimburgo, la ciudad mágica"


@pytest.mark.asyncio
@respx.mock
async def test_nothing_usable_raises_article_unavailable(monkeypatch):
    _allow_public(monkeypatch)
    page = f"{_ORIGIN}/edimburgo/"
    respx.get(page).mock(return_value=httpx.Response(200, content=b""))
    respx.get(url__regex=r".*/wp-json/.*").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.get(url__regex=r".*rest_route=.*").mock(
        return_value=httpx.Response(200, json=[])
    )
    with pytest.raises(ArticleUnavailable) as exc:
        await fetch_article(page)
    assert exc.value.reason == "empty"
    assert exc.value.status == 200
    assert "html" in exc.value.tried
    assert "wp-rest" in exc.value.tried
    assert "rest-route" in exc.value.tried


@pytest.mark.asyncio
@respx.mock
async def test_404_does_not_try_wp_rest(monkeypatch):
    _allow_public(monkeypatch)
    page = f"{_ORIGIN}/missing/"
    respx.get(page).mock(return_value=httpx.Response(404, text="not found"))
    with pytest.raises(ArticleUnavailable) as exc:
        await fetch_article(page)
    assert exc.value.status == 404
    assert exc.value.reason == "http-error"
    assert exc.value.tried == ("html",)


@pytest.mark.asyncio
@respx.mock
async def test_large_article_with_cookie_banner_stays_on_html(monkeypatch):
    _allow_public(monkeypatch)
    page = f"{_ORIGIN}/ruta-larga/"
    body = "viaje " * 40_000
    html = (
        "<html><head><title>Ruta larga</title></head><body>"
        "<noscript>enable javascript and cookies</noscript>"
        f"<main class='entry-content'><p>{body}</p></main></body></html>"
    )
    assert len(html.encode()) > 50_000
    respx.get(page).mock(return_value=httpx.Response(200, text=html))
    result = await fetch_article(page)
    assert result.fetch_path == "html"
    assert html_result_usable(result) is True


@pytest.mark.asyncio
@respx.mock
async def test_html_redirect_keeps_same_content_hash(monkeypatch):
    _allow_public(monkeypatch)
    page = f"{_ORIGIN}/ruta"
    final = f"{_ORIGIN}/ruta/"
    respx.get(page).mock(
        return_value=httpx.Response(301, headers={"Location": final})
    )
    respx.get(final).mock(return_value=httpx.Response(200, text=_ARTICLE_HTML))
    fetched = await fetch_article(page)
    parsed = parse_article_html(_ARTICLE_HTML, page)
    assert fetched.content_hash == parsed.content_hash
    assert fetched.fetch_path == "html"
