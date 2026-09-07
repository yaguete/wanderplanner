import assert from "node:assert/strict"
import {
  bboxForAnchor,
  bboxFromCenterAndRadius,
  coordInAnchorZone,
  createSessionToken,
  emptyScopeMessage,
  nameSuggestDedupeKey,
  newPlaceSearchSession,
  parseBbox,
  postalAddressFromSuggestion,
  recordSessionSuggest,
  SESSION_IDLE_MS,
  SESSION_MAX_SUGGESTS,
  sessionNeedsRotation,
  shouldFallbackToGeocodingV5,
  suggestionAllowedForPurpose,
  typesForPurpose,
  type PlaceSearchAnchor,
  anchorFromRoutePlace,
} from "./place-search-purpose"

const madrid: PlaceSearchAnchor = {
  id: "city.madrid",
  label: "Madrid",
  featureType: "place",
  coords: { lng: -3.7038, lat: 40.4168 },
  countryCode: "ES",
  bbox: [-3.89, 40.31, -3.52, 40.56],
}

assert.equal(typesForPurpose("city", "searchbox"), "place,region,district")
assert.equal(typesForPurpose("city", "geocoding-v5"), "place,region,district")
assert.equal(typesForPurpose("poi", "searchbox"), "poi")
assert.equal(typesForPurpose("poi", "geocoding-v5"), null)
assert.equal(typesForPurpose("address", "searchbox"), "poi,address,street")
assert.equal(typesForPurpose("address", "geocoding-v5"), "address")
assert.equal(shouldFallbackToGeocodingV5("poi"), false)
assert.equal(shouldFallbackToGeocodingV5("city"), true)
assert.equal(shouldFallbackToGeocodingV5("address"), true)

assert.equal(suggestionAllowedForPurpose("place", "city"), true)
assert.equal(suggestionAllowedForPurpose("region", "city"), true)
assert.equal(suggestionAllowedForPurpose("district", "city"), true)
assert.equal(suggestionAllowedForPurpose("locality", "city"), false)
assert.equal(suggestionAllowedForPurpose("country", "city"), false)
assert.equal(suggestionAllowedForPurpose("poi", "city"), false)
assert.equal(suggestionAllowedForPurpose("poi", "address"), true)
assert.equal(suggestionAllowedForPurpose("address", "address"), true)
assert.equal(suggestionAllowedForPurpose("place", "address"), false)
assert.equal(suggestionAllowedForPurpose("poi", "poi"), true)
assert.equal(suggestionAllowedForPurpose("address", "poi"), false)
assert.equal(suggestionAllowedForPurpose("poi", "site"), true)
assert.equal(suggestionAllowedForPurpose("place", "site"), true)

assert.deepEqual(parseBbox([-3.89, 40.31, -3.52, 40.56]), [-3.89, 40.31, -3.52, 40.56])
assert.equal(parseBbox([-3.89, 40.56, -3.52, 40.31]), null, "south > north")
assert.equal(parseBbox([170, -10, -170, 10]), null, "antimeridiano west > east")
assert.equal(parseBbox([-200, 0, 10, 10]), null)
assert.equal(parseBbox("nope"), null)
assert.equal(parseBbox([1, 2, 3]), null)

{
  const fromRetrieve = bboxForAnchor(madrid)
  assert.deepEqual(fromRetrieve, madrid.bbox)
}

{
  const noBbox: PlaceSearchAnchor = { ...madrid, bbox: null }
  const derived = bboxForAnchor(noBbox)
  assert.ok(derived)
  assert.ok(derived[0] < madrid.coords.lng)
  assert.ok(derived[2] > madrid.coords.lng)
  const widthKm = ((derived[2] - derived[0]) * 111 * Math.cos((40.4168 * Math.PI) / 180))
  assert.ok(widthKm > 40 && widthKm < 70, `radio de place ~25 km, ancho=${widthKm}`)
}

{
  const region: PlaceSearchAnchor = {
    id: "region.alpujarra",
    label: "La Alpujarra",
    featureType: "region",
    coords: { lng: -3.3, lat: 36.95 },
    countryCode: "ES",
    bbox: null,
  }
  const derived = bboxForAnchor(region)
  assert.ok(derived)
  const widthKm = (derived[2] - derived[0]) * 111 * Math.cos((36.95 * Math.PI) / 180)
  assert.ok(widthKm > 200, "región usa radio 150 km, no 25")
}

