import assert from "node:assert/strict"
import type { Source, Trip } from "@/types/itinerary"
import {
  buildAssistantSuggestions,
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
  assert.ok(uganda[0]!.includes("visado"))
  assert.ok(uganda.some((s) => s.includes("Uganda")))
  // Estable entre llamadas.
  assert.deepEqual(uganda, buildAssistantSuggestions(baseTrip({ name: "Uganda" }), []))
}

{
  const spain = buildAssistantSuggestions(baseTrip({ name: "España", countries: ["ES"] }), [])
  assert.ok(!spain[0]!.toLowerCase().includes("visado"))
  assert.ok(spain[0]!.includes("España") || spain.some((s) => s.includes("España")))
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
    "¿Necesito visado para este viaje?",
    "¿Qué me falta para completar el plan?",
    "Sugiéreme otra fuente útil",
  ])
}

console.log("assistant-suggestions.test.ts: ok")
