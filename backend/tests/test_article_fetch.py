"""Pruebas de señales de frescura y normalización de URL."""
from __future__ import annotations

from datetime import datetime, timezone

from article_fetch import (
    CONTENT_VERSION,
    content_hash,
    extract_article_modified_at,
    normalize_article_url,
    parse_article_html,
)
from bs4 import BeautifulSoup


def test_normalize_strips_tracking_and_fragment():
    raw = (
        "https://WWW.Example.com/ruta/post/?utm_source=x&fbclid=1&keep=yes#section"
    )
    assert normalize_article_url(raw) == "https://www.example.com/ruta/post?keep=yes"


def test_normalize_trailing_slash():
    assert normalize_article_url("https://blog.com/a/b/") == "https://blog.com/a/b"
    assert normalize_article_url("https://blog.com/") == "https://blog.com"


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
    # La fecha de publicación no cambia al editar: usarla como fallback haría
    # que _content_unchanged diera "sin cambios" para siempre en esos blogs.
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
