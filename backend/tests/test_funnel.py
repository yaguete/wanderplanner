"""Pruebas de POST /funnel: lista blanca, meta acotado, tope IP, post_slug."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import funnel as mod


def setup_function() -> None:
    mod.clear_funnel_runtime_state()


def test_sanitize_name_whitelist():
    assert mod.sanitize_name("start_opened") == "start_opened"
    assert mod.sanitize_name("outbound_click") == "outbound_click"
    assert mod.sanitize_name("account_created") == "account_created"
    assert mod.sanitize_name("scroll") is None
    assert mod.sanitize_name("guest_session_created") is None
    assert mod.sanitize_name("") is None


def test_sanitize_post_slug_rejects_urls_and_emails():
    assert mod.sanitize_post_slug("que-ver-en-austria-ruta-10-dias") == (
        "que-ver-en-austria-ruta-10-dias"
    )
    assert mod.sanitize_post_slug("https://lacosmopolilla.com/austria") is None
    assert mod.sanitize_post_slug("lacosmopolilla.com/austria") is None
    assert mod.sanitize_post_slug("foo@bar.com") is None
    assert mod.sanitize_post_slug("QUE-VER") == "que-ver"
    assert mod.sanitize_post_slug("a" * 121) is None
    assert mod.sanitize_post_slug("") is None
    assert mod.sanitize_post_slug(None) is None


def test_sanitize_ref():
    assert mod.sanitize_ref("lacosmopolilla") == "lacosmopolilla"
    assert mod.sanitize_ref("wp-landing") == "wp-landing"
    assert mod.sanitize_ref("Laco") == "laco"
    assert mod.sanitize_ref("https://x.com") is None
    assert mod.sanitize_ref("foo bar") is None
    assert mod.sanitize_ref(None) is None


def test_sanitize_meta_drops_unknown_keys_and_bad_values():
    cleaned = mod.sanitize_meta(
        {
            "target": "booking",
            "affiliate": "partner",
            "surface": "task_row",
            "href": "https://booking.com/hotel?aid=1",
            "email": "a@b.c",
            "n": 3,
        }
    )
    assert cleaned == {
        "target": "booking",
        "affiliate": "partner",
        "surface": "task_row",
    }
    assert "://" not in str(cleaned)
    assert "@" not in str(cleaned)
    assert mod.sanitize_meta({"target": "not-a-target"}) == {}
    assert mod.sanitize_meta({"surface": "inspiration"}) == {"surface": "inspiration"}
    assert mod.sanitize_meta({"onboarding": "completed"}) == {"onboarding": "completed"}
    assert mod.sanitize_meta({"onboarding": "maybe"}) == {}


def test_normalize_rejects_unknown_name_without_row():
    assert (
        mod.normalize_funnel_event(
            "scroll",
            "lacosmopolilla",
            "que-ver-en-austria-ruta-10-dias",
            {"target": "booking"},
        )
        is None
    )


def test_normalize_keeps_null_ref_and_strips_url_slug():
    row = mod.normalize_funnel_event(
        "start_opened",
        None,
        "https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias",
        {"extra": "nope"},
    )
    assert row is not None
    assert row["name"] == "start_opened"
    assert row["ref"] is None
    assert row["post_slug"] is None
    assert row["meta"] == {}


async def test_ingest_unknown_name_does_not_insert():
    with patch.object(mod, "insert_funnel_event", new_callable=AsyncMock) as insert:
        ok = await mod.ingest_funnel_event(
            name="scroll",
            ref="lacosmopolilla",
            post_slug="austria",
            meta={},
            ip="1.1.1.1",
        )
        assert ok is False
        insert.assert_not_called()


async def test_ingest_known_name_inserts_sanitized_row():
    with patch.object(mod, "insert_funnel_event", new_callable=AsyncMock) as insert:
        ok = await mod.ingest_funnel_event(
            name="outbound_click",
            ref="lacosmopolilla",
            post_slug="que-ver-en-austria-ruta-10-dias",
            meta={"target": "booking", "href": "https://evil.example"},
            ip="1.1.1.1",
        )
        assert ok is True
        insert.assert_awaited_once()
        row = insert.await_args.args[0]
        assert row["name"] == "outbound_click"
        assert row["meta"] == {"target": "booking"}
        assert "://" not in str(row)


async def test_funnel_ip_rate_limit(monkeypatch):
    monkeypatch.setenv("FUNNEL_MAX_IP_DAY", "2")
    with patch.object(mod, "insert_funnel_event", new_callable=AsyncMock) as insert:
        first = await mod.ingest_funnel_event(
            name="start_opened", ref="a", post_slug="p", meta={}, ip="9.9.9.9"
        )
        second = await mod.ingest_funnel_event(
            name="start_opened", ref="a", post_slug="p", meta={}, ip="9.9.9.9"
        )
        third = await mod.ingest_funnel_event(
            name="start_opened", ref="a", post_slug="p", meta={}, ip="9.9.9.9"
        )
        other = await mod.ingest_funnel_event(
            name="start_opened", ref="a", post_slug="p", meta={}, ip="8.8.8.8"
        )
        assert first is True
        assert second is True
        assert third is False
        assert other is True
        assert insert.await_count == 3
