"""Propuestas del asistente: payloads de tools sin I/O."""
from __future__ import annotations

import json

from assistant import _run_tool


async def test_propose_move_item_emits_action():
    content, action = await _run_tool(
        "propose_move_item",
        {
            "item_id": " item-mirabell ",
            "to_day_id": "day-5",
            "name": "Palacio de Mirabell",
            "why": "Encaja mejor por la tarde",
        },
    )
    assert json.loads(content)["status"] == "proposed"
    assert action == {
        "kind": "move_item",
        "item_id": "item-mirabell",
        "to_day_id": "day-5",
        "name": "Palacio de Mirabell",
        "why": "Encaja mejor por la tarde",
    }


async def test_propose_move_item_requires_ids():
    content, action = await _run_tool("propose_move_item", {"item_id": "", "to_day_id": "d5"})
    assert action is None
    assert "error" in json.loads(content)


async def test_propose_add_item_unchanged():
    content, action = await _run_tool(
        "propose_add_item",
        {"day_id": "d3", "type": "activity", "name": "Mirabell"},
    )
    assert json.loads(content)["status"] == "proposed"
    assert action["kind"] == "add_item"
    assert action["day_id"] == "d3"
    assert action["name"] == "Mirabell"
