import assert from "node:assert/strict"
import {
  buildAddArticleTripOptions,
  blogHomeUrl,
  buildFeedListRows,
  capFeedHosts,
  classifyReferencePaste,
  extractionFailureMessage,
  faviconUrlForHost,
  favoriteInputsWithoutHost,
  feedEmptyCopy,
  feedHostsAreBlocked,
  feedHostsFromReferences,
  formatPublishedAt,
  hostIsFeedable,
  MAX_REFERENCE_FEED_HOSTS,
  mergeFeedItems,
  parseReferenceSearchItems,
  resolveFeedFilter,
  toggleAllFeedFilter,
  toggleOneFeedFilter,
  tripFeedEligibility,
  tripHasArticle,
  tripsWithArticle,
  type ReferenceFeedItem,
} from "./reference-feed"
import type { FavoriteReference } from "@/lib/db/profile-repo"
import type { Source, Trip } from "@/types/itinerary"

assert.equal(MAX_REFERENCE_FEED_HOSTS, 8)
assert.equal(
  faviconUrlForHost("www.LaCosmopolilla.com"),
  "https://www.google.com/s2/favicons?domain=lacosmopolilla.com&sz=32",
)
assert.equal(
  faviconUrlForHost("sinmapa.net", 128),
  "https://www.google.com/s2/favicons?domain=sinmapa.net&sz=128",
)
assert.equal(hostIsFeedable("lacosmopolilla.com"), true)
assert.equal(hostIsFeedable("sinmapa.net"), true)
assert.equal(hostIsFeedable("booking.com"), false)
assert.equal(hostIsFeedable("instagram.com"), false)

const refs: FavoriteReference[] = [
  { id: "1", label: "La Cosmopolilla", url: "https://lacosmopolilla.com", domain: "lacosmopolilla.com" },
  { id: "2", label: "Sin Mapa", url: "https://www.sinmapa.net", domain: "sinmapa.net" },
  { id: "3", label: "dup", url: "https://lacosmopolilla.com/blog", domain: "lacosmopolilla.com" },
  { id: "4", label: "IG", url: "https://instagram.com/foo", domain: "instagram.com" },
  { id: "5", label: "basura", url: "not-a-url", domain: null },
]
const chips = feedHostsFromReferences(refs)
assert.deepEqual(
  chips.map((c) => c.domain),
  ["lacosmopolilla.com", "sinmapa.net", "instagram.com"],
)
assert.equal(chips[0]?.feedable, true)
assert.equal(chips[2]?.feedable, false)

const withoutCosmo = favoriteInputsWithoutHost(refs, "www.lacosmopolilla.com")
assert.equal(
  withoutCosmo.some((r) => (r.url ?? "").includes("lacosmopolilla")),
  false,
)
assert.ok(withoutCosmo.some((r) => r.label === "Sin Mapa"))
assert.equal(withoutCosmo.length, refs.length - 2)

assert.deepEqual(capFeedHosts(["a", "b", "c", "d", "e", "f", "g", "h", "i"]), [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
])

assert.deepEqual(resolveFeedFilter(["a.com", "b.com"], null), ["a.com", "b.com"])
assert.deepEqual(resolveFeedFilter(["a.com", "b.com"], ["b.com", "gone.com"]), ["b.com"])
assert.deepEqual(resolveFeedFilter(["a.com", "b.com"], []), [])
assert.deepEqual(resolveFeedFilter(["a.com"], ["gone.com"]), ["a.com"])

assert.deepEqual(toggleAllFeedFilter(["a.com", "b.com"], ["a.com"]), ["a.com", "b.com"])
assert.deepEqual(toggleAllFeedFilter(["a.com", "b.com"], ["a.com", "b.com"]), [])
assert.deepEqual(toggleAllFeedFilter(["a.com", "b.com"], []), ["a.com", "b.com"])
assert.deepEqual(toggleOneFeedFilter(["a.com"], "b.com"), ["a.com", "b.com"])
assert.deepEqual(toggleOneFeedFilter(["a.com", "b.com"], "a.com"), ["b.com"])

assert.equal(classifyReferencePaste("", []).kind, "invalid")
assert.equal(classifyReferencePaste("nope", []).kind, "invalid")

