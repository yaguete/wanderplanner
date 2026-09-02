import assert from "node:assert/strict"
import {
  attributionForBlogLanding,
  buildFunnelBody,
  FUNNEL_EVENT_NAMES,
  FUNNEL_GATE_REASONS,
  gateShownStorageKey,
  recordGateShown,
  claimStartOpened,
  classifyOutboundAffiliate,
  classifyOutboundTarget,
  partnerRef,
  postSlugFromSourceUrl,
  recordStartOpenedOnce,
  startOpenedGuard,
  startOpenedStorageKey,
} from "./funnel-analytics"

assert.equal(
  postSlugFromSourceUrl(
    "https://www.lacosmopolilla.com/que-ver-en-austria-ruta-10-dias/",
  ),
  "que-ver-en-austria-ruta-10-dias",
)
assert.equal(
  postSlugFromSourceUrl(
    "https://www.lacosmopolilla.com/que-ver-en-austria-ruta-10-dias",
  ),
  "que-ver-en-austria-ruta-10-dias",
)
assert.equal(
  postSlugFromSourceUrl(
    "https://lacosmopolilla.com/que-ver-en-rumania/?utm_source=x#frag",
  ),
  "que-ver-en-rumania",
)
assert.equal(
  postSlugFromSourceUrl("https://lacosmopolilla.com/Qué-Ver-en-Rumanía/"),
  "que-ver-en-rumania",
)
assert.equal(
  postSlugFromSourceUrl("lacosmopolilla.com/que-ver-en-georgia-itinerario-una-semana"),
  "que-ver-en-georgia-itinerario-una-semana",
)
assert.notEqual(
  postSlugFromSourceUrl("https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias"),
  postSlugFromSourceUrl("https://lacosmopolilla.com/que-ver-en-rumania"),
)
assert.equal(postSlugFromSourceUrl("not a url"), null)
assert.equal(postSlugFromSourceUrl(""), null)

assert.equal(partnerRef("lacosmopolilla"), "lacosmopolilla")
assert.equal(partnerRef("lacosmopolilla target="), "lacosmopolilla")
assert.equal(partnerRef(null), null)
assert.equal(partnerRef(""), null)

assert.equal(
  startOpenedGuard({ authLoading: false, supabaseConfigured: true }),
  true,
)
assert.equal(
  startOpenedGuard({ authLoading: true, supabaseConfigured: true }),
  false,
)
assert.equal(
  startOpenedGuard({ authLoading: false, supabaseConfigured: false }),
  false,
)

function memoryStorage() {
  const mem = new Map<string, string>()
  return {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v)
    },
  }
}

const storage = memoryStorage()
const key = startOpenedStorageKey("lacosmopolilla", "que-ver-en-austria-ruta-10-dias")
assert.equal(claimStartOpened(storage, key), true)
assert.equal(claimStartOpened(storage, key), false)
assert.equal(
  recordStartOpenedOnce({
    ref: "lacosmopolilla",
    sourceUrl: "https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias",
    storage,
  }),
  false,
)

const once = memoryStorage()
assert.equal(
  recordStartOpenedOnce({
    ref: "lacosmopolilla",
    sourceUrl: "https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias/",
    storage: once,
  }),
  true,
)
assert.equal(
  recordStartOpenedOnce({
    ref: "lacosmopolilla",
    sourceUrl: "https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias",
    storage: once,
  }),
  false,
)

const other = startOpenedStorageKey("lacosmopolilla", "que-ver-en-rumania")
assert.equal(claimStartOpened(storage, other), true)

const body = buildFunnelBody("start_opened", {
  ref: "lacosmopolilla",
  postSlug: "que-ver-en-austria-ruta-10-dias",
  meta: { target: "booking" },
})
assert.equal(body.name, "start_opened")
assert.equal(body.ref, "lacosmopolilla")
assert.equal(body.post_slug, "que-ver-en-austria-ruta-10-dias")
assert.equal(body.ref != null, true)
const serialized = JSON.stringify(body)
assert.equal(serialized.includes("://"), false)

const igBody = buildFunnelBody("start_opened", {
  ref: "wp-landing",
  postSlug: "DblDYKZjOhx",
  meta: { sourceKind: "instagram" },
})
assert.equal(igBody.meta.sourceKind, "instagram")
const articleBody = buildFunnelBody("start_opened", {
  ref: "lacosmopolilla",
  postSlug: "que-ver-en-austria-ruta-10-dias",
  meta: { sourceKind: "article" },
})
assert.equal(articleBody.meta.sourceKind, "article")
assert.equal(serialized.includes("@"), false)

const dirty = buildFunnelBody("outbound_click", {
  ref: "lacosmopolilla",
  postSlug: "que-ver-en-austria-ruta-10-dias",
  meta: {
    href: "https://booking.com/hotel?aid=1",
    email: "a@b.c",
    target: "booking",
  },
})
const dirtyJson = JSON.stringify(dirty)
assert.equal(dirtyJson.includes("://"), false)
assert.equal(dirtyJson.includes("@"), false)
assert.equal(dirty.meta.href, undefined)
assert.equal(dirty.meta.email, undefined)
assert.equal(dirty.meta.target, "booking")

