import assert from "node:assert/strict"
import {
  LANDING_REF,
  isReservedRefSlug,
  isReusableDraftTrip,
  mergeDraftReferrer,
  parseDaysParam,
} from "./partner-trip"
import type { Trip } from "@/types/itinerary"

function trip(patch: Partial<Trip> = {}): Trip {
  return {
    id: "t1",
    name: "Mi viaje",
    countries: [],
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
    archived: false,
    referrer: null,
    ...patch,
  }
}

assert.equal(LANDING_REF, "wp-landing")
assert.equal(isReservedRefSlug("wp-landing"), true)
assert.equal(isReservedRefSlug("landing"), true)
assert.equal(isReservedRefSlug("start"), true)
assert.equal(isReservedRefSlug("admin"), true)
assert.equal(isReservedRefSlug("unblogdeviajes"), false)

assert.equal(isReusableDraftTrip(trip()), true)
assert.equal(isReusableDraftTrip(trip({ archived: true })), false)
assert.equal(isReusableDraftTrip(trip({ sourceIds: ["s1"] })), false)
assert.equal(isReusableDraftTrip(trip({ startDate: "2026-08-15" })), false)
assert.equal(
  isReusableDraftTrip(
    trip({
      days: [
        { id: "d1", label: "", items: [] },
        { id: "d2", label: "", items: [] },
      ],
    }),
  ),
  false,
)
assert.equal(
  isReusableDraftTrip(
    trip({
      days: [{ id: "d1", label: "Tokio", items: [] }],
    }),
  ),
  false,
)

assert.equal(mergeDraftReferrer(null, LANDING_REF), LANDING_REF)
assert.equal(mergeDraftReferrer("unblogdeviajes", LANDING_REF), "unblogdeviajes")
assert.equal(mergeDraftReferrer(LANDING_REF, "unblogdeviajes"), "unblogdeviajes")
assert.equal(mergeDraftReferrer(null, null), null)

assert.equal(parseDaysParam("7"), 7)
assert.equal(parseDaysParam("0"), null)

console.log("partner-trip: ok")
