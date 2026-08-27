import assert from "node:assert/strict"
import { formatDayPickerLabel, getDayUserDescription } from "./day-heading"

assert.equal(getDayUserDescription("Día 1 — Llegada"), "Llegada")
assert.equal(getDayUserDescription("Llegada"), "Llegada")

assert.equal(formatDayPickerLabel(0, "29 ago"), "Día 1 (29 ago)")
assert.equal(formatDayPickerLabel(2, null), "Día 3")
assert.equal(formatDayPickerLabel(0, "15 ago"), "Día 1 (15 ago)")

console.log("day-heading: ok")
