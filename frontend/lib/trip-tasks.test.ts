import assert from "node:assert/strict"
import type {
  ExtraTask,
  Trip,
  TripTaskState,
  UserBasicItem,
  UserDayItem,
} from "@/types/itinerary"
import { rowToTrip, tripToRow, type TripRow } from "./db/trips-repo"
import {
  buildTripTasks,
  cancellableApplies,
  categoryFromBasic,
  categoryFromItemType,
  computeTripTaskTotals,
  createExtraTaskState,
  effectiveStatus,
  mergeTaskState,
  normalizeName,
  pruneTaskStates,
  resolveTaskStatus,
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
          dayItem({ id: "transport-1", type: "transport", name: "Tren" }),
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
    numTravelers: null,
    currency: "EUR",
    archived: false,
    ...overrides,
  }
}

const stayKey = taskKeyForItem({ type: "stay", name: "Pensión Paco" })
const transportKey = taskKeyForItem({ type: "transport", name: "Tren" })
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
assert.equal(cancellableApplies("transport"), true)
assert.equal(cancellableApplies("activity"), false)
assert.equal(cancellableApplies("basic"), false)

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
  assert.equal(totals.committedCost, 180)
  assert.equal(totals.byStatus.booked, 1)
  assert.equal(totals.byStatus.pending + totals.byStatus.booked, 3)
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
  assert.equal(byId[transportKey].bucket, "main")
  assert.equal(byId[insuranceKey].bucket, "main")
  assert.equal(byId[activityKey].bucket, "triage")
  assert.equal(byId[foodKey].bucket, "triage")
  assert.equal(byId[activityKey].state, null)
  assert.equal(effectiveStatus(byId[stayKey].state), "pending")
  assert.equal(resolveTaskStatus(null), "pending")
  assert.equal(resolveTaskStatus(byId[stayKey].state), "pending")

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
  assert.equal(totals.byStatus.pending + totals.byStatus.booked, 3)
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
  assert.equal(totals.byStatus.pending + totals.byStatus.booked, 4)
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
  assert.equal(totals.byStatus.pending + totals.byStatus.booked, 3)
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
    num_travelers: null,
    currency: null,
  } as TripRow

  const loaded = rowToTrip(legacy)
  assert.deepEqual(loaded.tasks, {})
  assert.deepEqual(loaded.extraTasks, [])
  assert.equal(loaded.numTravelers, null)
  assert.equal(loaded.currency, "EUR")

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
  })
  const row = tripToRow(trip, "user-1")
  assert.ok(row.tasks)
  assert.ok(row.tasks![stayKey])
  assert.equal(row.tasks!["ghost:orphan"], undefined)
  assert.equal(row.currency, "EUR")
  assert.equal(row.num_travelers, null)
  assert.deepEqual(row.extra_tasks, [])
}

console.log("trip-tasks: ok")
