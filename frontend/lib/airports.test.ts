import assert from "node:assert/strict"
import { resolveAirportCode } from "./airports"
import type { RoutePlace, RoutePlaceKind } from "@/types/itinerary"

function place(
  label: string,
  lng: number,
  lat: number,
  kind: RoutePlaceKind = "city",
): RoutePlace {
  return { label, coords: { lng, lat }, kind }
}

// BCN por coordenadas de ciudad; océano → null.
assert.equal(resolveAirportCode(place("Barcelona", 2.173, 41.385)), "BCN")
assert.equal(resolveAirportCode(place("Mar", -40, 0)), null)

// Entre MAD y BCN gana el más cercano.
assert.equal(resolveAirportCode(place("Madrid", -3.703, 40.417)), "MAD")

// Radio: kind airport a ~40 km de BCN no resuelve; city sí.
const fortyKmEastOfBcn = place("Cerca", 2.56, 41.3, "airport")
assert.equal(resolveAirportCode(fortyKmEastOfBcn), null)
assert.equal(resolveAirportCode({ ...fortyKmEastOfBcn, kind: "city" }), "BCN")

// (BCN) en el label manda si está cerca; (XYZ) inexistente no rompe;
// (BCN) con coords en Tokio no se usa.
assert.equal(
  resolveAirportCode(place("Aeropuerto de El Prat (BCN)", 2.08, 41.3, "airport")),
  "BCN",
)
assert.equal(
  resolveAirportCode(place("Estación (XYZ)", 2.173, 41.385)),
  "BCN",
)
assert.notEqual(
  resolveAirportCode(place("El Prat (BCN)", 139.692, 35.69)),
  "BCN",
)

// Metro: Londres → LON (no LCY); París → PAR (no LBG); Milán → MIL.
assert.equal(resolveAirportCode(place("London", -0.128, 51.507)), "LON")
assert.equal(resolveAirportCode(place("Paris", 2.352, 48.857)), "PAR")
assert.equal(resolveAirportCode(place("Milano", 9.19, 45.464)), "MIL")

// No-metro: Granada → GRX; Santander → SDR.
assert.equal(resolveAirportCode(place("Granada", -3.598, 37.177)), "GRX")
assert.equal(resolveAirportCode(place("Santander", -3.81, 43.462)), "SDR")

// kind address dentro de un área metro = código de área, igual que city.
assert.equal(
  resolveAirportCode(place("10 Downing Street", -0.128, 51.503, "address")),
  "LON",
)

// Hub elegido gana al área: Heathrow → LHR, no LON.
assert.equal(
  resolveAirportCode(place("Heathrow", -0.454, 51.47, "airport")),
  "LHR",
)

console.log("airports.test.ts: ok")
