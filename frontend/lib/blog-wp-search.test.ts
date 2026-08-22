import assert from "node:assert/strict"
import { getBlogLanding } from "./blog-landings"
import {
  decodeHtmlEntities,
  isDeniedGuideSlug,
  mapWpPostToHit,
  rankScore,
  selectBlogHits,
  stripHtml,
  type WpPost,
} from "./blog-wp-search"
import { parseRefParam } from "./partner-trip"
import { sourceMatchKey } from "./trip-sources"

const blog = getBlogLanding("lacosmopolilla")
assert.ok(blog)
assert.equal(blog.slug, "lacosmopolilla")
assert.equal(parseRefParam(blog.slug), blog.slug)
assert.equal(blog.host, "lacosmopolilla.com")
assert.equal(blog.enabled, true)

const dropSlugs = [
  "opiniones-heymondo-seguros-de-viaje",
  "descuento-en-heymondo-seguros",
  "seguro-para-viajar-a-islandia-cual-elijo",
  "mejor-seguro-de-viaje-para-republica-checa",
  "internet-en-japon-la-mejor-esim",
  "internet-en-canada",
]
for (const slug of dropSlugs) {
  assert.equal(isDeniedGuideSlug(slug), true, slug)
}

const keepSlugs = [
  "ruta-islandia-en-10-dias",
  "es-seguro-viajar-a-sudafrica",
  "que-ver-en-el-norte-de-islandia",
]
for (const slug of keepSlugs) {
  assert.equal(isDeniedGuideSlug(slug), false, slug)
}

assert.equal(
  decodeHtmlEntities("Guía y Consejos clave (2026) &#x2b50;"),
  "Guía y Consejos clave (2026) ⭐",
)
assert.equal(
  stripHtml("<p>Islandia es fuego [&hellip;]</p>\n"),
  "Islandia es fuego …",
)

function post(slug: string, extra?: Partial<WpPost>): WpPost {
  return {
    slug,
    link: `https://lacosmopolilla.com/${slug}/`,
    title: { rendered: slug.replace(/-/g, " ") },
    excerpt: { rendered: `<p>Extracto de ${slug}</p>` },
    categories: [26],
    ...extra,
  }
}

const mixed: WpPost[] = [
  post("opiniones-heymondo-seguros-de-viaje", { categories: [41, 39] }),
  post("descuento-en-heymondo-seguros", { categories: [41, 4133, 39] }),
  post("seguro-para-viajar-a-islandia-cual-elijo", { categories: [26, 33] }),
  post("mejor-seguro-de-viaje-para-republica-checa", { categories: [26, 37] }),
  post("internet-en-japon-la-mejor-esim", { categories: [2, 41, 2949] }),
  post("internet-en-canada", { categories: [9, 3797] }),
  post("ruta-islandia-en-10-dias", {
    title: { rendered: "Ruta por Islandia en 10 días" },
  }),
  post("es-seguro-viajar-a-sudafrica", {
    title: { rendered: "¿Es seguro viajar a Sudáfrica?" },
  }),
  post("que-ver-en-el-norte-de-islandia", {
    title: { rendered: "Qué ver en el norte de Islandia" },
  }),
  post("libres-y-felices-mujeres-que-viajan-solas", { categories: [41] }),
]

const selected = selectBlogHits(
  mixed,
  "islandia",
  blog.host,
  blog.excludeCategoryIds,
)
assert.equal(
  selected.some((h) => h.url.includes("heymondo")),
  false,
)
assert.equal(
  selected.some((h) => h.url.includes("seguro-para-viajar")),
  false,
)
assert.equal(
  selected.some((h) => h.url.includes("esim") || h.url.includes("internet-en")),
  false,
)
assert.ok(selected.some((h) => h.url.includes("ruta-islandia-en-10-dias")))
assert.ok(selected.some((h) => h.url.includes("que-ver-en-el-norte-de-islandia")))
assert.equal(
  selected.some((h) => h.url.includes("libres-y-felices")),
  false,
)

const sudafrica = selectBlogHits(
  mixed,
  "sudafrica",
  blog.host,
  blog.excludeCategoryIds,
)
assert.ok(sudafrica.some((h) => h.url.includes("es-seguro-viajar-a-sudafrica")))

assert.ok(rankScore("japon", "que-ver-en-japon-en-20-dias", "Qué ver en Japón") < 2)
assert.ok(
  rankScore("japon", "que-ver-en-japon-en-20-dias", "Qué ver en Japón") <
    rankScore("japon", "petra-en-jordania", "Petra en Jordania"),
)

const ranked = selectBlogHits(
  [
    post("petra-en-jordania", { title: { rendered: "Petra en Jordania" } }),
    post("que-ver-en-japon-en-20-dias", {
      title: { rendered: "Qué ver en Japón en 20 días" },
    }),
  ],
  "japon",
  blog.host,
  blog.excludeCategoryIds,
)
assert.equal(ranked[0]?.url.includes("japon"), true)

const emojiUrl =
  "https://lacosmopolilla.com/guia-para-viajar-a-islandia-por-libre-%e2%ad%90-la-isla-del-hielo-y-el-fuego/"
const params = new URLSearchParams({ source: emojiUrl })
assert.equal(sourceMatchKey(params.get("source") ?? ""), sourceMatchKey(emojiUrl))

const emojiHit = mapWpPostToHit(
  {
    slug: "guia-para-viajar-a-islandia-por-libre-%e2%ad%90-la-isla-del-hielo-y-el-fuego",
    link: emojiUrl,
    title: { rendered: "Viajar a Islandia por libre: Guía y Consejos clave (2026) &#x2b50;" },
    excerpt: { rendered: "<p>¿Vas a viajar a Islandia? [&hellip;]</p>\n" },
    categories: [4133, 26, 33],
  },
  blog.host,
)
assert.ok(emojiHit)
assert.equal(emojiHit.url, emojiUrl)
assert.equal(sourceMatchKey(emojiHit.url), sourceMatchKey(emojiUrl))
assert.equal(emojiHit.title.includes("⭐"), true)
assert.equal(emojiHit.title.includes("&#"), false)
assert.equal(emojiHit.destination?.includes("<"), false)
assert.equal(emojiHit.host, "lacosmopolilla.com")
assert.equal(emojiHit.origin, "curated")
assert.equal(emojiHit.instant, false)

console.log("blog-wp-search: ok")
