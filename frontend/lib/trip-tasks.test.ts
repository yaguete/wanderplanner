import assert from "node:assert/strict"
import type {
  ExtraTask,
  Trip,
  TripTaskState,
  UserBasicItem,
  UserDayItem,
} from "@/types/itinerary"
import { parseTripBudget, parseTripOrigin, rowToTrip, tripToRow, type TripRow } from "./db/trips-repo"
import { reanchorSpannedStays } from "./item-span"
import {
  buildTripTasks,
  cancellableApplies,
  categoryFromBasic,
  categoryFromItemType,
  computeTripTaskTotals,
  createExtraTaskState,
  effectiveStatus,
  foldMirroredFlightReturnCost,
  isBookableTransportMode,
  mergeTaskState,
  normalizeName,
  pruneTaskStates,
  resolveTaskStatus,
  taskBucket,
  taskKeyForBasic,
  taskKeyForItem,
  withPrunedTasks,
} from "./trip-tasks"

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

function basicItem(
  overrides: Partial<UserBasicItem> & Pick<UserBasicItem, "id" | "category" | "name">,
): UserBasicItem {
  return {
    sourceBasicItemId: "src-basic",
    sourceId: "src-1",
    detail: null,
    vendor: null,
    affiliateUrl: null,
    sourceAuthor: "Autor",
    ...overrides,
  }
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-1",
    name: "Test",
    countries: [],
    startDate: null,
    endDate: null,
    numDays: 3,
    expectations: null,
    cover: "✈️",
    coverUrl: null,
    sourceIds: ["src-1"],
    days: [
      {
        id: "day-1",
        label: "Llegada",
        items: [
          dayItem({
            id: "stay-d1",
            type: "stay",
            name: "Pensión Paco",
            affiliateUrl: "https://aff.example/paco",
          }),
          dayItem({
            id: "transport-1",
            type: "transport",
            name: "Madrid → Sevilla",
            route: {
              from: { label: "Madrid", coords: { lng: -3.7, lat: 40.4 }, kind: "city" },
              to: { label: "Sevilla", coords: { lng: -5.99, lat: 37.39 }, kind: "city" },
              mode: "train",
            },
          }),
        ],
      },
      {
        id: "day-2",
        label: "Explorar",
        items: [
          dayItem({ id: "stay-d2", type: "stay", name: "Pensión Paco" }),
          dayItem({ id: "act-1", type: "activity", name: "Paseo por la playa" }),
          dayItem({ id: "food-1", type: "food", name: "Taberna" }),
        ],
      },
      {
        id: "day-3",
        label: "Salida",
        items: [dayItem({ id: "stay-d3", type: "stay", name: "Pensión Paco" })],
      },
    ],
    basics: [
      basicItem({ id: "basic-insurance", category: "insurance", name: "Seguro IATI" }),
    ],
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

const stayKey = taskKeyForItem({ type: "stay", name: "Pensión Paco" })
const transportKey = taskKeyForItem({
  id: "transport-1",
  type: "transport",
  name: "Madrid → Sevilla",
  route: {
    from: { label: "Madrid", coords: { lng: -3.7, lat: 40.4 }, kind: "city" },
    to: { label: "Sevilla", coords: { lng: -5.99, lat: 37.39 }, kind: "city" },
    mode: "train",
  },
})
const activityKey = taskKeyForItem({ type: "activity", name: "Paseo por la playa" })
const foodKey = taskKeyForItem({ type: "food", name: "Taberna" })
const insuranceKey = taskKeyForBasic({ category: "insurance", name: "Seguro IATI" })

// ── Claves y normalización ───────────────────────────────────────────────────

assert.equal(normalizeName("  Pensión  PACO "), "pension paco")
assert.equal(
  taskKeyForItem({ type: "stay", name: "Pensión  PACO " }),
  taskKeyForItem({ type: "stay", name: "pension paco" }),
)
assert.notEqual(
  taskKeyForItem({ type: "food", name: "Mirador" }),
  taskKeyForItem({ type: "activity", name: "Mirador" }),
)
assert.equal(insuranceKey, "basic:insurance:seguro iati")
assert.equal(
  taskKeyForBasic({ category: "insurance", name: "  Seguro   IATI " }),
  insuranceKey,
)

assert.equal(categoryFromItemType("stay"), "accommodation")
assert.equal(categoryFromItemType("transport"), "transport")
assert.equal(categoryFromItemType("activity"), "activity")
assert.equal(categoryFromItemType("food"), "food")
assert.equal(categoryFromBasic("insurance"), "basic")
assert.equal(categoryFromBasic("sim"), "basic")

assert.equal(cancellableApplies("accommodation"), true)
assert.equal(cancellableApplies("transport", "train"), true)
assert.equal(cancellableApplies("transport", "flight"), true)
assert.equal(cancellableApplies("transport", "car"), false)
assert.equal(cancellableApplies("transport"), false)
assert.equal(cancellableApplies("activity"), false)
assert.equal(cancellableApplies("basic"), false)

assert.equal(isBookableTransportMode("flight"), true)
assert.equal(isBookableTransportMode("train"), true)
assert.equal(isBookableTransportMode("bus"), true)
assert.equal(isBookableTransportMode("ferry"), true)
assert.equal(isBookableTransportMode("car"), false)
assert.equal(isBookableTransportMode("other"), false)
assert.equal(isBookableTransportMode(null), false)

// ── 1. Alojamiento multi-día → UNA tarea ─────────────────────────────────────

{
  const trip = makeTrip()
  const tasks = buildTripTasks(trip)
  const stay = tasks.find((t) => t.id === stayKey)
  assert.ok(stay)
  assert.equal(stay!.occurrences, 3)
  assert.equal(stay!.nights, 3)
  assert.deepEqual(stay!.dayIndexes, [0, 1, 2])
  assert.deepEqual(stay!.itemIds, ["stay-d1", "stay-d2", "stay-d3"])
  assert.equal(stay!.affiliateUrl, "https://aff.example/paco")
  assert.equal(stay!.bucket, "main")
  assert.equal(stay!.state, null)

  assert.equal(tasks.filter((t) => t.category === "accommodation").length, 1)

  const booked: TripTaskState = {
    status: "booked",
    cost: 180,
    cancellable: false,
    notes: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
  }
  const withCost = makeTrip({ tasks: { [stayKey]: booked } })
  const totals = computeTripTaskTotals(buildTripTasks(withCost))
  assert.equal(totals.totalCost, 180)
  assert.equal(totals.costByCategory.accommodation, 180)
  assert.equal(totals.costByStatus.booked, 180)
  assert.equal(totals.byStatus.booked, 1)
  assert.equal(
    totals.byStatus.pending + totals.byStatus.booked + totals.byStatus.paid,
    3,
  )

  const paidState: TripTaskState = {
    status: "paid",
    cost: 50,
    cancellable: null,
    notes: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
  }
  const withPaid = makeTrip({
    tasks: {
      [stayKey]: booked,
      [transportKey]: paidState,
    },
  })
  const paidTotals = computeTripTaskTotals(buildTripTasks(withPaid))
  assert.equal(paidTotals.byStatus.paid, 1)
  assert.equal(paidTotals.costByStatus.paid, 50)
  assert.equal(
    computeTripTaskTotals(buildTripTasks(withPaid), {
      categories: ["accommodation"],
    }).costByStatus.booked,
    180,
  )
  assert.equal(
    computeTripTaskTotals(buildTripTasks(withPaid), {
      categories: ["accommodation"],
    }).costByStatus.paid,
    0,
  )
  assert.equal(
    computeTripTaskTotals(buildTripTasks(withPaid), {
      categories: ["transport"],
    }).costByStatus.paid,
    50,
  )
}

// ── 2. Mismo hotel desde dos fuentes → UNA tarea ─────────────────────────────

{
  const trip = makeTrip({
    days: [
      {
        id: "day-1",
        label: "",
        items: [
          dayItem({ id: "a", type: "stay", name: "Hotel Sol", sourceId: "blog-a" }),
          dayItem({ id: "b", type: "stay", name: "Hotel Sol", sourceId: "blog-b" }),
        ],
      },
    ],
    basics: [],
  })
  const tasks = buildTripTasks(trip)
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].occurrences, 2)
  assert.equal(tasks[0].nights, 1)
  assert.deepEqual(tasks[0].itemIds, ["a", "b"])
}

