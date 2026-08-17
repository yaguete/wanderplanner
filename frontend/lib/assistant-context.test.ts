import assert from "node:assert/strict"
import type { Trip } from "@/types/itinerary"
import { buildTripBriefing } from "./assistant-context"
import { countryCodeFromMapboxFeature } from "./mapbox"

function baseTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-brief",
    name: "Budapest",
    countries: ["HU"],
    startDate: "2026-09-01",
    endDate: "2026-09-05",
    numDays: 5,
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
    archived: false,
    ...overrides,
  }
}

{
  const md = buildTripBriefing(baseTrip(), [])
  assert.match(md, /- origen: \(no configurado\)/)
  assert.doesNotMatch(md, /- viajeros:/)
}

{
  const md = buildTripBriefing(
    baseTrip({
      origin: {
        label: "Barcelona",
        countryCode: "ES",
        coords: { lng: 2.1734, lat: 41.3851 },
      },
      numTravelers: 2,
      currency: "USD",
    }),
    [],
  )
  assert.match(md, /- origen: Barcelona, ES · 41\.3851, 2\.1734/)
  assert.match(md, /- viajeros: 2/)
  assert.match(md, /- divisa: USD/)
}

{
  assert.equal(
    countryCodeFromMapboxFeature({
      context: [{ id: "country.123", short_code: "es" }],
    }),
    "ES",
  )
  assert.equal(
    countryCodeFromMapboxFeature({
      id: "country.456",
      short_code: "hu",
    }),
    "HU",
  )
  assert.equal(
    countryCodeFromMapboxFeature({
      id: "place.1",
      context: [{ id: "region.1", short_code: "CT" }],
    }),
    null,
  )
  // Códigos de región tipo ES-CT: null (no alpha-2 puro); no hay normalización mágica.
  assert.equal(
    countryCodeFromMapboxFeature({
      context: [{ id: "country.1", short_code: "ES-CT" }],
    }),
    null,
  )
  assert.equal(countryCodeFromMapboxFeature({}), null)
}

{
  const md = buildTripBriefing(
    baseTrip({
      days: [
        {
          id: "day-4",
          label: "Salzburgo",
          items: [
            {
              id: "item-mirabell",
              sourceItemId: "src-item",
              sourceId: "src-1",
              type: "activity",
              name: "Palacio de Mirabell",
              detail: "Jardines",
              sourceAuthor: "blog",
              region: "Salzburgo",
            },
          ],
        },
      ],
      tasks: {
        "activity:palacio de mirabell": {
          status: "pending",
          cost: 18,
          cancellable: null,
          notes: null,
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      },
    }),
    [
      {
        id: "src-1",
        url: "https://example.com/guia",
        author: "blog",
        title: "Guía Salzburgo",
        area: "Salzburgo",
        totalDays: 4,
        items: [
          {
            id: "src-item-rest",
            type: "food",
            name: "Stiftskeller",
            detail: null,
            dayHint: 2,
            region: "Salzburgo",
          },
        ],
        basics: [
          {
            id: "src-basic-sim",
            category: "sim",
            name: "eSIM Austria",
            detail: null,
            vendor: "Holafly",
            affiliateUrl: "https://example.com/sim",
          },
        ],
        articleHtml: "",
        ogImage: null,
      },
    ],
  )
  assert.match(md, /### Día 1 — id=`day-4` — Salzburgo/)
  assert.match(
    md,
    /- id=`item-mirabell` \[Actividad\] \*\*Palacio de Mirabell\*\* · Salzburgo — Jardines/,
  )
  assert.match(md, /## Tareas del viaje/)
  assert.match(md, /ref=`activity:palacio de mirabell`/)
  assert.match(md, /18 EUR/)
  assert.match(md, /- id=`src-item-rest` \[Restaurante\] \*\*Stiftskeller\*\*/)
  assert.match(md, /- id=`src-basic-sim` \[SIM \/ eSIM\] \*\*eSIM Austria\*\*/)
  assert.match(md, /## Señales del plan/)
  assert.match(md, /horizonte meteo:/)
  assert.match(md, /día 1: 1 ítem/)
}

console.log("assistant-context + mapbox country: ok")
