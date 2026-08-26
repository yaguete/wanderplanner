import assert from "node:assert/strict"
import type { Source, Trip } from "@/types/itinerary"
import type { SourceSuggestHit, SourceSuggestResponse } from "./source-suggest"
import { sourceMatchKey } from "./trip-sources"
import {
  fetchTripSourceSuggestions,
  filterUnusedHits,
  foldSuggestText,
  getCachedTripSuggestions,
  resetTripSourceSuggestionsCache,
  sanitizeSuggestQuery,
  tripSuggestQuery,
  tripSuggestSignature,
} from "./trip-source-suggestions"

function baseTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-sug",
    name: "Viaje",
    countries: [],
    startDate: null,
    endDate: null,
    numDays: 7,
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
    budget: null,
    shareCard: null,
    archived: false,
    ...overrides,
  }
}

function source(overrides: Partial<Source> = {}): Source {
  return {
    id: "src-1",
    url: "https://example.com/post",
    author: "blog",
    title: "Guía",
    area: null,
    totalDays: null,
    items: [],
    basics: [],
    articleHtml: "",
    ogImage: null,
    ...overrides,
  }
}

function hit(url: string, title = url): SourceSuggestHit {
  return {
    url,
    title,
    destination: "Austria",
    totalDays: null,
    host: "lacosmopolilla.com",
    origin: "cache",
    instant: true,
  }
}

resetTripSourceSuggestionsCache()

// ── tripSuggestQuery ─────────────────────────────────────────────────────────

{
  const one = tripSuggestQuery(baseTrip({ countries: ["AT"] }), [])
  assert.equal(one?.query, "Austria")
  assert.equal(one?.fingerprint, foldSuggestText("Austria"))
}

{
  const two = tripSuggestQuery(baseTrip({ countries: ["UG", "KE"] }), [])
  assert.equal(two?.query, "Uganda y Kenia")
}

{
  const three = tripSuggestQuery(baseTrip({ name: "Viaje África 2026", countries: ["UG", "KE", "TZ"] }), [])
  assert.equal(three?.query, "Uganda y Kenia")
  assert.notEqual(three?.query, "Viaje África 2026")
}

{
  const fromArea = tripSuggestQuery(baseTrip({ name: "Viaje" }), [
    source({ area: "Valle Sagrado de los Incas, Cusco" }),
  ])
  assert.equal(fromArea?.query, "Valle Sagrado de los Incas")
}

{
  // Ciudad en el área: no promocionar al país inferido («Spain» → ES).
  const city = tripSuggestQuery(baseTrip({ name: "Navidades en Cuenca 2026" }), [
    source({ area: "Cuenca, Spain" }),
  ])
  assert.equal(city?.query, "Cuenca")
  assert.notEqual(city?.query, "España")
}

{
  const cityBeatsExplicitCountry = tripSuggestQuery(
    baseTrip({ name: "Viaje", countries: ["ES"] }),
    [source({ area: "Cuenca, España" })],
  )
  assert.equal(cityBeatsExplicitCountry?.query, "Cuenca")
}

{
  const countryArticle = tripSuggestQuery(baseTrip({ name: "Viaje" }), [
    source({ area: "España" }),
  ])
  assert.equal(countryArticle?.query, "España")
}

{
  const fromName = tripSuggestQuery(baseTrip({ name: "Uganda", countries: [] }), [])
  assert.equal(fromName?.query, "Uganda")
}

{
  assert.equal(tripSuggestQuery(baseTrip({ name: "Viaje" }), []), null)
}

{
  const tooShort = tripSuggestQuery(baseTrip({ name: "??" }), [])
  assert.equal(tooShort, null)
  assert.equal(sanitizeSuggestQuery("ab"), null)
  assert.equal(sanitizeSuggestQuery("viet*nam,()"), "vietnam")
}

{
  const a = tripSuggestQuery(baseTrip({ name: "Perú" }), [])
  const b = tripSuggestQuery(baseTrip({ name: "peru" }), [])
  const c = tripSuggestQuery(baseTrip({ name: "PERU  " }), [])
  assert.equal(a?.fingerprint, b?.fingerprint)
  assert.equal(b?.fingerprint, c?.fingerprint)
}

{
  const before = tripSuggestQuery(baseTrip({ countries: ["AT"], name: "Austria" }), [])
  const renamed = tripSuggestQuery(baseTrip({ countries: ["AT"], name: "Alpes 2026" }), [])
  assert.equal(before?.fingerprint, renamed?.fingerprint)
}

{
  const at = tripSuggestQuery(baseTrip({ countries: ["AT"] }), [])
  const jp = tripSuggestQuery(baseTrip({ countries: ["JP"] }), [])
  assert.notEqual(at?.fingerprint, jp?.fingerprint)
}

