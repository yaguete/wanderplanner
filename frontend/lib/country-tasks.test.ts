import assert from "node:assert/strict"
import type { ExtraTask, Trip } from "@/types/itinerary"
import { hasWordBoundaryMatch, resolveTripCountryCodes, collectCountryCodesFromHint } from "./countries"
import {
  buildCountryTaskId,
  countryCodeFromTaskId,
  filterVisibleSuggestions,
  hasDismissedActiveCountryTasks,
  isCountryTaskId,
  notesForAcceptedSuggestion,
  suggestionToExtraTaskInput,
  type CountryTaskSuggestion,
} from "./country-tasks"
import { rowToTrip, tripToRow, type TripRow } from "./db/trips-repo"
import { createExtraTaskState } from "./trip-tasks"

function baseTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    name: "Tailandia",
    countries: ["TH"],
    startDate: null,
    endDate: null,
    numDays: 1,
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
    archived: false,
    ...overrides,
  }
}

const tdac: CountryTaskSuggestion = {
  id: "country:th:tdac",
  title: "Tramitar TDAC de Tailandia",
  category: "paperwork",
  leadTimeDays: 3,
  details: "Completar tres días antes.",
  countryCode: "TH",
  countryName: "Tailandia",
}

const vacunas: CountryTaskSuggestion = {
  id: "country:th:vacunas",
  title: "Vacunas recomendadas de Tailandia",
  category: "health",
  leadTimeDays: null,
  details: "Consultar centro de vacunación internacional.",
  countryCode: "TH",
  countryName: "Tailandia",
}

// ── Ids estables ─────────────────────────────────────────────────────────────

assert.equal(isCountryTaskId("country:th:tdac"), true)
assert.equal(isCountryTaskId(crypto.randomUUID()), false)
assert.equal(countryCodeFromTaskId("country:th:tdac"), "TH")
assert.equal(countryCodeFromTaskId("country:fr:nada"), "FR")
assert.equal(countryCodeFromTaskId(crypto.randomUUID()), null)
assert.equal(buildCountryTaskId("TH", "Visado TDAC"), "country:th:visado-tdac")

// ── Filtrado visible ─────────────────────────────────────────────────────────

{
  const trip = baseTrip({
    extraTasks: [
      {
        id: "country:th:tdac",
        title: "Tramitar TDAC de Tailandia",
        category: "paperwork",
        state: createExtraTaskState({ status: "pending" }),
      },
    ],
    dismissedCountryTasks: ["country:th:vacunas"],
  })
  const visible = filterVisibleSuggestions(trip, [tdac, vacunas])
  assert.deepEqual(visible, [])
}

{
  const trip = baseTrip({ dismissedCountryTasks: ["country:th:vacunas"] })
  const visible = filterVisibleSuggestions(trip, [tdac, vacunas])
  assert.equal(visible.length, 1)
  assert.equal(visible[0]!.id, "country:th:tdac")
}

// ── Aceptar → notes con plazo ────────────────────────────────────────────────

{
  const input = suggestionToExtraTaskInput(tdac)
  assert.equal(input.id, "country:th:tdac")
  assert.equal(input.category, "paperwork")
  assert.equal(input.state.cost, null)
  assert.ok(input.state.notes?.includes("Completar tres días antes."))
  assert.ok(input.state.notes?.includes("~3 días"))
  assert.equal(notesForAcceptedSuggestion(vacunas), vacunas.details)
}

// ── Reevaluar: descartes activos ─────────────────────────────────────────────

{
  const trip = baseTrip({
    dismissedCountryTasks: ["country:th:tdac", "country:fr:nada"],
  })
  assert.equal(hasDismissedActiveCountryTasks(trip, ["TH"]), true)
  assert.equal(hasDismissedActiveCountryTasks(trip, ["US"]), false)
}

// ── Eliminar country: vs uuid manual ─────────────────────────────────────────

{
  const manualId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  assert.equal(isCountryTaskId(manualId), false)
  assert.equal(isCountryTaskId("country:th:tdac"), true)
}

// ── Round-trip dismissed_country_tasks ───────────────────────────────────────

