import assert from "node:assert/strict"
import { parseTripsHomeViewParam } from "./trips-home-view"

assert.equal(parseTripsHomeViewParam("fuentes"), "sources")
assert.equal(parseTripsHomeViewParam("sources"), "sources")
assert.equal(parseTripsHomeViewParam("viajes"), "trips")
assert.equal(parseTripsHomeViewParam("trips"), "trips")
assert.equal(parseTripsHomeViewParam("Fuentes"), "sources")
assert.equal(parseTripsHomeViewParam(""), null)
assert.equal(parseTripsHomeViewParam(null), null)
assert.equal(parseTripsHomeViewParam("nope"), null)

console.log("trips-home-view: ok")
