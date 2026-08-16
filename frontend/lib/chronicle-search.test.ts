import assert from "node:assert/strict"
import { chronicleSearchNeedles, stripLeadingTypePrefix } from "./chronicle-search"

assert.equal(stripLeadingTypePrefix("Lago Hallstätter See"), "Hallstätter See")
assert.equal(stripLeadingTypePrefix("el Lago Hallstätter See"), "Hallstätter See")
assert.equal(stripLeadingTypePrefix("Hotel Gruberhof"), "Gruberhof")
assert.equal(stripLeadingTypePrefix("Restaurante Figlmüller"), "Figlmüller")
assert.equal(
  stripLeadingTypePrefix("Parque Nacional de Ordesa y Monte Perdido"),
  "Ordesa y Monte Perdido",
)

// Sin clasificador, o el resto sería un token corto (falsos positivos).
assert.equal(stripLeadingTypePrefix("Sagrada Familia"), null)
assert.equal(stripLeadingTypePrefix("Museo del Prado"), null)
assert.equal(stripLeadingTypePrefix("Lago"), null)
assert.equal(stripLeadingTypePrefix("Hotel Sol"), null)
assert.equal(stripLeadingTypePrefix(""), null)

// «Barceló» no debe confundirse con el prefijo «bar».
assert.equal(stripLeadingTypePrefix("Barceló Hotel"), null)

assert.deepEqual(chronicleSearchNeedles("Lago Hallstätter See"), [
  "Lago Hallstätter See",
  "Hallstätter See",
])
assert.deepEqual(chronicleSearchNeedles("Sagrada Familia"), ["Sagrada Familia"])
assert.deepEqual(chronicleSearchNeedles("  Lago   Hallstätter See  "), [
  "Lago Hallstätter See",
  "Hallstätter See",
])
assert.deepEqual(chronicleSearchNeedles("   "), [])

console.log("chronicle-search: ok")
