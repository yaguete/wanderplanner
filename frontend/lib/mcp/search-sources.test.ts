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
import {
  needsSourceSuggest,
  rankSuggestionsByFavoriteHosts,
  resolveSearchLayer,
  searchSourcesToolOutput,
  searchSourcesToolText,
  searchTravelerFrom,
  slimSuggestHit,
  suggestQueryForSearch,
} from "./search-layers"
import type { SourceSuggestHit } from "@/lib/source-suggest"
import { SITE_URL } from "@/lib/site"
import { applyMcpAffiliateGate } from "./affiliate-gate"

function hit(over: Partial<SearchHit> & Pick<SearchHit, "name">): SearchHit {
  return {
    kind: "item",
    type: "stay",
    days: [],
    consolidated: false,
    sourceId: "src-1",
    sourceAuthor: "A",
    sourceTitle: "T",
    sourceUrl: null,
    wanderplannerUrl: null,
    affiliateUrl: null,
    quote: null,
    ...over,
  }
}

async function main() {
const sourceCols = MCP_SEARCH_SOURCE_COLUMNS.split(",").map((c) => c.trim())
assert.equal(sourceCols.includes("article_html"), false)
assert.equal(sourceCols.includes("items"), true)
assert.equal(sourceCols.includes("url"), true)

const source: SearchSourceRow = {
  id: "src-1",
  url: "https://blog.example/split",
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
  assert.equal(hits[0]?.sourceUrl, "https://blog.example/split")
  assert.equal(hits[0]?.wanderplannerUrl, `${SITE_URL}/trips/t1?tab=stay`)
  assert.equal(JSON.stringify(hits).includes("article_html"), false)
  assert.equal(JSON.stringify(hits).includes("coords"), false)
  searchSourcesOutput.parse({ results: hits })
  const gated = applyMcpAffiliateGate({ results: hits }, false)
  assert.equal(JSON.stringify(gated).includes("booking.com"), false)
  assert.equal(gated.results[0]?.affiliateUrl, null)
  assert.equal(gated.results[0]?.sourceUrl, "https://blog.example/split")
}

{
  const hits = searchSources("dalmacia sim", [source], trip, "basic")
  assert.equal(hits.length, 1)
  assert.equal(hits[0]?.kind, "basic")
  assert.equal(hits[0]?.consolidated, true)
  assert.deepEqual(hits[0]?.days, [])
  assert.equal(hits[0]?.wanderplannerUrl, `${SITE_URL}/trips/t1?tab=basics`)
}

{
  const hits = searchSources("konoba", [source], trip, "food")
  assert.equal(hits.length, 1)
  assert.equal(hits[0]?.consolidated, false)
  assert.equal(hits[0]?.wanderplannerUrl, null)
  assert.equal(hits[0]?.sourceUrl, "https://blog.example/split")
}

{
  const withFood: SearchTripRow = {
    ...trip,
    days: [
      { items: [{ sourceItemId: "food-1", type: "food", name: "Konoba Varoš" }] },
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
  }
  const hits = searchSources("konoba", [source], withFood, "food")
  assert.equal(hits[0]?.consolidated, true)
  assert.equal(hits[0]?.wanderplannerUrl, `${SITE_URL}/trips/t1?tab=activities`)
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
  const hits: SearchHit[] = Array.from({ length: 5 }, (_, i) =>
    hit({ name: `Lugar ${i}`, sourceId: `src-${i}` }),
  )
  assert.deepEqual(pickQuoteSourceIds(hits), ["src-0", "src-1", "src-2"])
}

{
  const pending: SearchHit[] = [
    hit({
      name: "Hotel Málaga Palace",
      days: [2],
      consolidated: true,
      sourceAuthor: "Patricia",
      sourceTitle: "Split en verano",
      quote: "previo",
    }),
  ]
  const out = await attachSearchQuotes(pending, () => new Promise(() => {}), { timeoutMs: 30 })
  assert.equal(out[0]?.quote, null)
}

{
  const pending: SearchHit[] = [
    hit({
      name: "Hotel Málaga Palace",
      days: [2],
      consolidated: true,
      sourceAuthor: "Patricia",
      sourceTitle: "Split en verano",
      quote: "previo",
    }),
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
    hit({
      name: "Hotel Málaga Palace",
      days: [2],
      consolidated: true,
      sourceAuthor: "Patricia",
      sourceTitle: "Split en verano",
    }),
  ]
  const out = await attachSearchQuotes(pending, async () => {
    return "<p>Nos alojamos en Hotel Málaga Palace frente al mar Adriático.</p>"
  })
  assert.ok(out[0]?.quote)
  assert.ok((out[0]?.quote?.length ?? 0) <= SEARCH_QUOTE_MAX)
  assert.equal(JSON.stringify(out).includes("<p>"), false)
}

{
  const tripHits: SearchHit[] = [
    hit({
      name: "Hotel Málaga Palace",
      days: [2],
      consolidated: true,
      sourceAuthor: "Patricia",
      sourceTitle: "Split en verano",
    }),
  ]
  const curated: SourceSuggestHit = {
    url: "https://blog.example/alaska",
    title: "Alaska",
    destination: "Alaska",
    totalDays: 10,
    host: "blog.example",
    origin: "curated",
    instant: false,
  }
  const web: SourceSuggestHit = {
    url: "https://web.example/alaska",
    title: "Web Alaska",
    destination: null,
    totalDays: null,
    host: "web.example",
    origin: "web",
    instant: false,
  }
  assert.equal(needsSourceSuggest(tripHits), false)
  assert.equal(needsSourceSuggest([]), true)

  const tripLayer = resolveSearchLayer(tripHits, [curated, web])
  assert.equal(tripLayer.layer, "trip")
  assert.equal(tripLayer.results.length, 1)
  assert.deepEqual(tripLayer.suggestions, [])

  const curatedLayer = resolveSearchLayer([], [curated, web])
  assert.equal(curatedLayer.layer, "curated")
  assert.deepEqual(curatedLayer.results, [])
  assert.equal(curatedLayer.suggestions.length, 1)
  assert.equal(curatedLayer.suggestions[0]?.origin, "curated")

  const cacheHit: SourceSuggestHit = { ...curated, origin: "cache", host: "cache.example" }
  const cacheLayer = resolveSearchLayer([], [cacheHit, web])
  assert.equal(cacheLayer.layer, "curated")
  assert.equal(cacheLayer.suggestions.some((s) => s.origin === "web"), false)

  const webLayer = resolveSearchLayer([], [web])
  assert.equal(webLayer.layer, "web")
  assert.equal(webLayer.suggestions[0]?.origin, "web")

  const noneLayer = resolveSearchLayer([], [])
  assert.equal(noneLayer.layer, "none")
  // El texto de `none` NOMBRA el viaje. Sin nombre, un tripId equivocado se
  // convierte en una negativa rotunda: pasó de verdad con dos viajes abiertos
  // (buscó Santa Catalina en Orense y dijo que no había fuentes).
  {
    const none = searchSourcesToolText("santa catalina", "none", [], [], 2, "Orense")
    assert.match(none, /Orense/, "dice en qué viaje ha buscado")
    assert.match(none, /list_trips/, "le dice al modelo cómo corregirse")
    assert.doesNotMatch(none, /^no tengo fuentes$/i)
    // Sin nombre no se rompe: cae al genérico de siempre.
    assert.match(searchSourcesToolText("alaska", "none", [], [], 0), /este viaje/i)
  }
  // Y también en la capa `trip`, para que un acierto diga de dónde sale.
  {
    const empty = searchSourcesText("tokyo tower", [], 1, "Japón")
    assert.match(empty, /Japón/)
    assert.match(searchSourcesText("x", [], 0, "Japón"), /El viaje «Japón» no tiene fuentes/)
  }

  const ranked = rankSuggestionsByFavoriteHosts(
    [slimSuggestHit(web), slimSuggestHit(curated)],
    ["blog.example"],
  )
  assert.equal(ranked[0]?.host, "blog.example")
  assert.equal(ranked[1]?.host, "web.example")

  searchSourcesToolOutput.parse({
    layer: "curated",
    results: [],
    suggestions: curatedLayer.suggestions,
    traveler: null,
  })
  searchSourcesOutput.parse({ results: tripHits })

  const traveler = searchTravelerFrom(
    {
      id: "u1",
      displayName: "Ana",
      travelerTypes: ["naturaleza"],
      travelerNotes: "Sin prisas",
      signupReferrer: null,
    },
    [{ id: "r1", label: "Patricia", url: "https://blog.example", domain: "blog.example" }],
    "Ritmo lento",
  )
  assert.deepEqual(traveler?.travelerTypes, ["naturaleza"])
  assert.deepEqual(traveler?.favoriteDomains, ["blog.example"])
  assert.equal(traveler?.expectations, "Ritmo lento")

  assert.equal(suggestQueryForSearch("Alaska", { name: "Viaje", countries: [] }, []), "Alaska")
  assert.equal(suggestQueryForSearch("ab", { name: "Viaje", countries: [] }, []), null)
}

console.log("mcp-search-sources: ok")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
