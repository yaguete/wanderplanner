import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  dayDateLabel,
  sourceCardFromHit,
  searchWidgetFromContent,
  tripWidgetFromContent,
  widgetModelFromContent,
} from "./ui-views"
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
  const wrapped = widgetModelFromContent({
    structuredContent: {
      mode: "detail",
      name: "Edimburgo",
      wanderplannerUrl: "https://wanderplanner.ai/trips/x?tab=itinerary",
      days: [{ index: 1, label: "Fin de año", items: [{ name: "Hogmanay", type: "activity" }] }],
    },
  })
  assert.equal(wrapped?.kind, "trip")
  assert.equal(wrapped?.name, "Edimburgo")
}

{
  const viaGlobals = widgetModelFromContent({
    globals: {
      toolOutput: {
        mode: "summary",
        name: "Edimburgo",
        days: [{ index: 1, label: "Fin de año", itemNames: ["Hogmanay"] }],
      },
    },
  })
  assert.equal(viaGlobals?.kind, "trip")
  if (viaGlobals?.mode === "summary") {
    assert.equal(viaGlobals.days[0]?.itemNames[0], "Hogmanay")
  }
}

{
  assert.equal(widgetModelFromContent({ protocolVersion: "2026-01-26" }), null)
}

{
  const asJson = widgetModelFromContent(
    JSON.stringify({
      mode: "detail",
      name: "Edimburgo",
      days: [{ index: 1, label: "Fin de año", items: [{ name: "Hogmanay", type: "activity" }] }],
    }),
  )
  assert.equal(asJson?.kind, "trip")
  assert.equal(asJson?.name, "Edimburgo")
}

{
  const callResult = widgetModelFromContent({
    content: [{ type: "text", text: "Edimburgo · 7 días" }],
    structuredContent: {
      mode: "detail",
      name: "Edimburgo",
      days: [{ index: 1, label: "Fin de año", items: [{ name: "Hogmanay", type: "activity" }] }],
    },
    toolOutput: null,
  })
  assert.equal(callResult?.kind, "trip")
  assert.equal(callResult?.name, "Edimburgo")
}

{
  const fromText = widgetModelFromContent({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          mode: "summary",
          name: "Edimburgo",
          days: [{ index: 1, label: "Fin de año", itemNames: ["Hogmanay"] }],
        }),
      },
    ],
  })
  assert.equal(fromText?.kind, "trip")
  if (fromText?.mode === "summary") {
    assert.equal(fromText.days[0]?.itemNames[0], "Hogmanay")
  }
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

// ChatGPT (runtime Apps SDK) solo reconoce como plantilla los `ui://…` con
// `text/html+skybridge`; con el MIME de la spec MCP Apps devolvía
// «Failed to fetch template». Y la URI va SIN versión: cambiarla rompe la
// caché de plantillas del host.
assert.equal(MCP_WIDGET_URI, "ui://wanderplanner/widgets/main.html")
assert.equal(MCP_WIDGET_MIME, "text/html+skybridge")
assert.equal(MCP_WIDGET_URI.includes("/v"), false, "la URI del widget no se versiona")
assert.deepEqual(widgetResourceMeta().ui.csp.connectDomains, [])
assert.deepEqual(widgetResourceMeta().ui.csp.resourceDomains, [])
// Metadatos en las dos familias: `ui.*` (spec) y `openai/*` (runtime de hoy).
assert.equal(widgetResourceMeta()["openai/widgetPrefersBorder"], true)
assert.deepEqual(widgetResourceMeta()["openai/widgetCSP"].connect_domains, [])
assert.deepEqual(widgetResourceMeta()["openai/widgetCSP"].resource_domains, [])
assert.equal(widgetToolMeta().ui.resourceUri, MCP_WIDGET_URI)
assert.equal(widgetToolMeta()["openai/outputTemplate"], MCP_WIDGET_URI)

assert.ok(MCP_INSTRUCTIONS.length > 200)
assert.ok(MCP_INSTRUCTIONS.slice(0, 512).includes("WanderPlanner"))
assert.ok(MCP_INSTRUCTIONS.includes("No inventes reservas ni vuelos"))
assert.ok(MCP_INSTRUCTIONS.includes("no llames get_trip ni search_sources dos veces"))
assert.equal(MCP_INSTRUCTIONS.includes("nunca un enlace genérico"), false)

{
  const html = MCP_WIDGET_HTML
  assert.ok(html.includes('id="root"'))
  assert.ok(html.includes('type="module"'))
  assert.ok(html.includes("#86675B"))
  assert.ok(html.includes("widget-head"))
  assert.ok(html.includes("timeline"))
  assert.ok(html.includes("ui/initialize"))
  assert.ok(html.includes("ui/notifications/initialized"))
  assert.ok(html.includes("ui/notifications/tool-result"))
  assert.ok(html.includes("openai:set_globals"))
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


// --- dayDateLabel: «Día 4» no responde a «el último día del año»; la fecha sí ---
{
  // Escocia en Navidades arranca el 28 dic 2026: el día 4 es Nochevieja.
  assert.equal(dayDateLabel("2026-12-28", 4), "jue 31 dic")
  assert.equal(dayDateLabel("2026-12-28", 1), "lun 28 dic", "el día 1 es la fecha de inicio")
  assert.equal(dayDateLabel("2026-12-28", 5), "vie 1 ene", "cruza el año sin romperse")
  // Sin fechas en el viaje no se inventa nada: solo se pinta el número de día.
  assert.equal(dayDateLabel(null, 3), null)
  assert.equal(dayDateLabel("", 3), null)
  assert.equal(dayDateLabel("mañana", 3), null, "solo YYYY-MM-DD")
  assert.equal(dayDateLabel("2026-12-28", 0), null)
  assert.equal(dayDateLabel("2026-12-28", 1.5), null)
}

// El modelo del viaje arrastra startDate para poder fechar los días.
{
  const model = tripWidgetFromContent({
    mode: "detail",
    name: "Escocia en Navidades",
    startDate: "2026-12-28",
    wanderplannerUrl: "https://wanderplanner.ai/trips/abc",
    days: [{ index: 4, label: "Edimburgo", items: [] }],
  })
  assert.ok(model && model.kind === "trip")
  assert.equal(model.startDate, "2026-12-28")
}

console.log("mcp-ui: ok")
}

void main().catch((err) => {
  console.error(err)
  process.exit(1)
})
