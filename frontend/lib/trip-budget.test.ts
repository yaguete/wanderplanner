import assert from "node:assert/strict"
import type { ExtraTask, Trip, TripTaskState, UserDayItem } from "@/types/itinerary"
import {
  buildTripBudgetView,
  formatBudgetBriefingMarkdown,
  groupTasksByCategory,
  normalizeTripBudget,
  applyBudgetEdit,
  persistCapFromDisplay,
  resolveBudgetCaps,
  round2,
} from "./trip-budget"
import { isMissingBudgetColumnError } from "./db/trips-repo"
import { buildTripTasks, mergeTaskState, taskKeyForItem } from "./trip-tasks"

function dayItem(
  overrides: Partial<UserDayItem> & Pick<UserDayItem, "id" | "type" | "name">,
): UserDayItem {
  return {
    sourceItemId: "src-item",
    sourceId: "src-1",
    detail: null,
    sourceAuthor: "Autor",
    ...overrides,
  }
}

function booked(cost: number): TripTaskState {
  return {
    status: "booked",
    cost,
    cancellable: null,
    notes: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
  }
}

function pending(cost: number | null): TripTaskState {
  return {
    status: "pending",
    cost,
    cancellable: null,
    notes: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
  }
}

function paid(cost: number): TripTaskState {
  return {
    status: "paid",
    cost,
    cancellable: null,
    notes: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
  }
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    name: "Alaska",
    countries: [],
    startDate: null,
    endDate: null,
    numDays: 2,
    expectations: null,
    cover: "✈️",
    coverUrl: null,
    sourceIds: [],
    days: [
      {
        id: "day-1",
        label: "",
        items: [
          dayItem({ id: "stay-1", type: "stay", name: "Hotel Denali" }),
          dayItem({
            id: "transport-1",
            type: "transport",
            name: "Anchorage → Denali",
            route: {
              from: { label: "Anchorage", coords: { lng: -149.9, lat: 61.2 }, kind: "city" },
              to: { label: "Denali", coords: { lng: -149.0, lat: 63.5 }, kind: "city" },
              mode: "train",
            },
          }),
        ],
      },
      {
        id: "day-2",
        label: "",
        items: [
          dayItem({ id: "stay-2", type: "stay", name: "Hotel Denali" }),
          dayItem({ id: "act-1", type: "activity", name: "Avistamiento de osos" }),
        ],
      },
    ],
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

const stayKey = taskKeyForItem({ type: "stay", name: "Hotel Denali" })
const transportKey = taskKeyForItem({
  id: "transport-1",
  type: "transport",
  name: "Anchorage → Denali",
  route: {
    from: { label: "Anchorage", coords: { lng: -149.9, lat: 61.2 }, kind: "city" },
    to: { label: "Denali", coords: { lng: -149.0, lat: 63.5 }, kind: "city" },
    mode: "train",
  },
})
const activityKey = taskKeyForItem({ type: "activity", name: "Avistamiento de osos" })

assert.equal(round2(2140.0000000001), 2140)
assert.equal(round2(0.1 + 0.2), 0.3)

{
  assert.equal(normalizeTripBudget(null), null)
  assert.equal(normalizeTripBudget({ total: 0, byCategory: {} }), null)
  assert.equal(normalizeTripBudget({ total: -5, byCategory: { accommodation: 0 } }), null)
  assert.deepEqual(normalizeTripBudget({ total: 3000, byCategory: {} }), {
    total: 3000,
    byCategory: {},
  })
  assert.deepEqual(
    normalizeTripBudget({ total: null, byCategory: { accommodation: 1200, food: -1 } }),
    { total: null, byCategory: { accommodation: 1200 } },
  )
}

{
  const onlyGlobal = applyBudgetEdit(null, { field: "total", value: 3000 })
  assert.deepEqual(onlyGlobal, { total: 3000, byCategory: {} })

  const afterStay = applyBudgetEdit(onlyGlobal, { field: "accommodation", value: 100 })
  assert.deepEqual(afterStay, {
    total: 3000,
    byCategory: { accommodation: 100, other: 2900 },
  })

  const afterTransport = applyBudgetEdit(afterStay, { field: "transport", value: 100 })
  assert.deepEqual(afterTransport, {
    total: 3000,
    byCategory: { accommodation: 100, transport: 100, other: 2800 },
  })

  const raiseOther = applyBudgetEdit(afterStay, { field: "other", value: 3000 })
  assert.deepEqual(raiseOther, {
    total: 3100,
    byCategory: { accommodation: 100, other: 3000 },
  })

  const exceed = applyBudgetEdit(afterStay, { field: "accommodation", value: 3500 })
  assert.deepEqual(exceed, {
    total: 3500,
    byCategory: { accommodation: 3500 },
  })

  const raiseTotal = applyBudgetEdit(afterStay, { field: "total", value: 5000 })
  assert.deepEqual(raiseTotal, {
    total: 5000,
    byCategory: { accommodation: 100, other: 4900 },
  })

  const lowerTotal = applyBudgetEdit(afterStay, { field: "total", value: 50 })
  assert.deepEqual(lowerTotal, {
    total: 100,
    byCategory: { accommodation: 100 },
  })

  const clearTotal = applyBudgetEdit(afterStay, { field: "total", value: null })
  assert.deepEqual(clearTotal, {
    total: null,
    byCategory: { accommodation: 100 },
  })

  const clearStay = applyBudgetEdit(afterStay, { field: "accommodation", value: null })
  assert.deepEqual(clearStay, { total: 3000, byCategory: {} })

  const clearOther = applyBudgetEdit(afterStay, { field: "other", value: null })
  assert.deepEqual(clearOther, {
    total: 100,
    byCategory: { accommodation: 100 },
  })
}

{
  const empty = resolveBudgetCaps(null)
  assert.equal(empty.effective, null)
  assert.equal(empty.declaredTotal, null)
  assert.equal(empty.unassigned, null)
  assert.equal(empty.categoriesExceedTotal, false)

  const onlyTotal = resolveBudgetCaps({ total: 3000, byCategory: {} })
  assert.equal(onlyTotal.effective, 3000)
  assert.equal(onlyTotal.unassigned, 3000)
  assert.equal(onlyTotal.sumByCategory, 0)

  const onlyGroups = resolveBudgetCaps({
    total: null,
    byCategory: { accommodation: 1200, transport: 900 },
  })
  assert.equal(onlyGroups.effective, 2100)
  assert.equal(onlyGroups.declaredTotal, null)
  assert.equal(onlyGroups.unassigned, null)

  const both = resolveBudgetCaps({
    total: 3000,
    byCategory: { accommodation: 1200, transport: 900 },
  })
  assert.equal(both.effective, 3000)
  assert.equal(both.unassigned, 900)
  assert.equal(both.categoriesExceedTotal, false)

  const exceed = resolveBudgetCaps({
    total: 1000,
    byCategory: { accommodation: 800, transport: 400 },
  })
  assert.equal(exceed.effective, 1000)
  assert.equal(exceed.unassigned, -200)
  assert.equal(exceed.categoriesExceedTotal, true)

  const zeroCap = resolveBudgetCaps({ total: 0, byCategory: {} })
  assert.equal(zeroCap.effective, 0)
  assert.equal(zeroCap.declaredTotal, 0)
}

{
  const view = buildTripBudgetView(makeTrip())
  assert.equal(view.verdict.kind, "noCap")
  assert.equal(view.counted, 0)
  assert.equal(view.caps.effective, null)
  // stay + transport son main; activity va a triage y no entra en la cuenta
  assert.equal(view.coverage.priced, 0)
  assert.equal(view.coverage.total, 2)
  assert.equal(view.groups.length, 0)
  assert.equal(view.unpriced.length, 2)
  assert.ok(!view.unpriced.some((g) => g.tasks.some((t) => t.id === activityKey)))
}

{
  const trip = makeTrip({
    tasks: {
      [stayKey]: booked(1800),
      [transportKey]: pending(400),
    },
    extraTasks: [
      {
        id: "visa",
        title: "Visado",
        category: "paperwork",
        state: paid(80),
      } satisfies ExtraTask,
    ],
    budget: { total: 3000, byCategory: { accommodation: 1200 } },
    numTravelers: 2,
  })
  const view = buildTripBudgetView(trip)
  assert.equal(view.counted, 2280)
  assert.equal(view.split.booked, 1800)
  assert.equal(view.split.estimated, 400)
  assert.equal(view.split.paid, 80)
  assert.equal(view.verdict.kind, "under")
  assert.equal(view.verdict.delta, 720)
  assert.equal(view.coverage.priced, 3)
  assert.equal(view.rates.perDay, 1140)
  assert.equal(view.rates.perTraveler, 1140)
  assert.equal(view.rates.perTravelerDay, 570)
  const stayGroup = view.groups.find((g) => g.category === "accommodation")
  assert.ok(stayGroup)
  assert.equal(stayGroup!.over, 600)
  assert.equal(stayGroup!.cap, 1200)
  const otherGroup = view.groups.find((g) => g.category === "other")
  assert.ok(otherGroup)
  assert.equal(otherGroup!.subtotal, 80)
  // Activity en triaje: no aparece en la cuenta hasta que se toca.
  assert.ok(!view.groups.some((g) => g.lines.some((l) => l.task.id === activityKey)))
  assert.ok(!view.unpriced.some((g) => g.tasks.some((t) => t.id === activityKey)))
}

{
  const trip = makeTrip({
    tasks: { [stayKey]: booked(3500) },
    budget: { total: 3000, byCategory: {} },
  })
  const view = buildTripBudgetView(trip)
  assert.equal(view.verdict.kind, "over")
  assert.equal(view.verdict.delta, -500)
}

{
  const trip = makeTrip({
    tasks: {
      [stayKey]: booked(100.001),
      [transportKey]: pending(0.002),
    },
    budget: { total: 100.01, byCategory: {} },
  })
  const view = buildTripBudgetView(trip)
  assert.equal(view.counted, 100)
  assert.equal(view.verdict.kind, "under")
}

{
  const dismissed: ExtraTask = {
    id: "skip",
    title: "No hace falta",
    category: "other",
    state: {
      status: "notNeeded",
      cost: 999,
      cancellable: null,
      notes: null,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  }
  const view = buildTripBudgetView(makeTrip({ extraTasks: [dismissed] }))
  assert.equal(view.counted, 0)
  assert.ok(!view.groups.some((g) => g.lines.some((l) => l.task.id === "skip")))
  assert.ok(!view.unpriced.some((g) => g.tasks.some((t) => t.id === "skip")))
}

{
  const trip = makeTrip({
    tasks: { [activityKey]: pending(90) },
  })
  const view = buildTripBudgetView(trip)
  const act = view.groups.find((g) => g.category === "activity")
  assert.ok(act)
  assert.equal(act!.subtotal, 90)
}

{
  const bcn = { label: "Barcelona", coords: { lng: 2.17, lat: 41.38 }, kind: "airport" as const }
  const vie = { label: "Viena", coords: { lng: 16.57, lat: 48.11 }, kind: "airport" as const }
  const outbound = dayItem({
    id: "leg-out",
    type: "transport",
    name: "Barcelona → Viena",
    route: { from: bcn, to: vie, mode: "flight", leg: "outbound" },
  })
  const ret = dayItem({
    id: "leg-ret",
    type: "transport",
    name: "Viena → Barcelona",
    route: { from: vie, to: bcn, mode: "flight", leg: "return" },
  })
  const trip = makeTrip({
    days: [
      { id: "day-1", label: "", items: [outbound] },
      { id: "day-2", label: "", items: [ret] },
    ],
    tasks: {
      "leg:outbound": booked(120),
      "leg:return": booked(95),
    },
  })
  const view = buildTripBudgetView(trip)
  assert.equal(view.counted, 215)
  const transport = view.groups.find((g) => g.category === "transport")
  assert.ok(transport)
  assert.equal(transport!.lines.length, 1)
  assert.equal(transport!.subtotal, 215)
}

{
  const trip = makeTrip({
    tasks: {
      [stayKey]: booked(800),
      [transportKey]: pending(200),
    },
  })
  const stayLines = buildTripBudgetView(trip).groups.find((g) => g.category === "accommodation")
  assert.ok(stayLines)
  const grouped = groupTasksByCategory(buildTripTasks(trip).filter((t) => t.bucket === "main"))
  assert.ok(grouped.some((g) => g.category === "accommodation"))
  assert.ok(grouped.some((g) => g.category === "transport"))
}

{
  const state = mergeTaskState(null, { cost: 40 })
  const trip = makeTrip({
    tasks: { [activityKey]: state },
  })
  const view = buildTripBudgetView(trip)
  assert.equal(view.groups.find((g) => g.category === "activity")?.subtotal, 40)
}

{
  const noTravelers = buildTripBudgetView(
    makeTrip({ tasks: { [stayKey]: booked(100) }, numTravelers: null }),
  )
  assert.equal(noTravelers.rates.perTraveler, null)
  assert.equal(noTravelers.rates.perTravelerDay, null)
  assert.equal(noTravelers.rates.perDay, 50)
}

assert.equal(
  isMissingBudgetColumnError({
    code: "PGRST204",
    message: "Could not find the 'budget' column of 'trips' in the schema cache",
  }),
  true,
)
assert.equal(isMissingBudgetColumnError({ code: "PGRST204", message: "Could not find the 'origin' column" }), false)
assert.equal(isMissingBudgetColumnError({ message: "column trips.budget does not exist" }), true)
assert.equal(isMissingBudgetColumnError(null), false)

{
  assert.equal(
    persistCapFromDisplay(428.57, 3000, { perPerson: true, travelers: 7 }),
    3000,
  )
  assert.equal(
    persistCapFromDisplay(400, 3000, { perPerson: true, travelers: 7 }),
    2800,
  )
  assert.equal(
    persistCapFromDisplay(3000, 3000, { perPerson: false, travelers: 7 }),
    3000,
  )
  assert.equal(persistCapFromDisplay(null, 3000, { perPerson: true, travelers: 7 }), null)
}

{
  const withRest = applyBudgetEdit(
    applyBudgetEdit({ total: 3000, byCategory: {} }, { field: "accommodation", value: 1200 }),
    { field: "transport", value: 900 },
  )
  const md = formatBudgetBriefingMarkdown(
    buildTripBudgetView(makeTrip({ budget: withRest, tasks: { [stayKey]: booked(100) } })),
  )
  assert.match(md, /Otras \(resto\) 900/)
  assert.doesNotMatch(md, /sin asignar/)
}

{
  const onlyTotal = formatBudgetBriefingMarkdown(
    buildTripBudgetView(makeTrip({ budget: { total: 3000, byCategory: {} } })),
  )
  assert.doesNotMatch(onlyTotal, /techo por grupo/)
  assert.doesNotMatch(onlyTotal, /sin asignar/)
}

console.log("trip-budget: ok")