// ── 2b. Mismo básico desde dos blogs → UNA tarea ─────────────────────────────

{
  const trip = makeTrip({
    days: [],
    basics: [
      basicItem({
        id: "uuid-1",
        category: "insurance",
        name: "Seguro IATI",
        sourceId: "blog-a",
        sourceBasicItemId: "sb-a",
      }),
      basicItem({
        id: "uuid-2",
        category: "insurance",
        name: "Seguro IATI",
        sourceId: "blog-b",
        sourceBasicItemId: "sb-b",
      }),
    ],
    tasks: {
      [insuranceKey]: {
        status: "booked",
        cost: 55,
        cancellable: null,
        notes: null,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    },
  })
  const tasks = buildTripTasks(trip)
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].id, insuranceKey)
  assert.equal(tasks[0].occurrences, 2)
  assert.deepEqual(tasks[0].itemIds, ["uuid-1", "uuid-2"])
  const totals = computeTripTaskTotals(tasks)
  assert.equal(totals.totalCost, 55) // no doblado
}

// ── 3. Poda: borrar día 2 conserva; borrar las tres elimina ───────────────────

{
  const booked: TripTaskState = {
    status: "booked",
    cost: 180,
    cancellable: false,
    notes: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
  }
  const trip = makeTrip({ tasks: { [stayKey]: booked } })

  const withoutDay2: Trip = {
    ...trip,
    days: trip.days.map((d, i) =>
      i === 1 ? { ...d, items: d.items.filter((it) => it.type !== "stay") } : d,
    ),
  }
  const prunedPartial = pruneTaskStates(withoutDay2)
  assert.deepEqual(prunedPartial[stayKey], booked)
  const stay = buildTripTasks(withoutDay2).find((t) => t.id === stayKey)
  assert.ok(stay)
  assert.equal(stay!.nights, 2)
  assert.deepEqual(stay!.dayIndexes, [0, 2])

  const withoutStay: Trip = {
    ...trip,
    days: trip.days.map((d) => ({
      ...d,
      items: d.items.filter((it) => it.type !== "stay"),
    })),
  }
  const prunedGone = pruneTaskStates(withoutStay)
  assert.equal(prunedGone[stayKey], undefined)

  // Memoria: borrar es olvidar (withPrunedTasks).
  const forgotten = withPrunedTasks(withoutStay)
  assert.equal(forgotten.tasks[stayKey], undefined)
}

