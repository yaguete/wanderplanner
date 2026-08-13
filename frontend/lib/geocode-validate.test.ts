import assert from "node:assert/strict"
import {
  candidatePassesAnchor,
  featureTypeFromMapboxId,
  maxDistanceMetersForAnchorType,
  offsetStackedApproximate,
  pickFirstValidCandidate,
  pickGeocodeOutcome,
  type RegionAnchor,
} from "./geocode-validate"

assert.equal(featureTypeFromMapboxId("place.123"), "place")
assert.equal(featureTypeFromMapboxId("address.abc"), "address")
assert.equal(featureTypeFromMapboxId(""), "unknown")
assert.equal(featureTypeFromMapboxId(null), "unknown")

assert.equal(maxDistanceMetersForAnchorType("place"), 25_000)
assert.equal(maxDistanceMetersForAnchorType("locality"), 15_000)
assert.equal(maxDistanceMetersForAnchorType("district"), 60_000)
assert.equal(maxDistanceMetersForAnchorType("region"), 150_000)
assert.equal(maxDistanceMetersForAnchorType("country"), null)
assert.equal(maxDistanceMetersForAnchorType("unknown"), 25_000)

const granada: RegionAnchor = {
  coord: { lng: -3.598, lat: 37.177 },
  featureType: "place",
  label: "Granada",
}
const alfacar = { coord: { lng: -3.57, lat: 37.24 }, featureType: "address" }
const salzburg = { coord: { lng: 13.055, lat: 47.809 }, featureType: "address" }
const catedralGranada = {
  coord: { lng: -3.599, lat: 37.176 },
  featureType: "poi",
  placeName: "Catedral de Granada",
}

assert.equal(candidatePassesAnchor(alfacar, granada), true) // ~8 km
assert.equal(candidatePassesAnchor(salzburg, granada), false) // 135 km+
assert.equal(candidatePassesAnchor(catedralGranada, granada), true)

// Primer válido: saltar address si hay un POI dentro del radio.
const picked = pickFirstValidCandidate([alfacar, catedralGranada], granada)
assert.equal(picked, catedralGranada)

const innsbruck: RegionAnchor = {
  coord: { lng: 11.404, lat: 47.27 },
  featureType: "place",
  label: "Innsbruck",
}
const casaPepe = pickGeocodeOutcome(
  [{ coord: { lng: 13.04, lat: 47.8 }, featureType: "address" }],
  innsbruck,
)
assert.equal(casaPepe.precision, "approximate")
if (casaPepe.precision === "approximate") {
  assert.equal(casaPepe.anchorLabel, "Innsbruck")
  assert.equal(casaPepe.coord.lng, innsbruck.coord.lng)
}

const spain: RegionAnchor = {
  coord: { lng: -3.7, lat: 40.4 },
  featureType: "country",
  label: "Spain",
}
const murciaPoi = { coord: { lng: -1.13, lat: 37.98 }, featureType: "poi" }
assert.equal(candidatePassesAnchor(murciaPoi, spain), false)
const countryOutcome = pickGeocodeOutcome([murciaPoi], spain)
assert.equal(countryOutcome.precision, "approximate")

assert.equal(pickGeocodeOutcome([], null).precision, "unlocated")
assert.equal(
  pickGeocodeOutcome([{ coord: { lng: 1, lat: 2 }, featureType: "poi" }], null).precision,
  "exact",
)

const stacked = offsetStackedApproximate([
  { id: "a", coord: { lng: 11.404, lat: 47.27 }, precision: "approximate" },
  { id: "b", coord: { lng: 11.404, lat: 47.27 }, precision: "approximate" },
  { id: "c", coord: { lng: 0, lat: 0 }, precision: "exact" },
])
assert.equal(stacked.size, 2)
assert.ok(stacked.get("a"))
assert.ok(stacked.get("b"))
assert.equal(stacked.has("c"), false)
const da = stacked.get("a")!
const db = stacked.get("b")!
assert.ok(da.lng !== 11.404 || da.lat !== 47.27)
assert.ok(db.lng !== 11.404 || db.lat !== 47.27)
assert.notEqual(`${da.lng},${da.lat}`, `${db.lng},${db.lat}`)

const singles = offsetStackedApproximate([
  { id: "solo", coord: { lng: 1, lat: 2 }, precision: "approximate" },
])
assert.equal(singles.size, 0)

console.log("geocode-validate: ok")