{
  const country: PlaceSearchAnchor = {
    id: "country.es",
    label: "España",
    featureType: "country",
    coords: { lng: -3.7, lat: 40.4 },
    countryCode: "ES",
    bbox: null,
  }
  assert.equal(bboxForAnchor(country), null)
  assert.equal(coordInAnchorZone({ lng: -0.38, lat: 39.47 }, country), true)
}

assert.equal(coordInAnchorZone({ lng: -3.7, lat: 40.42 }, madrid), true)
assert.equal(
  coordInAnchorZone({ lng: 2.17, lat: 41.39 }, madrid),
  false,
  "Barcelona fuera del bbox de Madrid",
)

{
  const farButInBbox: PlaceSearchAnchor = {
    ...madrid,
    bbox: [-4.5, 39.5, -2.5, 41.2],
  }
  const candidate = { lng: -3.2, lat: 40.9 }
  assert.equal(coordInAnchorZone(candidate, farButInBbox), true)
  const distKm =
    Math.hypot(candidate.lng - madrid.coords.lng, candidate.lat - madrid.coords.lat) * 111
  assert.ok(distKm > 25, "bbox válido no se recorta a 25 km")
}

{
  const around = bboxFromCenterAndRadius({ lng: 179.5, lat: 0 }, 80_000)
  assert.ok(around)
  assert.ok(around[2] <= 180)
}

assert.equal(
  postalAddressFromSuggestion({
    text: "The Witchery",
    placeName: "Castlehill, Edimburgo, EH1 2ND, Reino Unido",
    featureType: "poi",
    cityLabel: "Edimburgo",
  }),
  "Castlehill, EH1 2ND, Reino Unido",
)
assert.equal(
  postalAddressFromSuggestion({
    text: "Casa Paco",
    placeName: "Madrid",
    featureType: "poi",
    cityLabel: "Madrid",
  }),
  "",
  "sin calle no inventa ni copia el nombre",
)
assert.equal(
  postalAddressFromSuggestion({
    text: "Király Utca",
    placeName: "Budapest, Király Utca 15, 1075, Hungría",
    featureType: "address",
    cityLabel: "Budapest",
  }),
  "Király Utca",
)

{
  const a = nameSuggestDedupeKey({
    name: "  Casa Paco ",
    anchorId: "city.madrid",
    purpose: "poi",
    scope: "anchored",
  })
  const b = nameSuggestDedupeKey({
    name: "casa paco",
    anchorId: "city.madrid",
    purpose: "poi",
    scope: "anchored",
  })
  assert.equal(a, b)
  const otherCity = nameSuggestDedupeKey({
    name: "casa paco",
    anchorId: "city.guadalajara-mx",
    purpose: "poi",
    scope: "anchored",
  })
  assert.notEqual(a, otherCity)
}

{
  const s = newPlaceSearchSession(1_000)
  assert.equal(sessionNeedsRotation(s, 1_000), false)
  assert.equal(sessionNeedsRotation(s, 1_000 + SESSION_IDLE_MS), true)
  assert.equal(sessionNeedsRotation(null), true)
  let busy = s
  for (let i = 0; i < SESSION_MAX_SUGGESTS; i++) busy = recordSessionSuggest(busy, 1_000)
  assert.equal(sessionNeedsRotation(busy, 1_000), true)
  assert.ok(createSessionToken().length > 8)
}

assert.equal(emptyScopeMessage("Madrid"), "Sin resultados en la zona de Madrid")
assert.equal(emptyScopeMessage(null), "Sin resultados en esta zona.")

{
  const anchor = anchorFromRoutePlace(
    { label: "Edimburgo", coords: { lng: -3.19, lat: 55.95 } },
    "rental-pickup",
  )
  assert.equal(anchor.featureType, "place")
  assert.equal(anchor.label, "Edimburgo")
  assert.equal(anchor.countryCode, null)
  assert.ok(anchor.id.startsWith("rental-pickup:Edimburgo:"))
}

console.log("place-search-purpose: ok")