const onboarded = buildFunnelBody("account_created", {
  ref: "lacosmopolilla",
  postSlug: "que-ver-en-austria-ruta-10-dias",
  meta: { onboarding: "completed" },
})
assert.equal(onboarded.meta.onboarding, "completed")

assert.deepEqual(
  attributionForBlogLanding("lacosmopolilla", { ref: null, postSlug: null }),
  { ref: "lacosmopolilla", postSlug: null },
)
assert.deepEqual(
  attributionForBlogLanding("lacosmopolilla", {
    ref: "wp-landing",
    postSlug: "que-ver-en-austria-ruta-10-dias",
  }),
  { ref: "lacosmopolilla", postSlug: null },
)
assert.deepEqual(
  attributionForBlogLanding("lacosmopolilla", {
    ref: "lacosmopolilla",
    postSlug: "que-ver-en-austria-ruta-10-dias",
  }),
  { ref: "lacosmopolilla", postSlug: "que-ver-en-austria-ruta-10-dias" },
)

assert.equal(
  classifyOutboundTarget("https://www.booking.com/hotel/es/x.html?aid=1"),
  "booking",
)
assert.equal(
  classifyOutboundTarget("https://skyscanner.pxf.io/gOnd70?u=https://www.skyscanner.es/x"),
  "skyscanner",
)
assert.equal(
  classifyOutboundTarget("https://www.getyourguide.es/madrid-l152/tour"),
  "getyourguide",
)
assert.equal(
  classifyOutboundTarget("https://www.civitatis.com/es/budapest/?aid=1006"),
  "civitatis",
)
assert.equal(
  classifyOutboundTarget("https://www.airbnb.es/s/Edimburgo/homes?checkin=2026-12-28"),
  "airbnb",
)
assert.equal(
  classifyOutboundTarget("https://www.homeexchange.com/es/search-v2/Edimburgo"),
  "homeexchange",
)
// Airbnb y HomeExchange son multi-TLD (.es/.com, .com/.fr/.it): igual que
// getyourguide o civitatis, la marca se reconoce por etiqueta, no por sufijo.
assert.equal(
  classifyOutboundTarget("https://www.airbnb.com/s/Edinburgh/homes"),
  "airbnb",
)
assert.equal(
  classifyOutboundTarget("https://www.homeexchange.fr/search-v2/Edimbourg"),
  "homeexchange",
)
{
  // Misma URL, distinta procedencia: el aid propio coincide con el de la partner.
  const civitatis = "https://www.civitatis.com/es/budapest/?aid=1006"
  assert.equal(classifyOutboundAffiliate(civitatis, "own"), "own")
  assert.equal(classifyOutboundAffiliate(civitatis, "partner"), "partner")
  assert.equal(classifyOutboundAffiliate(civitatis), "none")
}
assert.equal(classifyOutboundAffiliate("https://example.com/x", "partner"), "partner")
assert.equal(classifyOutboundAffiliate("https://example.com/x", "none"), "none")
assert.equal(
  classifyOutboundAffiliate(
    "https://skyscanner.pxf.io/gOnd70?u=https://www.skyscanner.net/g/referrals/v1/flights/day-view",
  ),
  "own",
)
assert.equal(
  classifyOutboundAffiliate(
    "https://www.skyscanner.net/g/referrals/v1/flights/day-view?origin=BCN",
  ),
  "none",
)

console.log("funnel-analytics: ok")

// ── gate_shown: la modal de registro se pone delante de un invitado ──────────
assert.equal(FUNNEL_EVENT_NAMES.includes("gate_shown"), true)

// Los siete motivos deben coincidir con GateReason (registration-gate.tsx) y con
// ALLOWED_META_VALUES["reason"] del backend; si divergen, el evento se descarta
// en silencio y el embudo miente sin avisar.
assert.deepEqual([...FUNNEL_GATE_REASONS], [
  "new-trip",
  "second-source",
  "home",
  "source-limit",
  "assistant-limit",
  "invite",
  "share-plan",
])

const gateBody = buildFunnelBody("gate_shown", {
  ref: "lacosmopolilla",
  postSlug: "que-ver-en-austria-ruta-10-dias",
  meta: { reason: "source-limit" },
})
assert.equal(gateBody.name, "gate_shown")
assert.equal(gateBody.ref, "lacosmopolilla")
assert.equal(gateBody.post_slug, "que-ver-en-austria-ruta-10-dias")
assert.equal(gateBody.meta.reason, "source-limit")
const gateJson = JSON.stringify(gateBody)
assert.equal(gateJson.includes("://"), false)
assert.equal(gateJson.includes("@"), false)

// Una vez por sesión y motivo: la modal se reabre sola a los 3 min y luego
// cada 5, así que sin guarda `gate_shown` contaría insistencias en vez de personas.
const gateStore = new Map<string, string>()
const gateStorage = {
  getItem: (k: string) => gateStore.get(k) ?? null,
  setItem: (k: string, v: string) => void gateStore.set(k, v),
}
assert.equal(recordGateShown("home", gateStorage), true)
assert.equal(recordGateShown("home", gateStorage), false)
assert.equal(recordGateShown("source-limit", gateStorage), true)
assert.equal(gateStore.has(gateShownStorageKey("home")), true)
assert.equal(gateShownStorageKey("home").includes("://"), false)
