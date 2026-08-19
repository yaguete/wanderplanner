import assert from "node:assert/strict"
import { groupItemsByDayHint } from "./source-item-groups"
import type { SourceItem } from "@/types/itinerary"

function item(name: string, dayHint: number | null): SourceItem {
  return {
    id: name,
    type: "activity",
    name,
    detail: null,
    dayHint,
  }
}

const flat = groupItemsByDayHint([
  item("Costa Dulce", null),
  item("Cheles", null),
  item("Trujillo", null),
])
assert.equal(flat.length, 1)
assert.equal(flat[0]?.day, null)
assert.equal(flat[0]?.items.length, 3)

const routed = groupItemsByDayHint([
  item("Heligan", 1),
  item("Fowey", 2),
  item("Polperro", 2),
])
assert.equal(routed.length, 2)
assert.equal(routed[0]?.day, 1)
assert.equal(routed[1]?.day, 2)
assert.equal(routed[1]?.items.length, 2)

assert.deepEqual(groupItemsByDayHint([]), [])

console.log("source-item-groups: ok")
