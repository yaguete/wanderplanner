"""Propuestas del asistente: payloads de tools sin I/O."""
from __future__ import annotations

import json

from assistant import FOLLOWUPS_KIND, _run_tool, is_terminal_round


async def test_propose_move_item_emits_action():
    content, action = await _run_tool(
        "propose_move_item",
        {
            "item_id": " item-mirabell ",
            "to_day_id": "day-5",
            "name": "Palacio de Mirabell",
            "why": "Encaja mejor por la tarde",
            "anchor_item_id": " lunch ",
            "position": "after",
        },
    )
    assert json.loads(content)["status"] == "proposed"
    assert action["kind"] == "move_item"
    assert action["item_id"] == "item-mirabell"
    assert action["anchor_item_id"] == "lunch"
    assert action["position"] == "after"


async def test_propose_move_item_requires_ids():
    content, action = await _run_tool("propose_move_item", {"item_id": "", "to_day_id": "d5"})
    assert action is None
    assert "error" in json.loads(content)


async def test_propose_add_item_with_source():
    content, action = await _run_tool(
        "propose_add_item",
        {
            "day_id": "d3",
            "type": "food",
            "name": "Stiftskeller",
            "source_id": " src-1 ",
            "source_item_id": " rest-1 ",
            "region": "Innsbruck",
        },
    )
    assert json.loads(content)["status"] == "proposed"
    assert action["source_id"] == "src-1"
    assert action["source_item_id"] == "rest-1"
    assert action["region"] == "Innsbruck"


async def test_propose_swap_remove_transport_task_cost():
    _, swap = await _run_tool(
        "propose_swap_items",
        {"item_id_a": "a", "item_id_b": "b", "why": " ritmos "},
    )
    assert swap == {
        "kind": "swap_items",
        "item_id_a": "a",
        "item_id_b": "b",
        "name_a": None,
        "name_b": None,
        "why": "ritmos",
    }

    _, remove = await _run_tool("propose_remove_item", {"item_id": " x "})
    assert remove["kind"] == "remove_item"
    assert remove["item_id"] == "x"

    empty, none = await _run_tool("propose_remove_item", {"item_id": "  "})
    assert none is None
    assert "error" in json.loads(empty)

    _, transport = await _run_tool(
        "propose_add_transport",
        {"day_id": "d2", "from": " Innsbruck ", "to": "Hallstatt", "mode": "train"},
    )
    assert transport["kind"] == "add_transport"
    assert transport["from"] == "Innsbruck"
    assert transport["mode"] == "train"

    _, extra = await _run_tool(
        "propose_add_extra_task",
        {"title": " Viñeta ", "category": "paperwork"},
    )
    assert extra["title"] == "Viñeta"
    assert extra["category"] == "paperwork"

    _, basic = await _run_tool(
        "propose_add_basic",
        {"source_id": "s1", "source_basic_id": "b1"},
    )
    assert basic["kind"] == "add_basic"

    _, cost = await _run_tool(
        "propose_set_task_cost",
        {"task_ref": " activity:hotel ", "cost": 90},
    )
    assert cost["task_ref"] == "activity:hotel"
    assert cost["cost"] == 90.0

    bad, no = await _run_tool("propose_set_task_cost", {"task_ref": "x", "cost": "no"})
    assert no is None
    assert "error" in json.loads(bad)


async def test_suggest_followups():
    content, action = await _run_tool(
        "suggest_followups",
        {"prompts": ["  A  ", "A", "", "B", "C", "D"]},
    )
    assert json.loads(content)["status"] == "ok"
    assert action["kind"] == FOLLOWUPS_KIND
    assert action["prompts"] == ["A", "B", "C"]


def test_is_terminal_round():
    assert is_terminal_round("Te recomiendo moverlo.", ["suggest_followups"]) is True
    assert is_terminal_round("Te recomiendo moverlo.", ["suggest_followups", "propose_move_item"]) is False
    assert is_terminal_round("", ["suggest_followups"]) is False
    assert is_terminal_round("Hola", []) is False


async def test_propose_add_source_accepts_article():
    content, action = await _run_tool(
        "propose_add_source",
        {
            "url": " https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias/ ",
            "title": "Austria en 10 días",
            "why": "Encaja con el ritmo",
        },
    )
    assert json.loads(content)["status"] == "proposed"
    assert action["kind"] == "add_source"
    assert action["url"] == "https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias/"


async def test_propose_add_source_rejects_ticket_shop():
    content, action = await _run_tool(
        "propose_add_source",
        {
            "url": "https://eisriesenwelt.axess.shop/en",
            "title": "Entradas",
            "why": "Precio oficial",
        },
    )
    assert action is None
    assert "error" in json.loads(content)


async def test_propose_add_source_rejects_venue_homepage():
    content, action = await _run_tool(
        "propose_add_source",
        {"url": "https://belvedere.at", "title": "Belvedere", "why": "Oficial"},
    )
    assert action is None
    assert "error" in json.loads(content)
