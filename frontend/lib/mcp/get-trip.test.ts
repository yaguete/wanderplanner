import assert from "node:assert/strict"
import { applyMcpAffiliateGate } from "./affiliate-gate"
import {
  GET_TRIP_DETAIL_DAYS_MAX,
  getTripOutput,
  MCP_GET_TRIP_COLUMNS,
  mapGetTrip,
  requestedDayIndexes,
  type McpGetTripRow,
} from "./get-trip"

function collectKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (value == null || typeof value !== "object") return into
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, into)
    return into
  }
  for (const [k, v] of Object.entries(value)) {
    into.add(k)
    collectKeys(v, into)
  }
  return into
}

const columns = MCP_GET_TRIP_COLUMNS.split(",").map((c) => c.trim())
for (const forbidden of ["share_card", "user_id", "cover_url", "version", "referrer", "article_html"]) {
  assert.equal(columns.includes(forbidden), false, forbidden)
}
for (const required of ["id", "name", "days", "basics", "tasks", "budget", "origin"]) {
  assert.equal(columns.includes(required), true, required)
}

const dirtyItem = {
  id: "item-1",
  sourceItemId: "src-item-1",
  sourceId: "src-1",
  type: "stay",
  name: "Hotel Split",
  detail: "Con vistas",
  sourceAuthor: "Patricia",
  region: "Split",
  coords: { lng: 16.44, lat: 43.51 },
  affiliateUrl: "https://www.booking.com/hotel/hr/split.html?aid=12345",
  spanDays: 3,
  route: {
    from: { label: "Madrid", coords: { lng: -3.7, lat: 40.4 }, kind: "city" },
    to: { label: "Split", coords: { lng: 16.44, lat: 43.51 }, kind: "city" },
    mode: "flight",
    leg: "outbound",
  },
}

const dirty: McpGetTripRow = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Croacia",
  archived: false,
  start_date: "2026-09-01",
  end_date: "2026-09-05",
  num_days: 5,
  countries: ["HR"],
  expectations: "Playas",
  source_ids: ["src-1"],
  days: [
    { id: "d1", label: "Llegada", items: [dirtyItem] },
    {
      id: "d2",
      label: "Mar",
      items: [
        {
          id: "item-2",
          type: "activity",
          name: "Palacio de Diocleciano",
          detail: null,
          sourceAuthor: "Patricia",
          affiliateUrl: null,
        },
      ],
    },
    { id: "d3", label: "", items: [] },
    { id: "d4", label: "", items: [] },
    { id: "d5", label: "Vuelta", items: [] },
  ],
  basics: [
    {
      name: "SIM",
      category: "sim",
      detail: null,
      affiliateUrl: "https://example.com/sim",
      sourceAuthor: "Patricia",
    },
  ],
  tasks: {
    "stay:hotel split": {
      status: "booked",
      cost: 420,
      notes: "localizador X",
      cancellable: true,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
    "activity:palacio de diocleciano": {
      status: "pending",
      cost: 15,
      notes: null,
    },
  },
  extra_tasks: [],
  dismissed_country_tasks: ["country:hr:visado"],
  num_travelers: 2,
  currency: "EUR",
  origin: {
    label: "Madrid",
    countryCode: "ES",
    coords: { lng: -3.7, lat: 40.4 },
  },
  budget: { total: 2000, byCategory: { accommodation: 800 } },
  share_card: { text: "secreto de compartir", signature: "sig" },
} as McpGetTripRow & { share_card: { text: string; signature: string } }

{
  const { result, text } = mapGetTrip(dirty)
  assert.equal(result.mode, "summary")
  getTripOutput.parse(result)
  assert.equal(result.days.length, 5)
  assert.equal(result.days[0]?.itemNames[0], "Hotel Split")
  assert.match(text, /days/)
  const keys = collectKeys(result)
  for (const forbidden of ["coords", "lng", "lat", "share_card", "shareCard", "articleHtml", "article_html"]) {
    assert.equal(keys.has(forbidden), false, forbidden)
  }
  const blob = JSON.stringify(result)
  assert.equal(blob.includes("16.44"), false)
  assert.equal(blob.includes("secreto de compartir"), false)
  assert.equal(blob.includes("pxf.io"), false)
  assert.equal(blob.includes("skyscanner"), false)
  assert.ok(blob.includes("example.com/sim"))
  assert.equal(result.origin?.label, "Madrid")
  assert.equal(result.origin?.countryCode, "ES")
  assert.equal(
    result.wanderplannerUrl,
    "https://wanderplanner.ai/trips/11111111-1111-4111-8111-111111111111?tab=itinerary",
  )
}

{
  const { result } = mapGetTrip(dirty, [1])
  assert.equal(result.mode, "detail")
  getTripOutput.parse(result)
  if (result.mode !== "detail") throw new Error("expected detail")
  const item = result.days[0]?.items[0]
  assert.equal(item?.name, "Hotel Split")
  assert.equal(item?.affiliateUrl, "https://www.booking.com/hotel/hr/split.html?aid=12345")
  assert.equal(item?.spanDays, 3)
  assert.equal(item?.route?.from.label, "Madrid")
  assert.equal(item?.route?.to.label, "Split")
  assert.equal(item?.route?.mode, "flight")
  const keys = collectKeys(result)
  assert.equal(keys.has("coords"), false)
  assert.equal(keys.has("lng"), false)
  assert.equal(keys.has("lat"), false)
  assert.equal(result.tasks["stay:hotel split"]?.cost, 420)
  assert.equal(result.tasks["stay:hotel split"]?.notes, "localizador X")
  assert.equal(result.tasks["activity:palacio de diocleciano"], undefined)
  assert.equal(result.taskCounts.booked, 1)
  assert.equal(result.taskCounts.pending, 1)
  const gated = applyMcpAffiliateGate(result, false)
  const gatedBlob = JSON.stringify(gated)
  assert.equal(gatedBlob.includes("booking.com"), false)
  assert.equal(gatedBlob.includes("aid=12345"), false)
  if (gated.mode !== "detail") throw new Error("expected detail")
  assert.equal(gated.days[0]?.items[0]?.affiliateUrl, null)
  assert.equal(gated.basics[0]?.affiliateUrl, null)
}

{
  const { result } = mapGetTrip(dirty, [2])
  assert.equal(result.mode, "detail")
  if (result.mode !== "detail") throw new Error("expected detail")
  assert.equal(result.tasks["activity:palacio de diocleciano"]?.cost, 15)
  assert.equal(result.tasks["stay:hotel split"], undefined)
}

assert.deepEqual(requestedDayIndexes([9, 1, 1, 3, 2, 4, 5, 6, 7, 8], 19), [1, 2, 3, 4, 5, 6, 7])
assert.equal(requestedDayIndexes([1, 2, 3, 4, 5, 6, 7, 8], 19).length, GET_TRIP_DETAIL_DAYS_MAX)
assert.deepEqual(requestedDayIndexes([99], 5), [])

{
  const { result, text } = mapGetTrip(dirty, [99])
  assert.equal(result.mode, "summary")
  assert.match(text, /Pasa days/)
}

console.log("mcp-get-trip: ok")