// ── 4. Triaje de accionabilidad ──────────────────────────────────────────────

{
  const trip = makeTrip()
  const tasks = buildTripTasks(trip)
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]))

  assert.equal(byId[stayKey].bucket, "main")
  assert.equal(byId[transportKey].bucket, "main") // tren = bookable
  assert.equal(byId[insuranceKey].bucket, "main")
  assert.equal(byId[activityKey].bucket, "triage")
  assert.equal(byId[foodKey].bucket, "triage")
  assert.equal(byId[activityKey].state, null)
  assert.equal(effectiveStatus(byId[stayKey].state), "pending")
  assert.equal(resolveTaskStatus(null), "pending")
  assert.equal(resolveTaskStatus(byId[stayKey].state), "pending")

  // Coche / sin medio → triaje; al incluir (pending) pasa a main.
  const carItem = dayItem({
    id: "car-1",
    type: "transport",
    name: "Tokio → Nikko",
    route: {
      from: { label: "Tokio", coords: { lng: 139.7, lat: 35.7 }, kind: "city" },
      to: { label: "Nikko", coords: { lng: 139.7, lat: 36.75 }, kind: "city" },
      mode: "car",
    },
  })
  const carKey = taskKeyForItem(carItem)
  const carTrip = makeTrip({
    days: [{ id: "day-1", label: "", items: [carItem] }],
    basics: [],
  })
  assert.equal(buildTripTasks(carTrip).find((t) => t.id === carKey)!.bucket, "triage")
  const carIncluded = makeTrip({
    days: [{ id: "day-1", label: "", items: [carItem] }],
    basics: [],
    tasks: {
      [carKey]: {
        status: "pending",
        cost: null,
        cancellable: null,
        notes: null,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    },
  })
  assert.equal(buildTripTasks(carIncluded).find((t) => t.id === carKey)!.bucket, "main")

  const tourItem = dayItem({
    id: "act-tour",
    type: "activity",
    name: "Avistamiento de osos grizzly",
    affiliateUrl: "https://aff.example/osos",
  })
  const tourKey = taskKeyForItem(tourItem)
  const tourTrip = makeTrip({
    days: [{ id: "day-1", label: "", items: [tourItem] }],
    basics: [],
  })
  assert.equal(buildTripTasks(tourTrip).find((t) => t.id === tourKey)!.bucket, "main")
  assert.equal(taskBucket("activity", null, "dayItem"), "triage")
  assert.equal(taskBucket("activity", null, "dayItem", { hasAffiliate: true }), "main")
  assert.equal(taskBucket("food", null, "dayItem", { hasAffiliate: true }), "triage")

  const undecidedLeg = dayItem({
    id: "leg-out-undecided",
    type: "transport",
    name: "Barcelona → Tokio",
    route: {
      from: { label: "Barcelona", coords: { lng: 2.17, lat: 41.38 }, kind: "city" },
      to: { label: "Tokio", coords: { lng: 139.7, lat: 35.7 }, kind: "city" },
      mode: null,
      leg: "outbound",
    },
  })
  assert.equal(
    buildTripTasks(
      makeTrip({
        days: [{ id: "day-1", label: "", items: [undecidedLeg] }],
        basics: [],
      }),
    ).find((t) => t.id === taskKeyForItem(undecidedLeg))!.bucket,
    "triage",
  )

  const notNeededState: TripTaskState = {
    status: "notNeeded",
    cost: null,
    cancellable: null,
    notes: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
  }
  // Ruta: tres vías. Totales: notNeeded no debería llegar a effectiveStatus.
  assert.equal(resolveTaskStatus(notNeededState), "notNeeded")
  assert.equal(effectiveStatus(notNeededState), "pending")
  assert.equal(
    resolveTaskStatus({
      status: "booked",
      cost: 10,
      cancellable: false,
      notes: null,
      updatedAt: "2026-08-01T00:00:00.000Z",
    }),
    "booked",
  )

  let totals = computeTripTaskTotals(tasks)
  assert.equal(totals.byStatus.pending + totals.byStatus.booked + totals.byStatus.paid, 3)
  assert.equal(totals.byStatus.pending, 3)
  assert.equal(totals.byStatus.booked, 0)

  const promoted = makeTrip({
    tasks: {
      [activityKey]: {
        status: "pending",
        cost: 40,
        cancellable: null,
        notes: null,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    },
  })
  const promotedTask = buildTripTasks(promoted).find((t) => t.id === activityKey)!
  assert.equal(promotedTask.bucket, "main")
  totals = computeTripTaskTotals(buildTripTasks(promoted))
  assert.equal(totals.byStatus.pending + totals.byStatus.booked + totals.byStatus.paid, 4)
  assert.equal(totals.totalCost, 40)

  const dismissed = makeTrip({
    tasks: {
      [activityKey]: {
        status: "notNeeded",
        cost: 40,
        cancellable: null,
        notes: "paseo libre",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    },
  })
  const dismissedTask = buildTripTasks(dismissed).find((t) => t.id === activityKey)!
  assert.equal(dismissedTask.bucket, "dismissed")
  assert.equal(dismissedTask.state?.cost, 40)
  totals = computeTripTaskTotals(buildTripTasks(dismissed))
  assert.equal(totals.byStatus.pending + totals.byStatus.booked + totals.byStatus.paid, 3)
  assert.equal(totals.totalCost, 0)

  const restored = mergeTaskState(dismissed.tasks[activityKey], { status: "pending" })
  assert.equal(restored.status, "pending")
  assert.equal(restored.cost, 40)
  const restoredTrip = makeTrip({ tasks: { [activityKey]: restored } })
  assert.equal(
    buildTripTasks(restoredTrip).find((t) => t.id === activityKey)!.bucket,
    "main",
  )
}

// ── 4b. Triaje de food (espejo de activity) ───────────────────────────────────

{
  const promoted = makeTrip({
    tasks: {
      [foodKey]: {
        status: "pending",
        cost: 25,
        cancellable: null,
        notes: null,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    },
  })
  const promotedTask = buildTripTasks(promoted).find((t) => t.id === foodKey)!
  assert.equal(promotedTask.bucket, "main")
  let totals = computeTripTaskTotals(buildTripTasks(promoted))
  assert.equal(totals.byStatus.pending + totals.byStatus.booked + totals.byStatus.paid, 4)
  assert.equal(totals.totalCost, 25)

  const dismissed = makeTrip({
    tasks: {
      [foodKey]: {
        status: "notNeeded",
        cost: 25,
        cancellable: null,
        notes: "sin reserva",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    },
  })
  const dismissedTask = buildTripTasks(dismissed).find((t) => t.id === foodKey)!
  assert.equal(dismissedTask.bucket, "dismissed")
  assert.equal(dismissedTask.state?.cost, 25)
  totals = computeTripTaskTotals(buildTripTasks(dismissed))
  assert.equal(totals.byStatus.pending + totals.byStatus.booked + totals.byStatus.paid, 3)
  assert.equal(totals.totalCost, 0)

  const restored = mergeTaskState(dismissed.tasks[foodKey], { status: "pending" })
  assert.equal(restored.status, "pending")
  assert.equal(restored.cost, 25)
  const restoredTrip = makeTrip({ tasks: { [foodKey]: restored } })
  assert.equal(
    buildTripTasks(restoredTrip).find((t) => t.id === foodKey)!.bucket,
    "main",
  )
}

// ── Extra notNeeded → dismissed (no main) ────────────────────────────────────

{
  const extra: ExtraTask = {
    id: "extra-1",
    title: "Visado",
    category: "paperwork",
    state: createExtraTaskState(
      { status: "notNeeded", cost: 80 },
      "2026-08-01T00:00:00.000Z",
    ),
  }
  const trip = makeTrip({ extraTasks: [extra] })
  const e = buildTripTasks(trip).find((t) => t.id === "extra-1")!
  assert.equal(e.bucket, "dismissed")
  const totals = computeTripTaskTotals(buildTripTasks(trip))
  assert.equal(totals.totalCost, 0)
  assert.ok(!buildTripTasks(trip).some((t) => t.id === "extra-1" && t.bucket === "main"))
}

// ── Extras pending siempre main; estado por defecto null ─────────────────────

{
  const extra: ExtraTask = {
    id: "extra-2",
    title: "Visado",
    category: "paperwork",
    state: createExtraTaskState({ status: "pending" }, "2026-08-01T00:00:00.000Z"),
  }
  const trip = makeTrip({ extraTasks: [extra] })
  const e = buildTripTasks(trip).find((t) => t.id === "extra-2")!
  assert.equal(e.bucket, "main")
  assert.equal(e.origin, "extra")
  assert.equal(buildTripTasks(trip).find((t) => t.id === stayKey)!.state, null)
}

// ── Coste inválido → null en merge ───────────────────────────────────────────

{
  const merged = mergeTaskState(null, { cost: -5, status: "booked" })
  assert.equal(merged.cost, null)
  const nan = mergeTaskState(null, { cost: Number.NaN })
  assert.equal(nan.cost, null)
}

// ── Estado sobrevive a moveItemBetweenDays (clave ≠ posición) ────────────────

{
  const state: TripTaskState = {
    status: "booked",
    cost: 40,
    cancellable: true,
    notes: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
  }
  const trip = makeTrip({ tasks: { [transportKey]: state } })
  const from = trip.days[0]
  const to = trip.days[1]
  const moving = from.items.find((i) => i.id === "transport-1")!
  const moved: Trip = {
    ...trip,
    days: [
      { ...from, items: from.items.filter((i) => i.id !== "transport-1") },
      { ...to, items: [...to.items, moving] },
      trip.days[2],
    ],
  }
  const found = buildTripTasks(moved).find((t) => t.id === transportKey)!
  assert.deepEqual(found.state, state)
  assert.deepEqual(found.dayIndexes, [1])
  assert.deepEqual(pruneTaskStates(moved)[transportKey], state)
}

// ── Round-trip trips-repo: legacy + poda en tripToRow ────────────────────────

{
  const legacy = {
    id: "legacy-1",
    user_id: "user-1",
    name: "Legacy",
    countries: [],
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
  assert.deepEqual(loaded.tasks, {})
  assert.deepEqual(loaded.extraTasks, [])
  assert.deepEqual(loaded.dismissedCountryTasks, [])
  assert.equal(loaded.numTravelers, null)
  assert.equal(loaded.currency, "EUR")
  assert.equal(loaded.origin, null)
  assert.equal(loaded.budget, null)

  const trip = makeTrip({
    tasks: {
      [stayKey]: {
        status: "booked",
        cost: 100,
        cancellable: false,
        notes: null,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
      "ghost:orphan": {
        status: "booked",
        cost: 999,
        cancellable: null,
        notes: null,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    },
    dismissedCountryTasks: ["country:th:tdac"],
    origin: {
      label: "Barcelona",
      countryCode: "ES",
      coords: { lng: 2.1734, lat: 41.3851 },
    },
    numTravelers: 2,
    budget: { total: 3000, byCategory: { accommodation: 1200 } },
  })
  const row = tripToRow(trip, "user-1")
  assert.ok(row.tasks)
  assert.ok(row.tasks![stayKey])
  assert.equal(row.tasks!["ghost:orphan"], undefined)
  assert.equal(row.currency, "EUR")
  assert.equal(row.num_travelers, 2)
  assert.deepEqual(row.extra_tasks, [])
  assert.deepEqual(row.dismissed_country_tasks, ["country:th:tdac"])
  assert.deepEqual(row.origin, {
    label: "Barcelona",
    countryCode: "ES",
    coords: { lng: 2.1734, lat: 41.3851 },
  })
  const back = rowToTrip(row)
  assert.deepEqual(back.origin, trip.origin)
  assert.equal(back.numTravelers, 2)
  assert.deepEqual(back.budget, {
    total: 3000,
    byCategory: { accommodation: 1200 },
  })
}

// ── parseTripOrigin: lectura defensiva ───────────────────────────────────────

{
  assert.equal(parseTripOrigin(null), null)
  assert.equal(parseTripOrigin(undefined), null)
  assert.equal(parseTripOrigin("Barcelona"), null)
  assert.equal(parseTripOrigin({}), null)
  assert.equal(parseTripOrigin({ label: "  ", coords: { lng: 1, lat: 2 } }), null)
  // Tupla → null (contrato = objeto {lng,lat}).
  assert.equal(
    parseTripOrigin({ label: "BCN", coords: [2.17, 41.38], countryCode: "ES" }),
    null,
  )
  assert.equal(
    parseTripOrigin({ label: "BCN", coords: { lng: NaN, lat: 41 }, countryCode: "ES" }),
    null,
  )
  assert.equal(
    parseTripOrigin({ label: "BCN", coords: { lng: 2, lat: 91 }, countryCode: "ES" }),
    null,
  )
  assert.deepEqual(
    parseTripOrigin({ label: "BCN", coords: { lng: 2, lat: 41 }, countryCode: "esp" }),
    { label: "BCN", countryCode: null, coords: { lng: 2, lat: 41 } },
  )
  assert.deepEqual(
    parseTripOrigin({
      label: "  Barcelona  ",
      countryCode: "es",
      coords: { lng: 2.17, lat: 41.38 },
    }),
    { label: "Barcelona", countryCode: "ES", coords: { lng: 2.17, lat: 41.38 } },
  )
}

// ── parseTripBudget: lectura defensiva ───────────────────────────────────────

{
  assert.equal(parseTripBudget(null), null)
  assert.equal(parseTripBudget(undefined), null)
  assert.equal(parseTripBudget("3000"), null)
  assert.equal(parseTripBudget([]), null)
  assert.equal(parseTripBudget({}), null)
  assert.equal(parseTripBudget({ total: -10, byCategory: { food: -1 } }), null)
  assert.equal(parseTripBudget({ total: Number.NaN, byCategory: { ghost: 50 } }), null)
  assert.deepEqual(parseTripBudget({ total: 0, byCategory: {} }), {
    total: 0,
    byCategory: {},
  })
  assert.deepEqual(
    parseTripBudget({
      total: 3000,
      byCategory: { accommodation: 1200, paperwork: 80, food: 50 },
    }),
    { total: 3000, byCategory: { accommodation: 1200, food: 50 } },
  )
  const corrupted = rowToTrip({
    id: "t",
    user_id: "u",
    name: "X",
    countries: [],
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
    tasks: {},
    extra_tasks: [],
    dismissed_country_tasks: [],
    num_travelers: null,
    currency: "EUR",
    origin: null,
    budget: { total: "mucho", byCategory: null },
  } as unknown as TripRow)
  assert.equal(corrupted.budget, null)
}

// ── T4B.3: ida/vuelta — claves semánticas y costes independientes ────────────

{
  const outbound = dayItem({
    id: "leg-out",
    type: "transport",
    name: "Barcelona → Granada",
    route: {
      from: { label: "Barcelona", coords: { lng: 2.17, lat: 41.38 }, kind: "city" },
      to: { label: "Granada", coords: { lng: -3.6, lat: 37.17 }, kind: "city" },
      mode: null,
      leg: "outbound",
    },
  })
  const ret = dayItem({
    id: "leg-ret",
    type: "transport",
    name: "Granada → Barcelona",
    route: {
      from: { label: "Granada", coords: { lng: -3.6, lat: 37.17 }, kind: "city" },
      to: { label: "Barcelona", coords: { lng: 2.17, lat: 41.38 }, kind: "city" },
      mode: null,
      leg: "return",
    },
  })

  const outKey = taskKeyForItem(outbound)
  const retKey = taskKeyForItem(ret)
  assert.equal(outKey, "leg:outbound")
  assert.equal(retKey, "leg:return")
  assert.notEqual(outKey, retKey)

  // Un ítem manual llamado «leg:outbound» NO colisiona (usa prefijo ItemType).
  assert.notEqual(
    taskKeyForItem({ type: "transport", name: "leg:outbound" }),
    "leg:outbound",
  )
  assert.equal(
    taskKeyForItem({ type: "transport", name: "leg:outbound" }),
    "transport:leg:outbound",
  )

  const trip = makeTrip({
    days: [
      { id: "day-1", label: "", items: [outbound] },
      { id: "day-2", label: "", items: [] },
      { id: "day-3", label: "", items: [ret] },
    ],
    basics: [],
    tasks: {
      [outKey]: {
        status: "booked",
        cost: 120,
        cancellable: true,
        notes: null,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
      [retKey]: {
        status: "pending",
        cost: 95,
        cancellable: true,
        notes: null,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    },
  })
  const tasks = buildTripTasks(trip)
  const transportTasks = tasks.filter((t) => t.category === "transport")
  assert.equal(transportTasks.length, 2)
  assert.equal(computeTripTaskTotals(tasks).totalCost, 215)

  // Editar extremos/medio NO cambia la clave → coste intacto.
  const renamed = {
    ...outbound,
    name: "Girona → Granada",
    route: {
      ...outbound.route!,
      from: { label: "Girona", coords: { lng: 2.8, lat: 41.98 }, kind: "city" as const },
      mode: "train" as const,
    },
  }
  assert.equal(taskKeyForItem(renamed), outKey)

  // Borrar ida poda su coste.
  const withoutOut: Trip = {
    ...trip,
    days: trip.days.map((d) => ({
      ...d,
      items: d.items.filter((i) => i.id !== "leg-out"),
    })),
  }
  const pruned = pruneTaskStates(withoutOut)
  assert.equal(pruned[outKey], undefined)
  assert.deepEqual(pruned[retKey]?.cost, 95)
}

// ── T4B.3b: ida y vuelta en avión espejadas = una sola tarea ─────────────────

{
  const bcn = { label: "Barcelona", coords: { lng: 2.173, lat: 41.385 }, kind: "city" as const }
  const vie = { label: "Viena", coords: { lng: 16.37, lat: 48.21 }, kind: "city" as const }
  const bud = { label: "Budapest", coords: { lng: 19.04, lat: 47.5 }, kind: "city" as const }

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

  const booked = (cost: number): TripTaskState => ({
    status: "booked",
    cost,
    cancellable: true,
    notes: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
  })

  const mirroredTrip = makeTrip({
    days: [
      { id: "day-1", label: "", items: [outbound] },
      { id: "day-2", label: "", items: [] },
      { id: "day-3", label: "", items: [ret] },
    ],
    basics: [],
    extraTasks: [],
    tasks: {
      "leg:outbound": booked(120),
      "leg:return": booked(95),
    },
  })

  const fused = buildTripTasks(mirroredTrip).filter((t) => t.category === "transport")
  assert.equal(fused.length, 1)
  assert.equal(fused[0]!.id, "leg:outbound")
  assert.equal(fused[0]!.roundtripFlight, true)
  assert.equal(fused[0]!.occurrences, 2)
  assert.deepEqual(fused[0]!.dayIndexes, [0, 2])
  assert.equal(fused[0]!.itemIds.length, 2)
  assert.equal(fused[0]!.state?.cost, 215)
  assert.equal(computeTripTaskTotals(buildTripTasks(mirroredTrip)).totalCost, 215)
  assert.equal(
    computeTripTaskTotals(buildTripTasks(mirroredTrip)).costByCategory.transport,
    215,
  )

  const folded = foldMirroredFlightReturnCost(mirroredTrip.tasks, mirroredTrip.days)
  assert.equal(folded["leg:outbound"]?.cost, 215)
  assert.equal(folded["leg:return"], undefined)
  const prunedFold = pruneTaskStates(mirroredTrip)
  assert.equal(prunedFold["leg:outbound"]?.cost, 215)
  assert.equal(prunedFold["leg:return"], undefined)

  // Ida en avión sin retorno → una tarea, occurrences 1.
  const outboundOnly = makeTrip({
    days: [{ id: "day-1", label: "", items: [outbound] }],
    basics: [],
    extraTasks: [],
    tasks: {},
  })
  const onlyOut = buildTripTasks(outboundOnly).filter((t) => t.category === "transport")
  assert.equal(onlyOut.length, 1)
  assert.equal(onlyOut[0]!.occurrences, 1)
  assert.equal(onlyOut[0]!.roundtripFlight, undefined)

  // Vuelta en tren → dos tareas.
  const trainReturn = makeTrip({
    days: [
      { id: "day-1", label: "", items: [outbound] },
      {
        id: "day-3",
        label: "",
        items: [
          {
            ...ret,
            route: { from: vie, to: bcn, mode: "train", leg: "return" },
          },
        ],
      },
    ],
    basics: [],
    extraTasks: [],
    tasks: { "leg:outbound": booked(120), "leg:return": booked(95) },
  })
  const splitTrain = buildTripTasks(trainReturn).filter((t) => t.category === "transport")
  assert.equal(splitTrain.length, 2)
  assert.equal(computeTripTaskTotals(buildTripTasks(trainReturn)).totalCost, 215)

  // Open-jaw (BCN→VIE, VIE→BUD) → dos tareas.
  const openJaw = makeTrip({
    days: [
      { id: "day-1", label: "", items: [outbound] },
      {
        id: "day-3",
        label: "",
        items: [
          {
            ...ret,
            name: "Viena → Budapest",
            route: { from: vie, to: bud, mode: "flight", leg: "return" },
          },
        ],
      },
    ],
    basics: [],
    extraTasks: [],
    tasks: { "leg:outbound": booked(120), "leg:return": booked(95) },
  })
  const splitJaw = buildTripTasks(openJaw).filter((t) => t.category === "transport")
  assert.equal(splitJaw.length, 2)
}

// ── Stay manual con spanDays: 1 ocurrencia, 3 noches ─────────────────────────

{
  const hotel = dayItem({
    id: "full-moon",
    type: "stay",
    name: "Full Moon Budapest",
    spanDays: 3,
  })
  const trip = makeTrip({
    days: [
      { id: "day-1", label: "", items: [hotel] },
      { id: "day-2", label: "", items: [] },
      { id: "day-3", label: "", items: [] },
      { id: "day-4", label: "", items: [] },
    ],
    basics: [],
    extraTasks: [],
    tasks: {},
  })
  const tasks = buildTripTasks(trip)
  const stay = tasks.find((t) => t.sourceKind === "stay")
  assert.ok(stay)
  assert.equal(stay!.occurrences, 1)
  assert.equal(stay!.nights, 3)
  assert.deepEqual(stay!.dayIndexes, [0, 1, 2])
  assert.notEqual(stay!.occurrences, stay!.nights)
}

{
  // Mixto: dos copias de fuente + un spanDays. dayIndexes ordenado, sin duplicados.
  const trip = makeTrip({
    days: [
      {
        id: "day-1",
        label: "",
        items: [
          dayItem({ id: "src-a", type: "stay", name: "Hotel Mix" }),
          dayItem({
            id: "manual",
            type: "stay",
            name: "Hotel Mix",
            spanDays: 3,
            sourceId: "manual",
          }),
        ],
      },
      {
        id: "day-2",
        label: "",
        items: [dayItem({ id: "src-b", type: "stay", name: "Hotel Mix" })],
      },
      { id: "day-3", label: "", items: [] },
    ],
    basics: [],
    extraTasks: [],
    tasks: {},
  })
  const stay = buildTripTasks(trip).find((t) => t.sourceKind === "stay")
  assert.ok(stay)
  assert.equal(stay!.occurrences, 3)
  assert.equal(stay!.nights, 3)
  assert.deepEqual(stay!.dayIndexes, [0, 1, 2])
  const sorted = [...stay!.dayIndexes].sort((a, b) => a - b)
  assert.deepEqual(stay!.dayIndexes, sorted)
  assert.equal(new Set(stay!.dayIndexes).size, stay!.dayIndexes.length)
}

{
  // Tramos: spanDays en un transport NO crea nights.
  const outbound = dayItem({
    id: "leg-out",
    type: "transport",
    name: "BCN → BUD",
    spanDays: 5,
    route: {
      from: { label: "BCN", coords: { lng: 2, lat: 41 }, kind: "airport" },
      to: { label: "BUD", coords: { lng: 19, lat: 47 }, kind: "airport" },
      mode: "flight",
      leg: "outbound",
    },
  })
  const trip = makeTrip({
    days: [
      { id: "day-1", label: "", items: [outbound] },
      { id: "day-2", label: "", items: [] },
      { id: "day-3", label: "", items: [] },
    ],
    basics: [],
    extraTasks: [],
    tasks: {},
  })
  const t = buildTripTasks(trip).find((x) => x.id === "leg:outbound")
  assert.ok(t)
  assert.equal(t!.nights, undefined)
}

{
  // Activity con spanDays: cubre los días, sin nights (eso es de stay).
  const trek = dayItem({
    id: "bhutan",
    type: "activity",
    name: "Excursión a Bután",
    spanDays: 5,
  })
  const trip = makeTrip({
    days: [
      { id: "day-1", label: "", items: [trek] },
      { id: "day-2", label: "", items: [] },
      { id: "day-3", label: "", items: [] },
      { id: "day-4", label: "", items: [] },
      { id: "day-5", label: "", items: [] },
      { id: "day-6", label: "", items: [] },
    ],
    basics: [],
    extraTasks: [],
    tasks: {},
  })
  const t = buildTripTasks(trip).find((x) => x.sourceKind === "activity")
  assert.ok(t)
  assert.equal(t!.occurrences, 1)
  assert.equal(t!.nights, undefined)
  assert.deepEqual(t!.dayIndexes, [0, 1, 2, 3, 4])
}

{
  // Borrar el día ancla: el stay y su coste sobreviven reanclados.
  const hotel = dayItem({
    id: "full-moon",
    type: "stay",
    name: "Full Moon Budapest",
    spanDays: 3,
    sourceId: "manual",
  })
  const trip = makeTrip({
    days: [
      { id: "day-1", label: "", items: [hotel] },
      { id: "day-2", label: "", items: [] },
      { id: "day-3", label: "", items: [] },
      { id: "day-4", label: "", items: [] },
    ],
    basics: [],
    extraTasks: [],
    tasks: {
      "stay:full moon budapest": {
        status: "paid",
        cost: 240,
        cancellable: null,
        notes: null,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    },
  })
  const after = [trip.days[1]!, trip.days[2]!, trip.days[3]!]
  const rescued = reanchorSpannedStays(trip.days, after)
  assert.ok(rescued[0]!.items.some((i) => i.id === "full-moon"))
  assert.equal(rescued[0]!.items.find((i) => i.id === "full-moon")!.spanDays, 2)
  const pruned = withPrunedTasks({ ...trip, days: rescued, numDays: rescued.length })
  assert.equal(pruned.tasks["stay:full moon budapest"]?.cost, 240)
}

console.log("trip-tasks: ok")
