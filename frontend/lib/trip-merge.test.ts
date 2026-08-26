import assert from "node:assert/strict"
import { mergeTrips, type TripMergeResult } from "./trip-merge"
import type { ExtraTask, Trip, TripTaskState, UserDay, UserDayItem } from "@/types/itinerary"

function item(id: string, name: string): UserDayItem {
  return {
    id,
    sourceItemId: id,
    sourceId: "src",
    type: "activity",
    name,
    detail: null,
    sourceAuthor: "a",
  } as UserDayItem
}

function day(id: string, items: UserDayItem[], label = ""): UserDay {
  return { id, label, items }
}

function task(updatedAt: string, status: TripTaskState["status"] = "booked"): TripTaskState {
  return {
    status,
    cost: 10,
    cancellable: null,
    notes: null,
    updatedAt,
  }
}

function extra(id: string, title: string, updatedAt: string): ExtraTask {
  return {
    id,
    title,
    category: "other",
    state: task(updatedAt),
  }
}

function trip(partial: Partial<Trip> & { id: string }): Trip {
  return {
    name: "Viaje",
    countries: [],
    startDate: null,
    endDate: null,
    numDays: 1,
    expectations: null,
    cover: "✈️",
    coverUrl: null,
    sourceIds: [],
    days: [day("d1", [])],
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
    referrer: null,
    ownerId: "owner",
    version: 1,
    ...partial,
  }
}

function names(result: TripMergeResult): string[] {
  return result.trip.days.flatMap((d) => d.items.map((i) => i.name))
}

{
  const base = trip({ id: "t", name: "A", version: 1 })
  const local = { ...base, name: "Local" }
  const remote = { ...base, version: 2 }
  const r = mergeTrips(base, local, remote)
  assert.equal(r.trip.name, "Local")
  assert.equal(r.notes.length, 0)
  assert.equal(r.trip.version, 2)
}

{
  const base = trip({ id: "t", name: "A", version: 1 })
  const local = { ...base }
  const remote = { ...base, name: "Remoto", version: 2 }
  const r = mergeTrips(base, local, remote)
  assert.equal(r.trip.name, "Remoto")
}

{
  const base = trip({ id: "t", name: "A", version: 1 })
  const local = { ...base, name: "Local" }
  const remote = { ...base, name: "Remoto", version: 2 }
  const r = mergeTrips(base, local, remote)
  assert.equal(r.trip.name, "Remoto")
  assert.ok(r.notes.some((n) => n.field === "name" && n.takenFrom === "remote"))
}

{
  const base = trip({ id: "t", days: [day("d1", [item("i1", "Museo")])], version: 1 })
  const local = { ...base, name: "Osaka" }
  const remote = {
    ...base,
    version: 2,
    days: [day("d1", [item("i1", "Museo"), item("i2", "Templo")])],
  }
  const r = mergeTrips(base, local, remote)
  assert.equal(r.trip.name, "Osaka")
  assert.deepEqual(names(r), ["Museo", "Templo"])
}

{
  const base = trip({ id: "t", sourceIds: ["a", "b"], version: 1 })
  const local = { ...base, sourceIds: ["a", "b", "c"] }
  const remote = { ...base, sourceIds: ["b", "a"], version: 2 }
  const r = mergeTrips(base, local, remote)
  assert.deepEqual(r.trip.sourceIds, ["b", "a", "c"])
}

{
  const base = trip({
    id: "t",
    days: [day("d1", [item("i1", "A"), item("i2", "B")])],
    version: 1,
  })
  const local = { ...base, days: [day("d1", [item("i1", "A")])] }
  const remote = {
    ...base,
    version: 2,
    days: [day("d1", [item("i1", "A"), item("i2", "B"), item("i3", "C")])],
  }
  const r = mergeTrips(base, local, remote)
  // Baja local de B + alta remota de C: las dos se conservan.
  assert.deepEqual(names(r), ["A", "C"])
}

{
  const base = trip({
    id: "t",
    tasks: { k: task("2026-01-01T00:00:00.000Z") },
    version: 1,
  })
  const local = { ...base, tasks: { k: task("2026-01-02T00:00:00.000Z", "paid") } }
  const remote = { ...base, version: 2, tasks: { k: task("2026-01-01T12:00:00.000Z", "booked") } }
  const r = mergeTrips(base, local, remote)
  assert.equal(r.trip.tasks.k.status, "paid")
}

{
  const base = trip({
    id: "t",
    extraTasks: [extra("e1", "Visa", "2026-01-01T00:00:00.000Z")],
    version: 1,
  })
  const local = {
    ...base,
    extraTasks: [extra("e1", "Visa local", "2026-01-03T00:00:00.000Z")],
  }
  const remote = {
    ...base,
    version: 2,
    extraTasks: [extra("e1", "Visa remote", "2026-01-02T00:00:00.000Z")],
  }
  const r = mergeTrips(base, local, remote)
  assert.equal(r.trip.extraTasks[0].title, "Visa local")
}

{
  const base = trip({
    id: "t",
    startDate: "2026-09-14",
    numDays: 1,
    endDate: "2026-09-14",
    days: [day("d1", [])],
    version: 1,
  })
  const local = { ...base }
  const remote = {
    ...base,
    version: 2,
    numDays: 1,
    endDate: "2026-09-20",
    days: [day("d1", []), day("d2", []), day("d3", [])],
  }
  const r = mergeTrips(base, local, remote)
  assert.equal(r.trip.numDays, 3)
  assert.equal(r.trip.endDate, "2026-09-16")
  assert.equal(r.trip.days.length, 3)
}

{
  const base = trip({
    id: "t",
    dismissedCountryTasks: ["country:th:tdac"],
    version: 1,
  })
  const local = { ...base, dismissedCountryTasks: [] }
  const remote = { ...base, version: 2, dismissedCountryTasks: ["country:th:tdac"] }
  const r = mergeTrips(base, local, remote)
  assert.deepEqual(r.trip.dismissedCountryTasks, [])
}

{
  const base = trip({
    id: "t",
    days: [day("d1", [], "Base")],
    version: 1,
  })
  const local = { ...base, days: [day("d1", [], "Local")] }
  const remote = { ...base, version: 2, days: [day("d1", [], "Remoto")] }
  const r = mergeTrips(base, local, remote)
  assert.equal(r.trip.days[0].label, "Remoto")
  assert.ok(r.notes.some((n) => n.field === "name" && n.takenFrom === "remote"))
}

{
  const card = {
    text: "Hola Kioto",
    signature: "abc",
    generatedAt: "2026-08-26T00:00:00.000Z",
  }
  const base = trip({ id: "t", shareCard: null, version: 1 })
  const local = { ...base, shareCard: card }
  const remote = { ...base, version: 2 }
  const r = mergeTrips(base, local, remote)
  assert.deepEqual(r.trip.shareCard, card)
  assert.equal(r.notes.length, 0)
}

{
  const localCard = {
    text: "Local",
    signature: "l",
    generatedAt: "2026-08-26T00:00:00.000Z",
  }
  const remoteCard = {
    text: "Remoto",
    signature: "r",
    generatedAt: "2026-08-26T01:00:00.000Z",
  }
  const base = trip({ id: "t", shareCard: null, version: 1 })
  const local = { ...base, shareCard: localCard }
  const remote = { ...base, version: 2, shareCard: remoteCard }
  const r = mergeTrips(base, local, remote)
  assert.deepEqual(r.trip.shareCard, remoteCard)
  assert.ok(r.notes.some((n) => n.field === "share" && n.takenFrom === "remote"))
}

console.log("trip-merge: ok")
