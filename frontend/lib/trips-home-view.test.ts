import assert from "node:assert/strict"
import {
  initialTripsHomeSection,
  parseTripsHomeViewParam,
  tripsHomeSubtitle,
} from "./trips-home-view"

assert.equal(parseTripsHomeViewParam("fuentes"), "sources")
assert.equal(parseTripsHomeViewParam("sources"), "sources")
assert.equal(parseTripsHomeViewParam("viajes"), "trips")
assert.equal(parseTripsHomeViewParam("trips"), "trips")
assert.equal(parseTripsHomeViewParam("Fuentes"), "sources")
assert.equal(parseTripsHomeViewParam(""), null)
assert.equal(parseTripsHomeViewParam(null), null)
assert.equal(parseTripsHomeViewParam("nope"), null)

assert.equal(initialTripsHomeSection("fuentes"), "sources")
assert.equal(initialTripsHomeSection(null), "trips")

assert.equal(
  tripsHomeSubtitle("trips"),
  "Consolida fuentes en las que confías en una ruta editable.",
)
assert.equal(
  tripsHomeSubtitle("sources"),
  "El contenido más reciente de tus fuentes de inspiración",
)
assert.equal(
  tripsHomeSubtitle("sources", true),
  "Encuentra inspiración en estas referencias",
)
assert.equal(
  tripsHomeSubtitle("trips", true),
  "Consolida fuentes en las que confías en una ruta editable.",
)

console.log("trips-home-view: ok")