const home = classifyReferencePaste("www.sinmapa.net", [])
assert.equal(home.kind, "homepage")
if (home.kind === "homepage") {
  assert.equal(home.domain, "sinmapa.net")
  assert.equal(home.homeUrl, "https://sinmapa.net/")
  assert.equal(home.duplicate, false)
}

const homeDup = classifyReferencePaste("https://www.sinmapa.net/", ["sinmapa.net"])
assert.equal(homeDup.kind, "homepage")
if (homeDup.kind === "homepage") assert.equal(homeDup.duplicate, true)

const article = classifyReferencePaste(
  "https://www.sinmapa.net/que-visitar-en-la-costa-amalfitana/",
  [],
)
assert.equal(article.kind, "article")
if (article.kind === "article") {
  assert.equal(article.domain, "sinmapa.net")
  assert.equal(article.homeUrl, "https://sinmapa.net/")
  assert.equal(article.canFollow, true)
  assert.equal(article.duplicate, false)
}

const articleDup = classifyReferencePaste(
  "https://www.sinmapa.net/que-visitar-en-la-costa-amalfitana/",
  ["sinmapa.net"],
)
assert.equal(articleDup.kind, "article")
if (articleDup.kind === "article") assert.equal(articleDup.duplicate, true)

const ig = classifyReferencePaste("https://www.instagram.com/p/DblDYKZjOhx/", [])
assert.equal(ig.kind, "article")
if (ig.kind === "article") {
  assert.equal(ig.domain, "instagram.com")
  assert.equal(ig.canFollow, false)
}

const igProfile = classifyReferencePaste("https://www.instagram.com/lacosmopolilla", [])
assert.equal(igProfile.kind, "invalid")

function item(patch: Partial<ReferenceFeedItem> & Pick<ReferenceFeedItem, "url" | "host">): ReferenceFeedItem {
  return {
    title: patch.title ?? patch.url,
    publishedAt: patch.publishedAt ?? null,
    imageUrl: null,
    instant: false,
    ...patch,
  }
}

const merged = mergeFeedItems([
  {
    host: "sinmapa.net",
    items: [
      item({
        url: "https://sinmapa.net/b/",
        host: "sinmapa.net",
        title: "B",
        publishedAt: "2026-08-10T10:00:00Z",
      }),
    ],
  },
  {
    host: "lacosmopolilla.com",
    items: [
      item({
        url: "https://lacosmopolilla.com/a/",
        host: "lacosmopolilla.com",
        title: "A",
        publishedAt: "2026-08-15T10:00:00Z",
      }),
      item({
        url: "https://www.sinmapa.net/b/",
        host: "lacosmopolilla.com",
        title: "dup",
        publishedAt: "2026-08-16T10:00:00Z",
      }),
    ],
  },
])
assert.equal(merged.length, 2)
assert.equal(merged[0]?.title, "A")
assert.equal(merged[1]?.title, "B")

assert.equal(blogHomeUrl("www.lacosmopolilla.com"), "https://lacosmopolilla.com/")
assert.equal(blogHomeUrl("sinmapa.net"), "https://sinmapa.net/")

const grouped = buildFeedListRows([
  {
    host: "lacosmopolilla.com",
    label: "La Cosmopolilla",
    items: [
      item({
        url: "https://lacosmopolilla.com/a/",
        host: "lacosmopolilla.com",
        title: "A",
        publishedAt: "2026-08-15T10:00:00Z",
      }),
    ],
  },
  { host: "vacio.com", label: "Vacío", items: [] },
  {
    host: "sinmapa.net",
    label: "Sin Mapa",
    items: [
      item({
        url: "https://sinmapa.net/b/",
        host: "sinmapa.net",
        title: "B",
        publishedAt: "2026-08-10T10:00:00Z",
      }),
    ],
  },
])
assert.equal(grouped.length, 4)
assert.equal(grouped[0]?.type, "article")
assert.equal(grouped[0]?.type === "article" && grouped[0].item.title, "A")
assert.deepEqual(
  grouped[1],
  { type: "more", host: "lacosmopolilla.com", label: "La Cosmopolilla", href: "https://lacosmopolilla.com/" },
)
assert.equal(grouped[2]?.type === "article" && grouped[2].item.title, "B")
assert.equal(grouped[3]?.type === "more" && grouped[3].label, "Sin Mapa")

