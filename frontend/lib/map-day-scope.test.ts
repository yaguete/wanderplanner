import assert from "node:assert/strict"
import {
  dayScopeFromId,
  daysForScope,
  filterByDayScope,
  inDayScope,
  mappableCountsByDay,
} from "./map-day-scope"

const days = [{ id: "a" }, { id: "b" }, { id: "c" }]

assert.equal(dayScopeFromId([], null), null)
assert.equal(dayScopeFromId(days, null), null)
assert.equal(dayScopeFromId(days, "missing"), null)
assert.equal(dayScopeFromId(days, "a"), 1)
assert.equal(dayScopeFromId(days, "c"), 3)

assert.equal(inDayScope(null, 5), true)
assert.equal(inDayScope(5, 5), true)
assert.equal(inDayScope(5, 4), false)

const items = [
  { id: "x", dayNumber: 1 },
  { id: "y", dayNumber: 5 },
  { id: "z", dayNumber: 5 },
]
const same = filterByDayScope(items, null)
assert.equal(same, items)

const day5 = filterByDayScope(items, 5)
assert.deepEqual(
  day5.map((i) => i.dayNumber),
  [5, 5],
)
assert.equal(day5[0]!.id, "y")

const nested = filterByDayScope(
  [{ point: { dayNumber: 2 } }, { point: { dayNumber: 3 } }],
  3,
  (r) => r.point.dayNumber,
)
assert.equal(nested.length, 1)
assert.equal(nested[0]!.point.dayNumber, 3)

assert.equal(daysForScope(days, null), days)
assert.deepEqual(daysForScope(days, 5), [])
const sliced = daysForScope(days, 2)
assert.equal(sliced.length, 1)
assert.equal(sliced[0], days[1])

const counts = mappableCountsByDay(items)
assert.equal(counts.get(1), 1)
assert.equal(counts.get(5), 2)
assert.equal(counts.get(2), undefined)
assert.equal(counts.get(2) ?? 0, 0)

console.log("map-day-scope: ok")
