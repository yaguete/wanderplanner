import assert from "node:assert/strict"
import { dayItemsSignature, sanitizeDaySummaryClient } from "./day-summary"

assert.equal(dayItemsSignature([{ id: "a" }, { id: "b" }]), "a|b")
assert.notEqual(
  dayItemsSignature([{ id: "a" }, { id: "b" }]),
  dayItemsSignature([{ id: "b" }, { id: "a" }]),
)
assert.equal(dayItemsSignature([]), "")
assert.ok(!dayItemsSignature([{ id: "a" }, { id: "b" }]).includes("\0"))

assert.equal(sanitizeDaySummaryClient("  «Innsbruck y montañas».  "), "Innsbruck y montañas")
assert.equal(sanitizeDaySummaryClient("Día 1 · Llegada a Viena"), "Llegada a Viena")
assert.equal(
  sanitizeDaySummaryClient("uno dos tres cuatro cinco seis"),
  "uno dos tres cuatro",
)

console.log("day-summary: ok")
