import assert from "node:assert/strict"
import type { Source, Trip } from "@/types/itinerary"
import {
  isIndependentRegionHint,
  mapCountryCodes,
  mapDestinationHint,
} from "./map-destination"

function baseTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-map",
    name: "Navidades en Cuenca 2026",
    countries: [],
    startDate: null,
    endDate: null,
    numDays: 6,
    expectations: null,
    cover: "✈️",
    coverUrl: null,
    sourceIds: [],
    days: [{ id: "d1", label: "", items: [] }],
    basics: [],
    tasks: {},
    extraTasks: [],
    dismissedCountryTasks: [],
    numTravelers: null,
    currency: "EUR",
    origin: null,
    budget: null,
    shareCard: null,
    archived: false,
    ...overrides,
  }
}

function source(overrides: Partial<Source> = {}): Source {
  return {
    id: "src-1",
    url: "https://example.com/post",
    author: "blog",
    title: "Guía",
    area: null,
    totalDays: null,
    items: [],
    basics: [],
    articleHtml: "",
    ogImage: null,
    ...overrides,
  }
}

{
  // El título del viaje nunca se usa como query de geocoding.
  assert.equal(mapDestinationHint(baseTrip(), []), null)
  assert.equal(
    mapDestinationHint(baseTrip({ name: "Cuenca" }), []),
    null,
  )
}

{
  const cuenca = source({ area: "Cuenca" })
  assert.equal(mapDestinationHint(baseTrip(), [cuenca]), "Cuenca")
  assert.deepEqual(mapCountryCodes(baseTrip(), [cuenca]), [])
}

{
  const withCountry = source({ area: "Cuenca, España" })
  assert.equal(mapDestinationHint(baseTrip(), [withCountry]), "Cuenca, España")
  assert.deepEqual(mapCountryCodes(baseTrip(), [withCountry]), ["ES"])
}

{
  // Área sin país + countries explícitos → se añade el nombre.
  const cuenca = source({ area: "Cuenca" })
  assert.equal(
    mapDestinationHint(baseTrip({ countries: ["ES"] }), [cuenca]),
    "Cuenca, España",
  )
  assert.deepEqual(
    mapCountryCodes(baseTrip({ countries: ["ES"] }), [cuenca]),
    ["ES"],
  )
}

{
  // Varias áreas distintas: sin ancla global.
  assert.equal(
    mapDestinationHint(baseTrip(), [
      source({ id: "a", area: "Cuenca" }),
      source({ id: "b", area: "Málaga" }),
    ]),
    null,
  )
}

{
  // La misma área repetida cuenta como única.
  assert.equal(
    mapDestinationHint(baseTrip(), [
      source({ id: "a", area: "Cuenca" }),
      source({ id: "b", area: "Cuenca" }),
    ]),
    "Cuenca",
  )
}

{
  // «Granada» no es el país GD; sin countries explícitos no se añade nada.
  const granada = source({ area: "Granada" })
  assert.equal(mapDestinationHint(baseTrip(), [granada]), "Granada")
  assert.deepEqual(mapCountryCodes(baseTrip(), [granada]), [])
  assert.equal(
    mapDestinationHint(baseTrip({ countries: ["ES"] }), [granada]),
    "Granada, España",
  )
  assert.equal(
    mapDestinationHint(baseTrip(), [source({ area: "Granada, España" })]),
    "Granada, España",
  )
}

{
  assert.equal(isIndependentRegionHint("Zona Centro"), false)
  assert.equal(isIndependentRegionHint("Centro"), false)
  assert.equal(isIndependentRegionHint("Casco Antiguo"), false)
  assert.equal(isIndependentRegionHint("Casco Histórico"), false)
  assert.equal(isIndependentRegionHint("Downtown"), false)
  assert.equal(isIndependentRegionHint("Old Town"), false)
  assert.equal(isIndependentRegionHint("Cuenca, Zona Centro"), true)
  assert.equal(isIndependentRegionHint("Cuenca"), true)
  assert.equal(isIndependentRegionHint(""), false)
  assert.equal(isIndependentRegionHint(null), false)
}

console.log("map-destination: ok")
