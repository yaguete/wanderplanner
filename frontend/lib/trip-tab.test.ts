import assert from "node:assert/strict"
import { SITE_URL } from "./site"
import {
  parseTripTabParam,
  tabForItemType,
  tripDetailPath,
  tripWanderplannerUrl,
} from "./trip-tab"

assert.equal(parseTripTabParam(null), null)
assert.equal(parseTripTabParam(""), null)
assert.equal(parseTripTabParam("  "), null)
assert.equal(parseTripTabParam("nope"), null)
assert.equal(parseTripTabParam("Ruta"), null)
assert.equal(parseTripTabParam("stay"), "stay")
assert.equal(parseTripTabParam(" activities "), "activities")
assert.equal(parseTripTabParam("itinerary"), "itinerary")
assert.equal(parseTripTabParam("activities"), "activities")
assert.equal(parseTripTabParam("transport"), "transport")
assert.equal(parseTripTabParam("basics"), "basics")

assert.equal(tabForItemType("item", "stay"), "stay")
assert.equal(tabForItemType("item", "activity"), "activities")
assert.equal(tabForItemType("item", "food"), "activities")
assert.equal(tabForItemType("item", "transport"), "transport")
assert.equal(tabForItemType("basic", "sim"), "basics")
assert.equal(tabForItemType("basic", "stay"), "basics")

const id = "11111111-1111-4111-8111-111111111111"
assert.equal(tripDetailPath(id), `/trips/${id}`)
assert.equal(tripDetailPath(id, null), `/trips/${id}`)
assert.equal(tripDetailPath(id, "stay"), `/trips/${id}?tab=stay`)
assert.equal(tripWanderplannerUrl(id, "stay"), `${SITE_URL}/trips/${id}?tab=stay`)
assert.equal(tripWanderplannerUrl(id).startsWith("https://wanderplanner.ai/"), true)
assert.equal(tripWanderplannerUrl(id).includes("localhost"), false)

console.log("trip-tab: ok")
