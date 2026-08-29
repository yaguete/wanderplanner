import assert from "node:assert/strict"
import type { UserDayItem } from "@/types/itinerary"
import { buildTripBudgetView } from "@/lib/trip-budget"
import { taskKeyForItem } from "@/lib/trip-tasks"
import {
  mapGetTripBudget,
  getTripBudgetOutput,
  MCP_GET_TRIP_BUDGET_COLUMNS,
  tripFromBudgetRow,
  type McpBudgetRow,
} from "./get-trip-budget"

const columns = MCP_GET_TRIP_BUDGET_COLUMNS.split(",").map((c) => c.trim())
assert.equal(columns.includes("share_card"), false)
assert.equal(columns.includes("days"), true)
assert.equal(columns.includes("budget"), true)

const stay: UserDayItem = {
  id: "stay-1",
  sourceItemId: "src-item",
  sourceId: "src-1",
  type: "stay",
  name: "Hotel Denali",
  detail: null,
  sourceAuthor: "Patricia",
  affiliateUrl: "https://www.booking.com/hotel/us/denali.html?aid=1",
}

const row: McpBudgetRow = {
  id: "trip-1",
  name: "Alaska",
  start_date: "2026-09-01",
  end_date: "2026-09-02",
  num_days: 2,
  days: [
    { id: "day-1", label: "", items: [stay] },
    { id: "day-2", label: "", items: [] },
  ],
  basics: [],
  tasks: {
    [taskKeyForItem(stay)]: {
      status: "booked",
      cost: 400,
      cancellable: null,
      notes: null,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  },
  extra_tasks: [],
  budget: { total: 1000, byCategory: {} },
  currency: "EUR",
  num_travelers: 2,
}

const view = buildTripBudgetView(tripFromBudgetRow(row))
const mapped = mapGetTripBudget(row)
assert.equal(mapped.result.counted, view.counted)
assert.equal(mapped.result.currency, "EUR")
assert.equal(mapped.result.verdict.kind, view.verdict.kind)
assert.equal(mapped.result.coverage.priced, view.coverage.priced)
assert.equal(mapped.result.groups[0]?.lines[0]?.title, "Hotel Denali")
assert.equal(mapped.result.groups[0]?.lines[0]?.cost, 400)
assert.match(mapped.text, /Presupuesto/)
getTripBudgetOutput.parse(mapped.result)

const blob = JSON.stringify(mapped.result)
assert.equal(blob.includes("affiliateUrl"), false)
assert.equal(blob.includes("booking.com"), false)
assert.equal(blob.includes("share_card"), false)
assert.equal(blob.includes("pxf.io"), false)

console.log("mcp-get-trip-budget: ok")
