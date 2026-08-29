import assert from "node:assert/strict"
import {
  attachSearchQuotes,
  MCP_SEARCH_SOURCE_COLUMNS,
  pickQuoteSourceIds,
  quoteFromArticle,
  SEARCH_HTML_MAX_CHARS,
  SEARCH_QUOTE_MAX,
  searchSources,
  searchSourcesOutput,
  searchSourcesText,
  type SearchHit,
  type SearchSourceRow,
  type SearchTripRow,
} from "./search-sources"

async function main() {
const sourceCols = MCP_SEARCH_SOURCE_COLUMNS.split(",").map((c) => c.trim())
assert.equal(sourceCols.includes("article_html"), false)
assert.equal(sourceCols.includes("items"), true)

const source: SearchSourceRow = {
  id: "src-1",
  author: "Patricia",
  title: "Split en verano",
  area: "Dalmacia, Croacia",
  items: [
    {
      id: "stay-1",
      type: "stay",
      name: "Hotel Málaga Palace",
      detail: "Centro",
      region: "Split",
      affiliateUrl: "https://www.booking.com/hotel/hr/malaga-palace.html?aid=99",
    },
    {
      id: "food-1",
      type: "food",
      name: "Konoba Varoš",
      affiliateUrl: "n/a",
    },
  ],
  basics: [
    {
      id: "basic-1",
      category: "sim",
      name: "Airalo Croacia",
      affiliateUrl: "https://airalo.example/hr",
    },
  ],
}

const trip: SearchTripRow = {
  id: "t1",
  source_ids: ["src-1"],
  days: [
    { items: [] },
    {
      items: [
        {
          sourceItemId: "stay-1",
          type: "stay",
          name: "Hotel Málaga Palace",
          spanDays: 3,
        },
      ],
    },
    { items: [] },
    { items: [] },
    { items: [] },
  ],
  basics: [{ sourceBasicItemId: "basic-1" }],
}

{
  const hits = searchSources("malaga", [source], trip, "stay")
  assert.equal(hits.length, 1)
  assert.equal(hits[0]?.name, "Hotel Málaga Palace")
  assert.deepEqual(hits[0]?.days, [2, 3, 4])
  assert.equal(hits[0]?.consolidated, true)
  assert.equal(
    hits[0]?.affiliateUrl,
    "https://www.booking.com/hotel/hr/malaga-palace.html?aid=99",
  )
  assert.equal(hits[0]?.sourceAuthor, "Patricia")
  assert.equal(JSON.stringify(hits).includes("article_html"), false)
  assert.equal(JSON.stringify(hits).includes("coords"), false)
  searchSourcesOutput.parse({ results: hits })
}

{
  const hits = searchSources("dalmacia sim", [source], trip, "basic")
  assert.equal(hits.length, 1)
  assert.equal(hits[0]?.kind, "basic")
  assert.equal(hits[0]?.consolidated, true)
  assert.deepEqual(hits[0]?.days, [])
}

{
  const hits = searchSources("tokyo tower", [source], trip)
  assert.deepEqual(hits, [])
  assert.match(searchSourcesText("tokyo tower", hits, 1), /No hay recomendaciones/)
}

{
  const html =
    "<p>Dormimos en el <strong>Hotel Málaga Palace</strong> junto al puerto, un sitio sencillo y bien situado.</p>"
  const quote = quoteFromArticle(html, "Hotel Málaga Palace")
  assert.ok(quote)
  assert.ok(quote.length <= SEARCH_QUOTE_MAX)
  assert.equal(quote.includes("<"), false)
  assert.match(quote, /Málaga Palace/i)
}

{
  const huge = `<p>${"Hotel Málaga Palace ".repeat(50_000)}</p>`
  assert.ok(huge.length > SEARCH_HTML_MAX_CHARS)
  assert.equal(quoteFromArticle(huge, "Hotel Málaga Palace"), null)
}

{
  const hits: SearchHit[] = Array.from({ length: 5 }, (_, i) => ({
    kind: "item",
    name: `Lugar ${i}`,
    type: "stay",
    days: [],
    consolidated: false,
    sourceId: `src-${i}`,
    sourceAuthor: "A",
    sourceTitle: "T",
    affiliateUrl: null,
    quote: null,
  }))
  assert.deepEqual(pickQuoteSourceIds(hits), ["src-0", "src-1", "src-2"])
}

{
  const pending: SearchHit[] = [
    {
      kind: "item",
      name: "Hotel Málaga Palace",
      type: "stay",
      days: [2],
      consolidated: true,
      sourceId: "src-1",
      sourceAuthor: "Patricia",
      sourceTitle: "Split en verano",
      affiliateUrl: null,
      quote: "previo",
    },
  ]
  const out = await attachSearchQuotes(pending, () => new Promise(() => {}), { timeoutMs: 30 })
  assert.equal(out[0]?.quote, null)
}

{
  const pending: SearchHit[] = [
    {
      kind: "item",
      name: "Hotel Málaga Palace",
      type: "stay",
      days: [2],
      consolidated: true,
      sourceId: "src-1",
      sourceAuthor: "Patricia",
      sourceTitle: "Split en verano",
      affiliateUrl: null,
      quote: "previo",
    },
  ]
  let aborted = false
  const out = await attachSearchQuotes(
    pending,
    (_id, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          aborted = true
          const err = new Error("aborted")
          err.name = "AbortError"
          reject(err)
        })
      }),
    { timeoutMs: 30 },
  )
  assert.equal(aborted, true)
  assert.equal(out[0]?.quote, null)
}

{
  const pending: SearchHit[] = [
    {
      kind: "item",
      name: "Hotel Málaga Palace",
      type: "stay",
      days: [2],
      consolidated: true,
      sourceId: "src-1",
      sourceAuthor: "Patricia",
      sourceTitle: "Split en verano",
      affiliateUrl: null,
      quote: null,
    },
  ]
  const out = await attachSearchQuotes(pending, async () => {
    return "<p>Nos alojamos en Hotel Málaga Palace frente al mar Adriático.</p>"
  })
  assert.ok(out[0]?.quote)
  assert.ok((out[0]?.quote?.length ?? 0) <= SEARCH_QUOTE_MAX)
  assert.equal(JSON.stringify(out).includes("<p>"), false)
}

console.log("mcp-search-sources: ok")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