{
  const sigA = tripSuggestSignature(baseTrip({ countries: ["AT"], name: "x" }), [])
  const sigB = tripSuggestSignature(baseTrip({ countries: ["AT"], name: "x" }), [])
  const sigC = tripSuggestSignature(baseTrip({ countries: ["JP"], name: "x" }), [])
  assert.equal(sigA, sigB)
  assert.notEqual(sigA, sigC)
}

// ── filterUnusedHits ─────────────────────────────────────────────────────────

{
  const hits = [
    hit("https://lacosmopolilla.com/austria/"),
    hit("https://www.lacosmopolilla.com/austria"),
    hit("https://viajeroscallejeros.com/austria"),
  ]
  const visible = filterUnusedHits(hits, ["http://lacosmopolilla.com/austria"])
  assert.equal(visible.length, 1)
  assert.ok(visible[0]!.url.includes("viajeroscallejeros"))
}

{
  const hits = [
    hit("https://www.x.com/a"),
    hit("http://x.com/a/"),
    hit("https://x.com/b"),
  ]
  const visible = filterUnusedHits(hits, [])
  assert.equal(visible.length, 2)
}

{
  const hits = [hit("https://blog.com/a"), hit("https://blog.com/b")]
  const hidden = filterUnusedHits(hits, ["https://blog.com/a"])
  assert.equal(hidden.length, 1)
  const back = filterUnusedHits(hits, [])
  assert.equal(back.length, 2)
}

assert.equal(sourceMatchKey("https://www.x.com/a"), sourceMatchKey("http://x.com/a/"))

async function runAsyncCacheTests() {
  resetTripSourceSuggestionsCache()
  {
    let calls = 0
    const fetcher = async (): Promise<SourceSuggestResponse> => {
      calls += 1
      return { results: [hit("https://blog.com/austria")], needCaptcha: false }
    }
    const first = await fetchTripSourceSuggestions("Austria", "austria", { fetcher })
    const second = await fetchTripSourceSuggestions("Austria", "austria", { fetcher })
    assert.equal(calls, 1)
    assert.equal(first?.length, 1)
    assert.deepEqual(second, first)
    assert.equal(getCachedTripSuggestions("austria")?.length, 1)
  }

  resetTripSourceSuggestionsCache()
  {
    let calls = 0
    const fetcher = async (): Promise<SourceSuggestResponse> => {
      calls += 1
      await new Promise((r) => setTimeout(r, 20))
      return { results: [hit("https://blog.com/austria")], needCaptcha: false }
    }
    const [a, b] = await Promise.all([
      fetchTripSourceSuggestions("Austria", "austria", { fetcher }),
      fetchTripSourceSuggestions("Austria", "austria", { fetcher }),
    ])
    assert.equal(calls, 1)
    assert.deepEqual(a, b)
  }

  resetTripSourceSuggestionsCache()
  {
    let calls = 0
    const fetcher = async (): Promise<SourceSuggestResponse> => {
      calls += 1
      return { results: [], needCaptcha: false }
    }
    const empty = await fetchTripSourceSuggestions("Zzzlandia", "zzzlandia", { fetcher })
    assert.deepEqual(empty, [])
    const again = await fetchTripSourceSuggestions("Zzzlandia", "zzzlandia", { fetcher })
    assert.equal(calls, 1)
    assert.deepEqual(again, [])
  }

  resetTripSourceSuggestionsCache()
  {
    const ac = new AbortController()
    ac.abort()
    const fetcher = async (
      _q: string,
      opts?: { signal?: AbortSignal },
    ): Promise<SourceSuggestResponse> => {
      if (opts?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError")
      }
      return { results: [hit("https://blog.com/old")], needCaptcha: false }
    }
    let threw = false
    try {
      await fetchTripSourceSuggestions("Austria", "austria", { fetcher, signal: ac.signal })
    } catch (e) {
      threw = e instanceof DOMException && e.name === "AbortError"
    }
    assert.equal(threw, true)
    assert.equal(getCachedTripSuggestions("austria"), undefined)
  }

  resetTripSourceSuggestionsCache()
  {
    const seenFresh: boolean[] = []
    const fetcher = async (
      _q: string,
      opts?: { fresh?: boolean },
    ): Promise<SourceSuggestResponse> => {
      seenFresh.push(opts?.fresh === true)
      return { results: [hit("https://blog.com/austria")], needCaptcha: false }
    }
    await fetchTripSourceSuggestions("Austria", "austria", { fetcher })
    await fetchTripSourceSuggestions("Austria", "austria", { fetcher, bypassCache: true })
    assert.deepEqual(seenFresh, [false, true])
  }
}

void runAsyncCacheTests()
  .then(() => {
    console.log("trip-source-suggestions: ok")
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
