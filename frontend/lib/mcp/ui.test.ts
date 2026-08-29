import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { sourceCardFromHit, searchWidgetFromContent, tripWidgetFromContent } from "./ui-views"
import { openExternalUrl } from "./ui-open-link"
import { MCP_WIDGET_MIME, MCP_WIDGET_URI, widgetResourceMeta, widgetToolMeta } from "./ui/resource"
import { MCP_WIDGET_HTML } from "./ui/widget-html"
import { MCP_INSTRUCTIONS } from "./instructions"

async function main() {

{
  const trip = sourceCardFromHit({
    name: "Hotel Split",
    sourceAuthor: "Patricia",
    sourceTitle: "Split en verano",
    quote: "Dormimos en el centro.",
    sourceUrl: "https://blog.example/split",
    wanderplannerUrl: "https://wanderplanner.ai/trips/abc?tab=stay",
  })
  assert.equal(trip.author, "Patricia")
  assert.equal(trip.articleTitle, "Split en verano")
  assert.equal(trip.place, "Hotel Split")
  assert.equal(trip.cta.kind, "trip")
  if (trip.cta.kind === "trip") {
    assert.equal(trip.cta.label, "Verlo en tu viaje")
    assert.ok(trip.cta.href.includes("wanderplanner.ai"))
    assert.ok(trip.cta.href.includes("tab=stay"))
  }
  assert.equal(JSON.stringify(trip).includes("booking"), false)
  assert.equal(JSON.stringify(trip).includes("pxf.io"), false)
  assert.equal(JSON.stringify(trip).includes("afiliad"), false)
}

{
  const article = sourceCardFromHit({
    name: "Konoba Varoš",
    sourceAuthor: "Patricia",
    sourceTitle: "Split en verano",
    quote: null,
    sourceUrl: "https://blog.example/split",
    wanderplannerUrl: null,
  })
  assert.equal(article.cta.kind, "article")
  if (article.cta.kind === "article") {
    assert.equal(article.cta.href, "https://blog.example/split")
    assert.match(article.cta.label, /Patricia/)
  }
}

{
  const mute = sourceCardFromHit({
    name: "Sitio",
    sourceAuthor: "P",
    sourceTitle: "T",
    sourceUrl: null,
    wanderplannerUrl: null,
  })
  assert.equal(mute.cta.kind, "none")
}

{
  const ignored = sourceCardFromHit({
    name: "Hotel",
    wanderplannerUrl: "javascript:alert(1)",
    sourceUrl: "not-a-url",
  })
  assert.equal(ignored.cta.kind, "none")
}

{
  const search = searchWidgetFromContent({
    layer: "trip",
    results: [
      {
        name: "Hotel Split",
        sourceAuthor: "Patricia",
        sourceTitle: "Split",
        wanderplannerUrl: "https://wanderplanner.ai/trips/x?tab=stay",
        affiliateUrl: "https://www.booking.com/hotel/hr/x.html?aid=1",
        cost: 420,
      },
    ],
    suggestions: [],
  })
  assert.equal(search?.kind, "search")
  assert.equal(search?.cards[0]?.cta.kind, "trip")
  assert.equal(JSON.stringify(search).includes("booking"), false)
  assert.equal(JSON.stringify(search).includes("420"), false)
}

{
  const none = searchWidgetFromContent({ layer: "none", results: [], suggestions: [] })
  assert.equal(none?.layer, "none")
  assert.deepEqual(none?.cards, [])
}

{
  const curated = searchWidgetFromContent({
    layer: "curated",
    results: [],
    suggestions: [
      { url: "https://blog.example/split", title: "Split en verano", host: "blog.example" },
    ],
  })
  assert.equal(curated?.layer, "curated")
  assert.equal(curated?.suggestions[0]?.url, "https://blog.example/split")
}

{
  const trip = tripWidgetFromContent({
    mode: "detail",
    name: "Croacia",
    wanderplannerUrl: "https://wanderplanner.ai/trips/x?tab=itinerary",
    days: [
      {
        index: 1,
        label: "Llegada",
        items: [
          { name: "Hotel Split", type: "stay", sourceAuthor: "Patricia", affiliateUrl: "https://booking.com/x" },
        ],
      },
    ],
    tasks: { "stay:hotel split": { cost: 420, status: "booked" } },
  })
  assert.equal(trip?.kind, "trip")
  assert.equal(trip?.mode, "detail")
  if (trip?.mode === "detail") {
    assert.equal(trip.days[0]?.items[0]?.name, "Hotel Split")
    assert.equal(trip.days[0]?.items[0]?.sourceAuthor, "Patricia")
  }
  const blob = JSON.stringify(trip)
  assert.equal(blob.includes("420"), false)
  assert.equal(blob.includes("booking"), false)
  assert.equal(blob.includes("cost"), false)
}

{
  const calls: string[] = []
  const viaOpenai = await openExternalUrl("https://wanderplanner.ai/trips/x", {
    openai: { openExternal: ({ href }) => calls.push(href) },
    fallback: () => {
      throw new Error("no fallback")
    },
  })
  assert.equal(viaOpenai, "openai")
  assert.deepEqual(calls, ["https://wanderplanner.ai/trips/x"])
}

{
  const viaHost = await openExternalUrl("https://wanderplanner.ai/trips/x", {
    openai: {},
    request: async (method, params) => {
      assert.equal(method, "ui/open-link")
      assert.equal(params.url, "https://wanderplanner.ai/trips/x")
      return {}
    },
    fallback: () => {
      throw new Error("no fallback")
    },
  })
  assert.equal(viaHost, "host")
}

{
  const fallbacks: string[] = []
  const denied = await openExternalUrl("https://wanderplanner.ai/trips/x", {
    openai: null,
    request: async () => ({ isError: true }),
    fallback: (href) => fallbacks.push(href),
  })
  assert.equal(denied, "fallback")
  assert.deepEqual(fallbacks, ["https://wanderplanner.ai/trips/x"])
}

{
  const viaWindow = await openExternalUrl("https://blog.example/a", {
    fallback: (href) => {
      assert.equal(href, "https://blog.example/a")
    },
  })
  assert.equal(viaWindow, "fallback")
}

assert.equal(MCP_WIDGET_URI, "ui://wanderplanner/widgets/v1.html")
assert.equal(MCP_WIDGET_MIME, "text/html;profile=mcp-app")
assert.deepEqual(widgetResourceMeta().ui.csp.connectDomains, [])
assert.deepEqual(widgetResourceMeta().ui.csp.resourceDomains, [])
assert.equal(widgetToolMeta().ui.resourceUri, MCP_WIDGET_URI)
assert.equal(widgetToolMeta()["openai/outputTemplate"], MCP_WIDGET_URI)

assert.ok(MCP_INSTRUCTIONS.length > 200)
assert.ok(MCP_INSTRUCTIONS.slice(0, 512).includes("WanderPlanner"))
assert.ok(MCP_INSTRUCTIONS.includes("No inventes reservas ni vuelos"))
assert.equal(MCP_INSTRUCTIONS.includes("nunca un enlace genérico"), false)

{
  const html = MCP_WIDGET_HTML
  assert.ok(html.includes('id="root"'))
  assert.ok(html.includes('type="module"'))
  assert.ok(html.includes("#86675B"))
  assert.equal(html.includes("booking.com"), false)
  assert.equal(html.includes("pxf.io"), false)
  assert.equal(html.includes("mapbox"), false)
  assert.equal(html.includes("lucide"), false)
  assert.equal(html.includes("trip-context"), false)
}

{
  const src = readFileSync(fileURLToPath(new URL("./register-tools.ts", import.meta.url)), "utf8")
  assert.equal(/from ["']\.\/ui\/widget-html["']/.test(src), false)
  assert.ok(src.includes('await import("./ui/widget-html")'))
}

console.log("mcp-ui: ok")
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
