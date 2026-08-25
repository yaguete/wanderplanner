import assert from "node:assert/strict"
import {
  applySourceRouteImport,
  isSourceDayCompleteOnTrip,
  planSourceRouteImport,
  sourceItemDayIndex,
  sourceRouteItems,
} from "./source-route-import"
import type { Source, SourceItem, UserDay, UserDayItem } from "@/types/itinerary"

function src(
  id: string,
  dayHint: number | null,
  name = id,
  type: SourceItem["type"] = "activity",
): SourceItem {
  return { id, type, name, detail: null, dayHint }
}

function day(id: string, items: UserDayItem[] = []): UserDay {
  return { id, label: "", items }
}

function userItem(item: SourceItem): UserDayItem {
  return {
    id: `u-${item.id}`,
    sourceItemId: item.id,
    sourceId: "src-1",
    type: item.type,
    name: item.name,
    detail: item.detail,
    sourceAuthor: "Guía",
  }
}

function emptyDay(): UserDay {
  return day(`new-${emptyDay.n++}`)
}
emptyDay.n = 1

function resetEmpty() {
  emptyDay.n = 1
}

function apply(
  days: UserDay[],
  items: SourceItem[],
  maxDays?: number,
) {
  return applySourceRouteImport(days, items, userItem, {
    makeEmptyDay: emptyDay,
    maxDays,
  })
}

assert.equal(sourceItemDayIndex({ dayHint: 1 }), 0)
assert.equal(sourceItemDayIndex({ dayHint: 3 }), 2)
assert.equal(sourceItemDayIndex({ dayHint: null }), 0)
assert.equal(sourceItemDayIndex({ dayHint: 0 }), 0)
assert.equal(sourceItemDayIndex({ dayHint: -2 }), 0)

{
  const source = {
    items: [src("walk", 1), src("bus", 1, "Bus", "transport"), src("lunch", 2, "Comida", "food")],
  } as Pick<Source, "items">
  assert.deepEqual(
    sourceRouteItems(source).map((i) => i.id),
    ["walk", "lunch"],
  )
}

{
  resetEmpty()
  const other: UserDayItem = {
    id: "keep",
    sourceItemId: "other-1",
    sourceId: "src-other",
    type: "stay",
    name: "Hotel ajeno",
    detail: null,
    sourceAuthor: "Otra",
  }
  const assistant: UserDayItem = {
    id: "asst",
    sourceItemId: "assistant-1",
    sourceId: "assistant",
    type: "activity",
    name: "Paseo",
    detail: null,
    sourceAuthor: "Asistente",
  }
  const existing = [
    day("d1", [other]),
    day("d2", [assistant]),
    day("d3"),
    day("d4"),
    day("d5"),
    day("d6"),
    day("d7"),
    day("d8"),
    day("d9"),
    day("d10"),
  ]
  const result = apply(existing, [
    src("a", 1, "Mirador"),
    src("b", 2, "Mercado"),
    src("c", 3, "Playa"),
  ])
  assert.equal(result.days.length, 10)
  assert.equal(result.daysCreated, 0)
  assert.equal(result.addedCount, 3)
  assert.equal(result.days[0]?.items[0]?.id, "keep")
  assert.equal(result.days[0]?.items[1]?.sourceItemId, "a")
  assert.equal(result.days[1]?.items[0]?.id, "asst")
  assert.equal(result.days[1]?.items[1]?.sourceItemId, "b")
  assert.equal(result.days[2]?.items[0]?.sourceItemId, "c")
  assert.equal(result.days[9]?.id, "d10")
}

{
  resetEmpty()
  const result = apply(
    [day("d1"), day("d2")],
    [src("a", 1), src("b", 2), src("c", 3), src("d", 5)],
  )
  assert.equal(result.days.length, 5)
  assert.equal(result.daysCreated, 3)
  assert.equal(result.days[0]?.id, "d1")
  assert.equal(result.days[1]?.id, "d2")
  assert.equal(result.days[2]?.id, "new-1")
  assert.equal(result.days[2]?.items.length, 1)
  assert.equal(result.days[3]?.items.length, 0)
  assert.equal(result.days[4]?.items[0]?.sourceItemId, "d")
}

