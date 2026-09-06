import assert from "node:assert/strict"
import type { GeocodeSuggestion } from "@/lib/mapbox"
import {
  decideOriginOnSubmit,
  exactTextSuggestionMatch,
} from "./trip-origin-resolve"

const sanFrancisco: GeocodeSuggestion = {
  id: "place.sf",
  provider: "searchbox",
  text: "San Francisco",
  placeName: "San Francisco, California, Estados Unidos",
  featureType: "place",
  center: { lng: -122.4194, lat: 37.7749 },
  countryCode: "US",
}

const barcelona: GeocodeSuggestion = {
  id: "place.bcn",
  provider: "searchbox",
  text: "Barcelona",
  placeName: "Barcelona, Cataluña, España",
  featureType: "place",
  center: { lng: 2.1734, lat: 41.3851 },
  countryCode: "ES",
}

// Prefijo de 3 letras NO es coincidencia exacta.
assert.equal(exactTextSuggestionMatch("San", [sanFrancisco]), null)
assert.equal(exactTextSuggestionMatch("Bar", [barcelona]), null)
assert.equal(exactTextSuggestionMatch("barcelona", [barcelona]), barcelona)
assert.equal(exactTextSuggestionMatch("  Barcelona  ", [barcelona]), barcelona)

// «San» + enviar → needs_confirm, nunca confirmed sin segundo toque.
{
  const decision = decideOriginOnSubmit({
    query: "San",
    selected: null,
    suggestions: [sanFrancisco],
    geocodeCoords: null,
  })
  assert.equal(decision.kind, "needs_confirm")
  if (decision.kind === "needs_confirm") {
    assert.equal(decision.origin.label, "San Francisco")
    assert.equal(decision.displayLabel, "San Francisco")
  }
}

// Igualdad exacta con text → confirmed (un solo toque).
{
  const decision = decideOriginOnSubmit({
    query: "Barcelona",
    selected: null,
    suggestions: [barcelona],
    geocodeCoords: null,
  })
  assert.equal(decision.kind, "confirmed")
  if (decision.kind === "confirmed") {
    assert.equal(decision.origin.label, "Barcelona")
    assert.equal(decision.origin.countryCode, "ES")
  }
}

// geocodeFreeText tampoco entra en silencio.
{
  const decision = decideOriginOnSubmit({
    query: "Toledo",
    selected: null,
    suggestions: [],
    geocodeCoords: { lng: -83.55, lat: 41.65 },
  })
  assert.equal(decision.kind, "needs_confirm")
  if (decision.kind === "needs_confirm") {
    assert.equal(decision.origin.label, "Toledo")
    assert.equal(decision.origin.countryCode, null)
  }
}

// Segundo toque: selected ya visible con el mismo label → confirmed.
{
  const decision = decideOriginOnSubmit({
    query: "San Francisco",
    selected: {
      label: "San Francisco",
      countryCode: "US",
      coords: sanFrancisco.center,
    },
    suggestions: [sanFrancisco],
    geocodeCoords: null,
  })
  assert.equal(decision.kind, "confirmed")
}

// Vacío / sin resolver.
assert.equal(
  decideOriginOnSubmit({
    query: "   ",
    selected: null,
    suggestions: [],
    geocodeCoords: null,
  }).kind,
  "empty",
)
assert.equal(
  decideOriginOnSubmit({
    query: "xyzzy",
    selected: null,
    suggestions: [],
    geocodeCoords: null,
  }).kind,
  "unresolved",
)

assert.equal(
  exactTextSuggestionMatch("Edimburgo", [{ text: "Edimburgo" }])?.text,
  "Edimburgo",
)

console.log("trip-origin-resolve: ok")
