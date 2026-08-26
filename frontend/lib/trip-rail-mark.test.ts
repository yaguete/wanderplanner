import assert from "node:assert/strict"
import {
  isTripRailFlagCode,
  tripRailFlagCode,
  tripRailFlagSrc,
  tripRailLetter,
} from "./trip-rail-mark"

{
  assert.equal(tripRailFlagCode({ name: "Nepal" }), "np")
  assert.equal(tripRailFlagCode({ name: "Alaska" }), "us")
  assert.equal(tripRailFlagCode({ name: "Granada — 1 días" }), "es")
  assert.equal(tripRailFlagCode({ name: "Escocia en Navidades" }), "gb-sct")
}

{
  assert.equal(tripRailFlagCode({ name: "Vacaciones", area: "Kathmandu, Nepal" }), "np")
  assert.equal(tripRailFlagCode({ name: "Guía de la Alhambra" }), "es")
  assert.equal(tripRailFlagCode({ name: "Japón" }), "jp")
  assert.equal(tripRailFlagCode({ name: "Tailandia" }), "th")
}

{
  assert.equal(tripRailFlagCode({ name: "Roadtrip", countries: ["NP"] }), "np")
  assert.equal(tripRailFlagCode({ name: "Roadtrip", countries: ["jp"] }), "jp")
  assert.equal(tripRailFlagCode({ name: "Escocia", countries: ["GB"] }), "gb-sct")
}

{
  assert.equal(tripRailFlagCode({ name: "Roadtrip con Marta" }), null)
  assert.equal(tripRailFlagCode({ name: "Navidad en casa" }), null)
}

{
  assert.equal(tripRailFlagSrc("NP"), "/circle-flags/np.svg")
  assert.equal(tripRailFlagSrc("gb-sct"), "/circle-flags/gb-sct.svg")
  assert.equal(tripRailFlagSrc("../etc/passwd"), null)
  assert.equal(isTripRailFlagCode("gb-sct"), true)
  assert.equal(isTripRailFlagCode("np"), true)
  assert.equal(isTripRailFlagCode("GB-SCT"), false)
}

{
  assert.equal(tripRailLetter("Nepal"), "N")
  assert.equal(tripRailLetter("  ártica"), "A")
  assert.equal(tripRailLetter(""), "?")
}