{
  resetEmpty()
  const already: UserDayItem = {
    id: "u-a",
    sourceItemId: "a",
    sourceId: "src-1",
    type: "activity",
    name: "Mirador",
    detail: null,
    sourceAuthor: "Guía",
  }
  const result = apply(
    [day("d1", [already]), day("d2")],
    [src("a", 1), src("b", 2), src("c", 2)],
  )
  assert.equal(result.addedCount, 2)
  assert.equal(result.skippedExisting, 1)
  assert.equal(result.daysCreated, 0)
  assert.equal(result.days[0]?.items.length, 1)
  assert.equal(result.days[0]?.items[0]?.id, "u-a")
  assert.deepEqual(
    result.days[1]?.items.map((i) => i.sourceItemId),
    ["b", "c"],
  )
}

{
  resetEmpty()
  const onDayTwo: UserDayItem = {
    id: "moved",
    sourceItemId: "a",
    sourceId: "src-1",
    type: "activity",
    name: "Mirador",
    detail: null,
    sourceAuthor: "Guía",
  }
  const result = apply([day("d1"), day("d2", [onDayTwo])], [src("a", 1)])
  assert.equal(result.addedCount, 0)
  assert.equal(result.skippedExisting, 1)
  assert.equal(result.days[0]?.items.length, 0)
  assert.equal(result.days[1]?.items[0]?.id, "moved")
}

{
  resetEmpty()
  const result = apply([day("d1"), day("d2")], [src("x", null), src("y", null)])
  assert.equal(result.days.length, 2)
  assert.equal(result.daysCreated, 0)
  assert.deepEqual(
    result.days[0]?.items.map((i) => i.sourceItemId),
    ["x", "y"],
  )
  assert.equal(result.days[1]?.items.length, 0)
}

{
  resetEmpty()
  const result = apply([day("d1")], [src("a", 1), src("a", 1), src("b", 1)])
  assert.equal(result.addedCount, 2)
  assert.deepEqual(
    result.days[0]?.items.map((i) => i.sourceItemId),
    ["a", "b"],
  )
}

{
  resetEmpty()
  const already: UserDayItem = {
    id: "u-a",
    sourceItemId: "a",
    sourceId: "src-1",
    type: "activity",
    name: "Mirador",
    detail: null,
    sourceAuthor: "Guía",
  }
  const existing = [day("d1", [already])]
  const result = apply(existing, [src("a", 1)])
  assert.equal(result.addedCount, 0)
  assert.equal(result.daysCreated, 0)
  assert.equal(result.days, existing)
}

{
  resetEmpty()
  const result = apply([day("d1")], [src("near", 60), src("far", 61)], 60)
  assert.equal(result.days.length, 60)
  assert.equal(result.addedCount, 1)
  assert.equal(result.skippedPastCap, 1)
  assert.equal(result.days[59]?.items[0]?.sourceItemId, "near")
}

{
  const plan = planSourceRouteImport(
    [day("d1"), day("d2")],
    [src("a", 1), src("b", 5)],
  )
  assert.equal(plan.daysToCreate, 3)
  assert.equal(plan.addedCount, 2)
}

{
  const already: UserDayItem = {
    id: "u-a",
    sourceItemId: "a",
    sourceId: "src-1",
    type: "activity",
    name: "Mirador",
    detail: null,
    sourceAuthor: "Guía",
  }
  assert.equal(isSourceDayCompleteOnTrip([], 1, [src("a", 1)]), false)
  assert.equal(
    isSourceDayCompleteOnTrip([day("d1", [already])], 1, [src("a", 1)]),
    true,
  )
  assert.equal(
    isSourceDayCompleteOnTrip([day("d1", [already]), day("d2")], 2, [src("b", 2)]),
    false,
  )
  assert.equal(
    isSourceDayCompleteOnTrip([day("d1"), day("d2", [already])], 1, [src("a", 1)]),
    false,
  )
  assert.equal(
    isSourceDayCompleteOnTrip([day("d1", [already])], null, [src("a", null)]),
    true,
  )
  assert.equal(isSourceDayCompleteOnTrip([day("d1")], 1, []), true)
}

console.log("source-route-import: ok")
