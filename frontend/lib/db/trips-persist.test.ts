import assert from "node:assert/strict"
import { tripToUpdateRow, tripUpdatePayloadsEqual } from "./trips-repo"
import type { Trip, UserDay } from "@/types/itinerary"

function day(id: string): UserDay {
  return { id, label: "", items: [] }
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
    days: [day("d1")],
    basics: [],
    tasks: {},
    extraTasks: [],
    dismissedCountryTasks: [],
    numTravelers: null,
    currency: "EUR",
    origin: null,
    budget: null,
    archived: false,
    referrer: null,
    ownerId: "owner",
    version: 1,
    ...partial,
  }
}

{
  const a = trip({ id: "t1", version: 1 })
  const b = { ...a, version: 38 }
  assert.equal(tripUpdatePayloadsEqual(a, b), true)
  assert.notEqual(a, b)
}

{
  const a = trip({ id: "t1", name: "Austria" })
  const b = { ...a, name: "Austria — 10 días" }
  assert.equal(tripUpdatePayloadsEqual(a, b), false)
}

{
  const a = trip({ id: "t1" })
  const cloned = { ...a, days: a.days.map((d) => ({ ...d, items: [...d.items] })) }
  assert.equal(tripUpdatePayloadsEqual(a, cloned), true)
  assert.ok(!("user_id" in tripToUpdateRow(a)))
  assert.ok(!("version" in tripToUpdateRow(a)))
}

console.log("trips-persist: ok")
