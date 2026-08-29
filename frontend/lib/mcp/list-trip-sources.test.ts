import assert from "node:assert/strict"
import {
  listTripSourcesOutput,
  listTripSourcesResult,
  mapSourceMeta,
  MCP_LIST_SOURCES_TRIP_COLUMNS,
  MCP_SOURCE_META_COLUMNS,
} from "./list-trip-sources"

const sourceCols = MCP_SOURCE_META_COLUMNS.split(",").map((c) => c.trim())
assert.deepEqual(sourceCols, ["id", "url", "author", "title", "area", "total_days"])
for (const forbidden of ["article_html", "items", "basics", "user_id", "og_image"]) {
  assert.equal(sourceCols.includes(forbidden), false, forbidden)
}

const tripCols = MCP_LIST_SOURCES_TRIP_COLUMNS.split(",").map((c) => c.trim())
assert.deepEqual(tripCols, ["id", "source_ids"])
assert.equal(tripCols.includes("share_card"), false)

{
  const mapped = mapSourceMeta({
    id: "s1",
    url: "https://blog.example/guia",
    author: "Patricia",
    title: "Split en 4 días",
    area: "Dalmacia",
    total_days: 4,
  })
  assert.deepEqual(mapped, {
    id: "s1",
    url: "https://blog.example/guia",
    author: "Patricia",
    title: "Split en 4 días",
    area: "Dalmacia",
    totalDays: 4,
  })
  assert.equal(JSON.stringify(mapped).includes("article"), false)
}

{
  const empty = listTripSourcesResult({ id: "t1", source_ids: [] }, [])
  assert.deepEqual(empty.result.sources, [])
  listTripSourcesOutput.parse(empty.result)
  assert.match(empty.text, /no tiene fuentes/i)
}

{
  const listed = listTripSourcesResult(
    { id: "t1", source_ids: ["s2", "s1"] },
    [
      {
        id: "s1",
        url: "https://a.example",
        author: "A",
        title: "Uno",
        area: null,
        total_days: null,
      },
      {
        id: "s2",
        url: "https://b.example",
        author: "B",
        title: "Dos",
        area: "Split",
        total_days: 3,
      },
    ],
  )
  assert.deepEqual(
    listed.result.sources.map((s) => s.id),
    ["s2", "s1"],
  )
  assert.match(listed.text, /Dos/)
  listTripSourcesOutput.parse(listed.result)
}

console.log("mcp-list-trip-sources: ok")
