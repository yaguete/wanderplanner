import assert from "node:assert/strict"
import type { UserDay } from "@/types/itinerary"
import {
  locateDayItem,
  resolveMoveItem,
  snapshotMoveProposal,
} from "./assistant-actions"

function item(id: string, name: string) {
  return {
    id,
    sourceItemId: `src-${id}`,
    sourceId: "src-1",
    type: "activity" as const,
    name,
    detail: null,
    sourceAuthor: "blog",
  }
}

const days: UserDay[] = [
  { id: "d4", label: "Día 4", items: [item("mirabell", "Palacio de Mirabell"), item("fortress", "Hohensalzburg")] },
  { id: "d5", label: "Día 5", items: [item("zoo", "Zoo de Hellbrunn")] },
]

{
  const found = locateDayItem(days, "mirabell")
  assert.equal(found?.day.id, "d4")
  assert.equal(found?.dayIndex, 0)
  assert.equal(found?.itemIndex, 0)
  assert.equal(locateDayItem(days, "missing"), null)
  const byName = locateDayItem(days, "id-inventado", "Palacio de Mirabell")
  assert.equal(byName?.item.id, "mirabell")
  assert.equal(locateDayItem(days, "id-inventado", "no existe"), null)
}

{
  const moved = resolveMoveItem(days, { item_id: "mirabell", to_day_id: "d5" })
  assert.equal(moved.ok, true)
  if (moved.ok) {
    assert.deepEqual(
      {
        fromDayId: moved.fromDayId,
        toDayId: moved.toDayId,
        itemId: moved.itemId,
        toIndex: moved.toIndex,
        fromDayNumber: moved.fromDayNumber,
        toDayNumber: moved.toDayNumber,
      },
      {
        fromDayId: "d4",
        toDayId: "d5",
        itemId: "mirabell",
        toIndex: 1,
        fromDayNumber: 1,
        toDayNumber: 2,
      },
    )
  }
}

{
  const same = resolveMoveItem(days, { item_id: "mirabell", to_day_id: "d4" })
  assert.equal(same.ok, true)
  if (same.ok) {
    assert.equal(same.toIndex, 1)
    assert.equal(same.fromDayId, same.toDayId)
  }
}

{
  assert.equal(resolveMoveItem(days, { item_id: "ghost", to_day_id: "d5" }).ok, false)
  assert.equal(resolveMoveItem(days, { item_id: "mirabell", to_day_id: "d99" }).ok, false)
  const byName = resolveMoveItem(days, {
    item_id: "uuid-mal",
    to_day_id: "d5",
    name: "Palacio de Mirabell",
  })
  assert.equal(byName.ok, true)
  if (byName.ok) assert.equal(byName.itemId, "mirabell")
}

{
  const snap = snapshotMoveProposal(days, {
    item_id: "mirabell",
    to_day_id: "d5",
    name: "nombre del modelo",
    why: "Más tiempo por la tarde",
  })
  assert.equal(snap.name, "Palacio de Mirabell")
  assert.equal(snap.from_day_number, 1)
  assert.equal(snap.to_day_number, 2)
  assert.equal(snap.from_day_id, "d4")
  assert.equal(snap.why, "Más tiempo por la tarde")
}

console.log("assistant-actions: ok")
