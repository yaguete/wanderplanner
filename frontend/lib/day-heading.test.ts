import assert from "node:assert/strict"
import {
  dayHasSourceItem,
  firstDayIdWithoutSourceItem,
  formatDayFilterOption,
  formatDayPickerHint,
  formatDayPickerLabel,
  getDayUserDescription,
} from "./day-heading"

assert.equal(getDayUserDescription("Día 1 — Llegada"), "Llegada")
assert.equal(getDayUserDescription("Llegada"), "Llegada")

assert.equal(
  formatDayFilterOption(0, "Vuelo a Edimburgo", "lun 28 dic"),
  "Lun 28 dic · Vuelo a Edimburgo",
)
assert.equal(
  formatDayFilterOption(1, "Edimburgo medieval y navideño", "mar 29 dic"),
  "Mar 29 dic · Edimburgo medieval y navideño",
)
assert.equal(formatDayFilterOption(2, "", "mier 30 dic"), "Mier 30 dic")
assert.equal(formatDayFilterOption(0, "Llegada", null), "Llegada")
assert.equal(formatDayFilterOption(3, "  ", null), "Día 4")
assert.equal(formatDayFilterOption(0, "Día 1 — Llegada", "lun 14 sept"), "Lun 14 sept · Llegada")

assert.equal(formatDayPickerLabel(0, "29 ago"), "Día 1 (29 ago)")
assert.equal(formatDayPickerLabel(2, null), "Día 3")
assert.equal(formatDayPickerLabel(0, "15 ago"), "Día 1 (15 ago)")

assert.equal(formatDayPickerHint({ description: "Homer y Ninilchik", itemCount: 3 }), "Homer y Ninilchik")
assert.equal(formatDayPickerHint({ description: "  ", itemCount: 0 }), "Sin planes todavía")
assert.equal(formatDayPickerHint({ description: "", itemCount: 1 }), "1 ítem")
assert.equal(formatDayPickerHint({ description: "", itemCount: 6 }), "6 ítems")

const d1 = { id: "d1", items: [{ sourceItemId: "hotel" }] }
const d2 = { id: "d2", items: [{ sourceItemId: "otro" }] }
const d3 = { id: "d3", items: [] }
assert.equal(dayHasSourceItem(d1, "hotel"), true)
assert.equal(dayHasSourceItem(d2, "hotel"), false)
assert.equal(firstDayIdWithoutSourceItem([d1, d2, d3], "hotel"), "d2")
assert.equal(firstDayIdWithoutSourceItem([d1, d2, d3], "otro"), "d1")
assert.equal(firstDayIdWithoutSourceItem([d1], "hotel"), null)
assert.equal(firstDayIdWithoutSourceItem([], "hotel"), null)
assert.equal(firstDayIdWithoutSourceItem([d3], null), "d3")

console.log("day-heading: ok")
