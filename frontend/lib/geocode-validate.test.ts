import assert from "node:assert/strict"
import { haversineMeters } from "./map-route-geometry"
import {
  candidateNameMatchesQuery,
  candidatePassesAnchor,
  featureTypeFromMapboxId,
  isWeakRegionHint,
  mapsPinPassesAnchor,
  maxDistanceMetersForAnchorType,
  offsetStackedApproximate,
  pickFirstValidCandidate,
  pickGeocodeOutcome,
  regionAnchorQueryLadder,
  sharesSignificantToken,
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

// Primer válido: el POI gana a la address (especificidad).
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
  "unlocated",
)
assert.equal(
  pickGeocodeOutcome(
    [{ coord: { lng: 1, lat: 2 }, featureType: "place", text: "Foo" }],
    null,
  ).precision,
  "unlocated",
)

// Un `place` dentro del radio es el centro de la ciudad, no el sitio: approximate.
const innsbruckPlace = pickGeocodeOutcome(
  [{ coord: innsbruck.coord, featureType: "place", text: "Innsbruck" }],
  innsbruck,
)
assert.equal(innsbruckPlace.precision, "approximate")
if (innsbruckPlace.precision === "approximate") {
  assert.equal(innsbruckPlace.anchorLabel, "Innsbruck")
  assert.equal(innsbruckPlace.coord.lng, innsbruck.coord.lng)
}

const igls = pickGeocodeOutcome(
  [{ coord: { lng: 11.41, lat: 47.23 }, featureType: "locality", text: "Igls" }],
  innsbruck,
)
assert.equal(igls.precision, "approximate")
if (igls.precision === "approximate") {
  assert.equal(igls.anchorLabel, "Igls")
  assert.equal(igls.coord.lat, 47.23)
}

const amras = pickGeocodeOutcome(
  [{ coord: { lng: 11.43, lat: 47.255 }, featureType: "locality", text: "Amras" }],
  innsbruck,
)
assert.equal(amras.precision, "approximate")
if (amras.precision === "approximate") {
  assert.equal(amras.anchorLabel, "Amras")
}

// poi gana a place aunque Mapbox devuelva el place primero.
const innsbruckAsPlace = {
  coord: innsbruck.coord,
  featureType: "place",
  text: "Innsbruck",
}
const goldenesDachl = {
  coord: { lng: 11.393, lat: 47.268 },
  featureType: "poi",
  text: "Goldenes Dachl",
}
assert.equal(pickFirstValidCandidate([innsbruckAsPlace, goldenesDachl], innsbruck), goldenesDachl)
assert.equal(pickGeocodeOutcome([innsbruckAsPlace, goldenesDachl], innsbruck).precision, "exact")

// address cuyo nombre coincide con la query sigue siendo exacto.
const alfacarNamed = { ...alfacar, text: "Alfacar", placeName: "Alfacar, Granada" }
assert.equal(pickGeocodeOutcome([alfacarNamed], granada, "Alfacar").precision, "exact")
assert.equal(candidateNameMatchesQuery(alfacarNamed, "Alfacar"), true)

// Caso Málaga: ancla locality «Centro» + address «Calle Cuenca» no es el Gallo.
const malagaCentro: RegionAnchor = {
  coord: { lng: -4.417962, lat: 36.72497 },
  featureType: "locality",
  label: "Centro, Málaga",
}
const calleCuenca = {
  coord: { lng: -4.420937, lat: 36.750699 },
  featureType: "address",
  text: "Calle Cuenca",
  placeName: "Calle Cuenca, 29014 Málaga, provincia de Málaga, España",
}
const galloMalaga = pickGeocodeOutcome(
  [calleCuenca],
  malagaCentro,
  "El Gallo Gastrobar",
)
assert.equal(galloMalaga.precision, "approximate")
if (galloMalaga.precision === "approximate") {
  assert.equal(galloMalaga.coord.lng, malagaCentro.coord.lng)
  assert.equal(galloMalaga.anchorLabel, "Centro, Málaga")
}
assert.equal(candidateNameMatchesQuery(calleCuenca, "El Gallo Gastrobar"), false)
assert.equal(
  candidateNameMatchesQuery(
    { coord: { lng: 0, lat: 0 }, featureType: "address", text: "Calle Casas Colgadas" },
    "Casas Colgadas",
  ),
  true,
)

// Ancla: «Cuenca, Zona Centro» no comparte token significativo con «Centro, Málaga».
assert.equal(sharesSignificantToken("Cuenca, Zona Centro", "Centro, Málaga"), false)
assert.equal(sharesSignificantToken("Cuenca", "Cuenca, provincia de Cuenca"), true)
assert.equal(isWeakRegionHint("Zona Centro"), true)
assert.equal(isWeakRegionHint("Casco Antiguo"), true)
assert.equal(isWeakRegionHint("Cuenca, Zona Centro"), false)
assert.deepEqual(regionAnchorQueryLadder("Cuenca, Zona Centro"), [
  "Cuenca, Zona Centro",
  "Cuenca",
])
assert.deepEqual(regionAnchorQueryLadder("Zona Centro"), [])
assert.deepEqual(regionAnchorQueryLadder("Cuenca"), ["Cuenca"])

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
const center = { lng: 11.404, lat: 47.27 }
const distA = haversineMeters(center, da)
assert.ok(distA > 50 && distA < 70, `n=2 radio ~60 m, got ${distA}`)

const five = offsetStackedApproximate(
  Array.from({ length: 5 }, (_, i) => ({
    id: `p${i}`,
    coord: center,
    precision: "approximate" as const,
  })),
)
assert.equal(five.size, 5)
const distFive = haversineMeters(center, five.get("p0")!)
assert.ok(distFive > 140 && distFive < 160, `n=5 radio ~150 m, got ${distFive}`)

const singles = offsetStackedApproximate([
  { id: "solo", coord: { lng: 1, lat: 2 }, precision: "approximate" },
])
assert.equal(singles.size, 0)

const austria: RegionAnchor = {
  coord: { lng: 14.55, lat: 47.52 },
  featureType: "country",
  label: "Austria",
}
const pasterze = { lng: 12.7128768, lat: 47.0893217 }
const bali = { lng: 115.1889, lat: -8.4095 }
assert.equal(mapsPinPassesAnchor(pasterze, austria), true)
assert.equal(mapsPinPassesAnchor(bali, austria), false)
assert.equal(candidatePassesAnchor({ coord: pasterze, featureType: "poi" }, austria), false)
assert.equal(mapsPinPassesAnchor(pasterze, granada), false)

const alaska: RegionAnchor = {
  coord: { lng: -152.4, lat: 64.2 },
  featureType: "region",
  label: "Alaska",
}
const sewardExit = { lng: -149.631, lat: 60.172 }
const fairbanks = { lng: -147.716, lat: 64.838 }
assert.equal(mapsPinPassesAnchor(sewardExit, alaska), true)
assert.equal(mapsPinPassesAnchor(fairbanks, alaska), true)
assert.equal(mapsPinPassesAnchor(bali, alaska), false)
assert.equal(candidatePassesAnchor({ coord: sewardExit, featureType: "poi" }, alaska), false)

console.log("geocode-validate: ok")
