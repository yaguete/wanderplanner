import assert from "node:assert/strict"
import {
  formatGeocodeSummary,
  summarizeGeocodeOutcomes,
  type GeocodeDiagnosticEntry,
} from "./geocode-diagnostics"

const empty = summarizeGeocodeOutcomes([])
assert.equal(empty.total, 0)
assert.equal(empty.geocoded, 0)
assert.equal(empty.rescuablePct, 0, "sin ítems no se divide entre cero")
assert.equal(empty.hasCountryAnchor, false)

const city = { label: "Edimburgo", featureType: "place" }

const entries: GeocodeDiagnosticEntry[] = [
  { name: "Hotel ya resuelto", reason: "saved-coords", precision: "exact" },
  {
    name: "Castillo de Edimburgo",
    reason: "local-hit",
    precision: "exact",
    featureType: "poi",
    anchor: city,
  },
  {
    name: "Old Town",
    reason: "local-hit",
    precision: "approximate",
    featureType: "neighborhood",
    label: "Old Town",
    anchor: city,
  },
  {
    name: "Mercado Central",
    reason: "anchor-fallback",
    precision: "approximate",
    label: "Edimburgo",
    anchor: city,
  },
  {
    name: "Café Central",
    reason: "anchor-fallback",
    precision: "approximate",
    label: "Edimburgo",
    anchor: city,
  },
  {
    name: "Gernika",
    reason: "far-name-match",
    precision: "exact",
    featureType: "poi",
    anchor: city,
  },
  { name: "Sitio sin ciudad", reason: "no-anchor", precision: "unlocated" },
]

const s = summarizeGeocodeOutcomes(entries)
assert.equal(s.total, 7)
assert.equal(s.saved, 1)
assert.equal(s.geocoded, 6, "los que traían coords no cuentan como geocodificados")
assert.equal(s.exact, 2)
assert.equal(s.approximate, 3)
assert.equal(s.unlocated, 1)
assert.equal(s.byReason["local-hit"], 2)
assert.equal(s.byReason["anchor-fallback"], 2)
assert.equal(s.byReason["saved-coords"], 1)

// La cota superior del bbox son los que cayeron al centro del ancla, no todos
// los aproximados: un `local-hit` administrativo es un hit real de la zona.
assert.equal(s.rescuableByBbox, 2)
assert.equal(s.rescuablePct, 33.3)
assert.deepEqual(s.rescuableNames, ["Mercado Central", "Café Central"])

assert.deepEqual(s.anchors, [{ key: "Edimburgo (place)", count: 5 }])
assert.deepEqual(
  s.regionHints,
  [{ key: "(sin región)", count: 6 }],
  "los ítems sin región se agrupan para ver de dónde sale el ancla",
)
assert.equal(s.hasCountryAnchor, false)
assert.deepEqual(s.approximateByType, [
  { key: "sin candidato", count: 2 },
  { key: "neighborhood", count: 1 },
])
assert.equal(s.approximateDetail.length, 3)
assert.equal(s.farNameMatches.length, 1)
assert.equal(s.farNameMatches[0]!.name, "Gernika")

// Un ancla de país desactiva el filtro de distancia: `anchor-fallback` es
// imposible y el 0 de rescatables no dice nada. El resumen tiene que avisar.
const countryAnchored = summarizeGeocodeOutcomes([
  {
    name: "Lago de Atitlán",
    reason: "local-hit",
    precision: "approximate",
    featureType: "place",
    label: "Panajachel",
    anchor: { label: "Guatemala", featureType: "country" },
    regionHint: "Sololá",
  },
])
assert.equal(countryAnchored.hasCountryAnchor, true)
assert.deepEqual(countryAnchored.regionHints, [{ key: "Sololá", count: 1 }])
assert.match(formatGeocodeSummary(countryAnchored), /Región de los ítems: Sololá ×1/)
assert.equal(countryAnchored.rescuableByBbox, 0)
assert.match(formatGeocodeSummary(countryAnchored), /Ancla de país/)
assert.match(formatGeocodeSummary(countryAnchored), /Panajachel/)

const onlySaved = summarizeGeocodeOutcomes([
  { name: "A", reason: "saved-coords", precision: "exact" },
  { name: "B", reason: "saved-coords", precision: "exact" },
])
assert.equal(onlySaved.geocoded, 0)
assert.equal(onlySaved.rescuablePct, 0, "todo guardado: nada que rescatar")
assert.equal(onlySaved.anchors.length, 0)

const text = formatGeocodeSummary(s)
assert.match(text, /7 ítems/)
assert.match(text, /33\.3% de los geocodificados/)
assert.match(text, /Mercado Central · Café Central/)
assert.match(text, /Anclas: Edimburgo \(place\) ×5/)
assert.match(text, /Rescatados fuera del radio/)
assert.ok(
  !text.includes("Ancla de país"),
  "sin ancla de país no se avisa",
)
assert.ok(
  !formatGeocodeSummary(empty).includes("exactos"),
  "sin ítems geocodificados no se imprime el desglose de precisión",
)

console.log("geocode-diagnostics OK")
