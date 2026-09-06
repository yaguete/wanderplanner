import assert from "node:assert/strict"
import type { Source, Trip } from "@/types/itinerary"
import {
  HOW_IT_WORKS_PROMPT,
  PLAN_TRIP_PROMPT,
  buildAssistantSuggestions,
  confidentTripDestinationLabel,
  tripDestinationLabel,
} from "./assistant-suggestions"

function baseTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-sug",
    name: "Uganda",
    countries: [],
    startDate: null,
    endDate: null,
    numDays: 7,
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
  assert.equal(
    confidentTripDestinationLabel(baseTrip({ name: "Viaje", countries: [] }), []),
    null,
  )
  assert.equal(
    confidentTripDestinationLabel(baseTrip({ name: "Safari" }), []),
    null,
  )
  assert.equal(
    confidentTripDestinationLabel(baseTrip({ name: "Viaje desde elpais.com" }), []),
    null,
  )
  assert.equal(
    confidentTripDestinationLabel(baseTrip({ name: "Uganda" }), []),
    "Uganda",
  )
  assert.equal(
    confidentTripDestinationLabel(baseTrip({ name: "Viaje", countries: ["AT"] }), []),
    "Austria",
  )
  assert.equal(
    confidentTripDestinationLabel(baseTrip({ name: "Safari", countries: ["UG", "KE"] }), []),
    "Uganda y Kenia",
  )
  assert.equal(
    confidentTripDestinationLabel(baseTrip({ name: "Europa" }), [
      source({ area: "austria" }),
    ]),
    "Austria",
  )
  assert.equal(
    confidentTripDestinationLabel(baseTrip({ name: "Viaje" }), [
      source({ area: "Vienna, Austria" }),
    ]),
    "Vienna",
  )
  assert.equal(
    confidentTripDestinationLabel(baseTrip({ name: "Viaje" }), [
      source({ area: "Vienna, Austria" }),
      source({ id: "src-2", area: "Austria" }),
    ]),
    "Vienna",
  )
  assert.equal(
    confidentTripDestinationLabel(baseTrip({ name: "Viaje" }), [
      source({ area: "Vienna, Austria" }),
      source({ id: "src-2", area: "Salzburg, Austria" }),
    ]),
    "Vienna y Salzburg",
  )
  assert.equal(
    confidentTripDestinationLabel(baseTrip({ name: "Viaje", countries: ["AT"] }), [
      source({ area: "Vienna, Austria" }),
      source({ id: "src-2", area: "Salzburg, Austria" }),
      source({ id: "src-3", area: "Innsbruck, Austria" }),
    ]),
    "Austria",
  )
}

{
  assert.equal(tripDestinationLabel(baseTrip({ name: "Uganda", countries: [] }), []), "Uganda")
  assert.equal(
    tripDestinationLabel(baseTrip({ name: "Viaje", countries: ["UG"] }), []),
    "Uganda",
  )
  assert.equal(
    tripDestinationLabel(baseTrip({ name: "Safari", countries: ["UG", "KE"] }), []),
    "Uganda y Kenia",
  )
  assert.equal(
    tripDestinationLabel(baseTrip({ name: "Viaje", countries: ["ES"] }), []),
    "España",
  )
}

{
  const uganda = buildAssistantSuggestions(baseTrip({ name: "Uganda" }), [])
  assert.equal(uganda.length, 3)
  assert.equal(uganda[0], PLAN_TRIP_PROMPT)
  assert.ok(uganda.some((s) => s.includes("Uganda")))
  // Estable entre llamadas.
  assert.deepEqual(uganda, buildAssistantSuggestions(baseTrip({ name: "Uganda" }), []))
}

{
  // El visado ya no arranca ninguna conversación: salía igual para Granada.
  for (const name of ["Uganda", "España", "Austria", "Japón", "Perú"]) {
    const chips = buildAssistantSuggestions(baseTrip({ name, id: `t-${name}` }), [])
    assert.ok(
      !chips.some((s) => /visado/i.test(s)),
      `«${name}» no debería arrancar con visado: ${chips.join(" | ")}`,
    )
  }
}