{
  const legacy = {
    id: "legacy-1",
    user_id: "user-1",
    name: "Legacy",
    countries: ["TH"],
    start_date: null,
    end_date: null,
    num_days: 1,
    expectations: null,
    cover: "✈️",
    cover_url: null,
    archived: false,
    referrer: null,
    source_ids: [],
    days: [{ id: "d1", label: "", items: [] }],
    basics: [],
    tasks: null,
    extra_tasks: null,
    dismissed_country_tasks: null,
    num_travelers: null,
    currency: null,
  } as unknown as TripRow

  const loaded = rowToTrip(legacy)
  assert.deepEqual(loaded.dismissedCountryTasks, [])
  assert.equal(loaded.origin, null)

  const trip = baseTrip({
    dismissedCountryTasks: ["country:th:tdac"],
    origin: {
      label: "Madrid",
      countryCode: "ES",
      coords: { lng: -3.7038, lat: 40.4168 },
    },
    extraTasks: [
      {
        id: "country:th:vacunas",
        title: "Vacunas",
        category: "health",
        state: createExtraTaskState(),
      } satisfies ExtraTask,
    ],
  })
  const row = tripToRow(trip, "user-1")
  assert.deepEqual(row.dismissed_country_tasks, ["country:th:tdac"])
  assert.equal(row.extra_tasks![0]!.id, "country:th:vacunas")
  assert.deepEqual(row.origin, trip.origin)
  const back = rowToTrip(row)
  assert.deepEqual(back.dismissedCountryTasks, ["country:th:tdac"])
  assert.deepEqual(back.origin, trip.origin)
}

// ── Word-boundary en inferencia de países ────────────────────────────────────

{
  assert.equal(hasWordBoundaryMatch("viaje a mali 2026", "mali"), true)
  assert.equal(hasWordBoundaryMatch("viaje a malibú", "mali"), false)
  assert.equal(hasWordBoundaryMatch("chadwick bay", "chad"), false)
  assert.equal(hasWordBoundaryMatch("viaje a chad", "chad"), true)
  assert.equal(hasWordBoundaryMatch("indianapolis", "india"), false)

  // Catálogo usa "Mali" sin tilde: Malibú no debe inferir ML.
  const malibu = resolveTripCountryCodes(
    { name: "Malibú y surf", countries: [] },
    [],
  )
  assert.equal(malibu.includes("ML"), false)

  const chadwick = resolveTripCountryCodes(
    { name: "Chadwick Bay", countries: [] },
    [],
  )
  assert.equal(chadwick.includes("TD"), false)

  const indy = resolveTripCountryCodes(
    { name: "Indianapolis road trip", countries: [] },
    [],
  )
  assert.equal(indy.includes("IN"), false)

  const realMali = resolveTripCountryCodes(
    { name: "Viaje a Mali", countries: [] },
    [],
  )
  assert.ok(realMali.includes("ML"))
}

// ── Inferencia multilingüe (ES + EN vía Intl.DisplayNames) ───────────────────

{
  assert.deepEqual(
    resolveTripCountryCodes({ name: "Japan", countries: [] }, []),
    ["JP"],
  )
  assert.deepEqual(
    resolveTripCountryCodes({ name: "Tokyo, Japan", countries: [] }, []),
    ["JP"],
  )
  assert.deepEqual(
    resolveTripCountryCodes({ name: "Germany", countries: [] }, []),
    ["DE"],
  )
  assert.deepEqual(
    resolveTripCountryCodes({ name: "Netherlands", countries: [] }, []),
    ["NL"],
  )
  assert.deepEqual(
    resolveTripCountryCodes({ name: "Greece", countries: [] }, []),
    ["GR"],
  )

  // Nombres españoles del catálogo siguen funcionando.
  assert.deepEqual(
    resolveTripCountryCodes({ name: "Japón", countries: [] }, []),
    ["JP"],
  )
  assert.deepEqual(
    resolveTripCountryCodes({ name: "Tailandia", countries: [] }, []),
    ["TH"],
  )

  // Dos países claramente nombrados.
  const multi = resolveTripCountryCodes(
    { name: "Japan and Thailand", countries: [] },
    [],
  )
  assert.ok(multi.includes("JP"))
  assert.ok(multi.includes("TH"))

  // Códigos ISO sueltos en texto no deben inventar destinos.
  assert.deepEqual(
    resolveTripCountryCodes({ name: "viaje in us", countries: [] }, []),
    [],
  )
}

{
  // «Granada» es la ciudad andaluza, no el país GD (Grenada).
  assert.deepEqual(collectCountryCodesFromHint("Granada"), [])
  assert.deepEqual(collectCountryCodesFromHint("Granada, España"), ["es"])
  assert.deepEqual(collectCountryCodesFromHint("Provincia de Granada, españa"), ["es"])
  assert.deepEqual(collectCountryCodesFromHint("Grenada"), ["gd"])
  assert.equal(
    resolveTripCountryCodes({ name: "Granada 2026", countries: [] }, []).includes("GD"),
    false,
  )
  assert.deepEqual(
    resolveTripCountryCodes({ name: "Grenada", countries: [] }, []),
    ["GD"],
  )
}

console.log("country-tasks: ok")