const formatted = formatPublishedAt("2026-08-15T22:00:00Z")
assert.match(formatted, /15/)
assert.match(formatted, /2026/)
assert.equal(formatPublishedAt(null), "")

assert.equal(
  tripFeedEligibility({ sourceCount: 0, loadingPendingCount: 0, alreadyHasArticle: false }),
  "ok",
)
assert.equal(
  tripFeedEligibility({ sourceCount: 5, loadingPendingCount: 0, alreadyHasArticle: false }),
  "full",
)
assert.equal(
  tripFeedEligibility({ sourceCount: 1, loadingPendingCount: 1, alreadyHasArticle: false }),
  "busy",
)
assert.equal(
  tripFeedEligibility({ sourceCount: 5, loadingPendingCount: 0, alreadyHasArticle: true }),
  "duplicate",
)

const sources: Pick<Source, "url">[] = [{ url: "https://sinmapa.net/b/" } as Source]
assert.equal(tripHasArticle(sources, "https://www.sinmapa.net/b"), true)
assert.equal(tripHasArticle(sources, "https://sinmapa.net/other/"), false)

const trips: Pick<Trip, "name" | "archived" | "sourceIds">[] = [
  { name: "Alaska", archived: false, sourceIds: ["s1"] },
  { name: "Viejo", archived: true, sourceIds: ["s1"] },
]
const byId = new Map<string, Pick<Source, "url">>([["s1", { url: "https://sinmapa.net/b/" }]])
assert.deepEqual(tripsWithArticle(trips, byId, "https://sinmapa.net/b/"), ["Alaska"])

assert.equal(
  buildAddArticleTripOptions(
    [{ id: "t1", name: "Alaska", archived: false, sourceIds: ["s1"] }],
    [{ id: "s1", url: "https://sinmapa.net/b/" }],
    new Set(),
    "https://sinmapa.net/other/",
  )[0]?.eligibility,
  "ok",
)
assert.equal(
  buildAddArticleTripOptions(
    [{ id: "t1", name: "Alaska", archived: false, sourceIds: ["s1"] }],
    [{ id: "s1", url: "https://sinmapa.net/b/" }],
    new Set(),
    "https://sinmapa.net/b/",
  )[0]?.eligibility,
  "duplicate",
)

assert.equal(extractionFailureMessage("max-sources"), "Este viaje ya tiene 5 fuentes.")
assert.equal(extractionFailureMessage("already-loading"), "Este viaje ya está extrayendo una fuente.")

const parsedSearch = parseReferenceSearchItems({
  items: [
    {
      url: "https://sinmapa.net/ruta-islandia/",
      title: "Ruta por Islandia",
      published_at: "2026-08-15T10:00:00Z",
      image_url: null,
      instant: true,
      host: "www.sinmapa.net",
    },
    { title: "sin url" },
    {
      url: "https://lacosmopolilla.com/japon/",
      title: "Japón",
      instant: false,
    },
  ],
})
assert.equal(parsedSearch.length, 2)
assert.equal(parsedSearch[0]?.host, "sinmapa.net")
assert.equal(parsedSearch[0]?.instant, true)
assert.equal(parsedSearch[1]?.host, "lacosmopolilla.com")
assert.deepEqual(parseReferenceSearchItems(null), [])
assert.deepEqual(parseReferenceSearchItems({ results: [] }), [])

assert.equal(feedHostsAreBlocked([]), false)
assert.equal(feedHostsAreBlocked(["empty"]), false)
assert.equal(feedHostsAreBlocked(["unavailable"]), true)
assert.equal(feedHostsAreBlocked(["unavailable", "unavailable"]), true)
assert.equal(feedHostsAreBlocked(["unavailable", "empty"]), false)

const blockedCopy = feedEmptyCopy(["Los Viajes de Claudia"], true)
assert.equal(blockedCopy.title, "No hemos podido leer el listado")
assert.match(blockedCopy.body, /Los Viajes de Claudia/)
const emptyCopy = feedEmptyCopy(["Los Viajes de Claudia"], false)
assert.equal(emptyCopy.title, "Sin artículos recientes")
assert.match(emptyCopy.body, /Los Viajes de Claudia/)

console.log("reference-feed: ok")