{
  // Invitado / primer viaje: planificar, cómo funciona y el chip de utilidad.
  const trip = baseTrip({ name: "Uganda" })
  const first = buildAssistantSuggestions(trip, [], { firstTimer: true })
  assert.equal(first.length, 3)
  assert.equal(first[0], PLAN_TRIP_PROMPT)
  assert.equal(first[1], HOW_IT_WORKS_PROMPT)
  assert.equal(first[2], buildAssistantSuggestions(trip, [])[1])

  // Quien ya conoce la casa no lo ve.
  assert.ok(!buildAssistantSuggestions(trip, []).includes(HOW_IT_WORKS_PROMPT))
  // Y si ya lo preguntó, tampoco se repite.
  assert.ok(
    !buildAssistantSuggestions(trip, [], {
      firstTimer: true,
      usedPrompts: [HOW_IT_WORKS_PROMPT],
    }).includes(HOW_IT_WORKS_PROMPT),
  )
}

{
  const pool = new Set<string>()
  for (const name of ["Uganda", "Indonesia", "Perú", "Tailandia", "Kenia", "Marruecos"]) {
    for (const s of buildAssistantSuggestions(baseTrip({ name, id: `t-${name}` }), [])) {
      pool.add(s)
    }
  }
  assert.ok(
    [...pool].some((s) => /niños|cierre el día/i.test(s)),
    "el registro práctico tiene que poder salir en los chips",
  )
}

{
  const spain = buildAssistantSuggestions(baseTrip({ name: "España", countries: ["ES"] }), [])
  assert.ok(spain.some((s) => s.includes("España")))
}

{
  const withSource = buildAssistantSuggestions(baseTrip({ name: "Japón" }), [
    source({ area: "Kyoto, Japan" }),
  ])
  assert.ok(withSource.some((s) => /Japón|Japan|Kioto|Kyoto/i.test(s)))
}

{
  const withDates = buildAssistantSuggestions(
    baseTrip({ name: "Uganda", startDate: "2026-09-01", endDate: "2026-09-07" }),
    [],
  )
  assert.equal(withDates[1], "¿Qué tiempo crees que hará en las fechas de mi viaje?")
  assert.ok(!withDates.some((s) => /mochila/i.test(s)))
}

{
  const noDates = buildAssistantSuggestions(baseTrip({ name: "Uganda", countries: ["UG"] }), [])
  assert.equal(noDates[1], "¿Qué no puede faltar en mi mochila de viaje a Uganda?")
  assert.ok(!noDates.some((s) => /fechas de mi viaje/i.test(s)))
}

{
  assert.deepEqual(buildAssistantSuggestions(null, []), [
    PLAN_TRIP_PROMPT,
    "¿Qué me falta para completar el plan?",
    "Sugiéreme otra fuente útil",
  ])
}

{
  const loaded = baseTrip({
    startDate: "2026-08-25",
    endDate: "2026-08-28",
    days: [
      {
        id: "d1",
        label: "",
        items: [
          {
            id: "t",
            sourceItemId: "t",
            sourceId: "s",
            type: "transport",
            name: "Tren",
            detail: null,
            sourceAuthor: "a",
          },
          {
            id: "a",
            sourceItemId: "a",
            sourceId: "s",
            type: "activity",
            name: "Casco",
            detail: null,
            sourceAuthor: "a",
          },
          {
            id: "b",
            sourceItemId: "b",
            sourceId: "s",
            type: "activity",
            name: "Ambras",
            detail: null,
            sourceAuthor: "a",
          },
          {
            id: "c",
            sourceItemId: "c",
            sourceId: "s",
            type: "food",
            name: "Almuerzo",
            detail: null,
            sourceAuthor: "a",
          },
        ],
      },
      { id: "d2", label: "", items: [] },
    ],
  })
  const chips = buildAssistantSuggestions(loaded, [])
  assert.equal(chips[0], PLAN_TRIP_PROMPT)
  assert.ok(chips.includes("¿Qué tiempo crees que hará en las fechas de mi viaje?"))
  assert.ok(!chips.includes("Revisa qué huecos tiene el plan"))
  assert.ok(!chips.some((s) => /está muy cargado/i.test(s)))
}

{
  const thin = baseTrip({
    days: [{ id: "d1", label: "", items: [] }],
  })
  const chips = buildAssistantSuggestions(thin, [])
  assert.equal(chips[0], PLAN_TRIP_PROMPT)
}

console.log("assistant-suggestions.test.ts: ok")
