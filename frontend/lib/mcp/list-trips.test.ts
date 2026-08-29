import assert from "node:assert/strict"
import { listTripsResult, mapTripRows, MCP_TRIP_COLUMNS, type McpTripRow } from "./list-trips"

const columns = MCP_TRIP_COLUMNS.split(",").map((c) => c.trim())
assert.deepEqual(columns, [
  "id",
  "name",
  "archived",
  "start_date",
  "end_date",
  "num_days",
  "countries",
])
for (const forbidden of ["days", "tasks", "share_card", "basics", "source_ids"]) {
  assert.equal(columns.includes(forbidden), false, forbidden)
}

const dirty = {
  id: "t1",
  name: "Lisboa",
  archived: false,
  start_date: "2026-09-01",
  end_date: "2026-09-07",
  num_days: 7,
  countries: ["PT"],
  days: [{ items: [] }],
  tasks: { "stay:hotel": { cost: 120 } },
  share_card: { text: "secreto" },
} as McpTripRow & { days: unknown; tasks: unknown; share_card: unknown }

const mapped = mapTripRows([dirty])
assert.deepEqual(Object.keys(mapped[0]).sort(), [
  "archived",
  "countries",
  "endDate",
  "id",
  "name",
  "numDays",
  "startDate",
])
assert.deepEqual(mapped[0], {
  id: "t1",
  name: "Lisboa",
  archived: false,
  startDate: "2026-09-01",
  endDate: "2026-09-07",
  numDays: 7,
  countries: ["PT"],
})
assert.equal(JSON.stringify(mapped).includes("share_card"), false)
assert.equal(JSON.stringify(mapped).includes("120"), false)

{
  const empty = listTripsResult([])
  assert.deepEqual(empty.trips, [])
  assert.match(empty.text, /wanderplanner\.ai/)
  assert.match(empty.text, /Todavía no tienes ningún viaje/)
}

{
  const onlyArchived = listTripsResult([
    {
      id: "a1",
      name: "Tokio 2024",
      archived: true,
      start_date: "2024-04-01",
      end_date: "2024-04-10",
      num_days: 10,
      countries: ["JP"],
    },
  ])
  assert.equal(onlyArchived.trips.length, 1)
  assert.match(onlyArchived.text, /No tienes viajes activos/)
  assert.match(onlyArchived.text, /archivado/)
  assert.match(onlyArchived.text, /Tokio 2024/)
  assert.doesNotMatch(onlyArchived.text, /Todavía no tienes ningún viaje/)
}

{
  const mixed = listTripsResult([
    {
      id: "n1",
      name: "Oporto",
      archived: false,
      start_date: null,
      end_date: null,
      num_days: 3,
      countries: [],
    },
    {
      id: "a1",
      name: "Roma",
      archived: true,
      start_date: null,
      end_date: null,
      num_days: null,
      countries: ["IT"],
    },
  ])
  assert.match(mixed.text, /Tus viajes/)
  assert.match(mixed.text, /Oporto/)
  assert.match(mixed.text, /Archivados/)
  assert.match(mixed.text, /Roma/)
}

console.log("mcp-list-trips: ok")
