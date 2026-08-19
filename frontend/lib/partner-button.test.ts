import assert from "node:assert/strict"
import { BRAND_COLOR, BRAND_INK } from "@/components/brand-mark"
import {
  PARTNER_BANNER_DEFAULT_EMPHASIS,
  PARTNER_BANNER_DEFAULT_TEXT,
  bannerAriaLabel,
  buildEmbedSnippet,
  buildStartUrl,
  cleanSourceUrl,
  normalizeRefSlug,
  splitBannerCopy,
} from "./partner-button"
import type { PartnerButtonVariant, PartnerEmbedKind } from "./partner-button"

const HREF = "https://wanderplanner.ai/start?source=https%3A%2F%2Fblog.com%2Fx&ref=blog"

const COMBOS: Array<[PartnerEmbedKind, PartnerButtonVariant]> = [
  ["banner", "color"],
  ["banner", "negative"],
  ["cta", "color"],
  ["cta", "negative"],
]

/** Estilos inline de un snippet, sin el bloque <style>. */
function inlineStyles(snippet: string): string[] {
  return [...snippet.matchAll(/ style="([^"]*)"/g)].map((m) => m[1])
}

/**
 * HTML interior del texto del banner: el primer `<span>` del `<a>`. No lleva spans
 * anidados, así que acaba en el primer `</span>` (el chip viene después).
 */
function bannerCopyOf(snippet: string): string {
  const tras = snippet.slice(snippet.indexOf("><span") + 1)
  return tras.slice(tras.indexOf(">") + 1, tras.indexOf("</span>"))
}

for (const [kind, variant] of COMBOS) {
  const snippet = buildEmbedSnippet({ href: HREF, variant, kind })
  const where = `${kind}/${variant}`

  // wpautop convierte cada salto de línea del contenido en <br />: dentro de un <a>
  // en flex eso descuadra el embed. El snippet va en una sola línea.
  assert.equal(snippet.includes("\n"), false, `${where}: el snippet debe ir en una línea`)

  const styleBlock = snippet.match(/<style>(.*?)<\/style>/)?.[1] ?? ""
  const styles = inlineStyles(snippet)
  assert.ok(styles.length > 3, `${where}: faltan estilos inline`)

  // Un tema con reglas !important sobre los enlaces del contenido gana a un estilo
  // inline normal, así que todo va marcado. Lo único que puede quedar sin marcar es
  // lo que nuestro propio <style> necesita pisar: un !important inline también gana
  // a la hoja de estilo del snippet.
  for (const style of styles) {
    for (const decl of style.split(";").map((d) => d.trim()).filter(Boolean)) {
      if (decl.endsWith("!important")) continue
      const prop = decl.slice(0, decl.indexOf(":"))
      assert.ok(
        new RegExp(`[{;]${prop}:`).test(styleBlock),
        `${where}: "${decl}" va sin !important pero el <style> no pisa ${prop}`,
      )
    }
  }

  // Y al revés, las dos mitades: lo que el <style> pisa va sin !important en el
  // inline y con !important en la regla (un inline normal ya gana a la hoja).
  for (const prop of ["background", "flex-wrap", "flex"]) {
    const regla = styleBlock.match(new RegExp(`[{;]${prop}:([^;}]+)`))
    if (!regla) continue
    assert.ok(
      regla[1].includes("!important"),
      `${where}: el <style> pisa ${prop} sin !important y pierde contra el inline`,
    )
    assert.ok(
      styles.some((s) => new RegExp(`(^|;)${prop}:[^;!]+;`).test(s)),
      `${where}: el <style> pisa ${prop} pero el inline lo lleva con !important`,
    )
  }
  assert.ok(styleBlock.includes("content:none"), `${where}: falta el reset de pseudoelementos`)
  assert.equal(
    styleBlock.includes(":hover"),
    variant === "color",
    `${where}: hover solo en la variante color`,
  )
  assert.equal(
    styleBlock.includes("@media"),
    kind === "banner",
    `${where}: apilado móvil solo en el banner`,
  )

  // El <a> abre la pestaña nueva y lleva la clase que engancha el <style>.
  // `&` del query → `&amp;` en el atributo, o un editor se come target/rel dentro de ?ref=.
  assert.ok(snippet.includes(`href="${HREF.replaceAll("&", "&amp;")}"`), `${where}: href`)
  assert.ok(!snippet.includes("&ref="), `${where}: & crudo delante de ref`)
  assert.ok(snippet.includes('target="_blank"'), `${where}: target`)
  assert.ok(snippet.includes('rel="noopener noreferrer"'), `${where}: rel`)
  assert.ok(/<a [^>]*class="wp-wanderplanner-/.test(snippet), `${where}: clase del <a>`)
}

// El salto de línea y la negrita no pueden depender de que sobrevivan los `style`
// de los span anidados: un editor visual se los come y sale «ayudapara» pegado.
const banner = buildEmbedSnippet({ href: HREF, variant: "color", kind: "banner" })
assert.ok(
  banner.includes(`${PARTNER_BANNER_DEFAULT_TEXT.split("\n")[0]}<br>`),
  "banner: salto con <br>",
)
assert.ok(
  banner.includes(`>${PARTNER_BANNER_DEFAULT_EMPHASIS}</strong>`),
  "banner: énfasis con <strong>",
)
const desnudo = banner.replace(/ style="[^"]*"/g, "")
assert.ok(!desnudo.includes("ayudapara"), "banner: sin estilos no se pegan las líneas")
assert.ok(desnudo.includes("<strong"), "banner: sin estilos la negrita sigue")

// El marrón del embed es la tinta del lockup (5.1:1 sobre blanco), no el acento
// claro, que está documentado como "no usar para texto" (3.6:1).
for (const kind of ["banner", "cta"] as const) {
  const color = buildEmbedSnippet({ href: HREF, variant: "color", kind })
  assert.ok(color.includes(BRAND_INK), `${kind}: usa BRAND_INK`)
  assert.ok(!color.includes(BRAND_COLOR), `${kind}: no usa el acento claro`)
}

// Texto editable del banner: saltos → <br>, negrita donde aparece, y nada de HTML
// del bloguero colándose en el snippet.
const custom = buildEmbedSnippet({
  href: HREF,
  kind: "banner",
  text: "Ruta por <Tenerife>\nen 7 días & noches",
  emphasis: "7 días",
})
assert.ok(custom.includes("Ruta por &lt;Tenerife&gt;<br>en "), "custom: escapa y parte")
assert.ok(custom.includes(">7 días</strong>"), "custom: negrita en el fragmento")
assert.ok(custom.includes("&amp; noches"), "custom: escapa el ampersand")
assert.ok(!custom.includes("<Tenerife>"), "custom: no inyecta etiquetas")
assert.equal(custom.includes("\n"), false, "custom: sigue en una línea")

// Énfasis que ya no aparece en el texto: no se resalta nada, y no se rompe.
const sinNegrita = buildEmbedSnippet({
  href: HREF,
  kind: "banner",
  text: "Otro mensaje",
  emphasis: "planificar esta ruta",
})
assert.equal(bannerCopyOf(sinNegrita), "Otro mensaje", "sin coincidencia: texto plano")

// Solo la primera aparición, y el énfasis no cruza saltos de línea.
assert.deepEqual(splitBannerCopy("hola mundo\nhola", "hola"), [
  [
    { text: "hola", strong: true },
    { text: " mundo", strong: false },
  ],
  [{ text: "hola", strong: false }],
])
assert.deepEqual(splitBannerCopy("uno\ndos", ""), [
  [{ text: "uno", strong: false }],
  [{ text: "dos", strong: false }],
])
assert.deepEqual(splitBannerCopy("a\nb", "a\nb"), [
  [{ text: "a", strong: false }],
  [{ text: "b", strong: false }],
])

// El nombre accesible sigue al texto visible, en una línea y con la marca.
assert.equal(
  bannerAriaLabel("Ruta por Tenerife\nen 7 días"),
  "Ruta por Tenerife en 7 días — Prueba WanderPlanner",
)
assert.equal(bannerAriaLabel("  \n "), "Prueba WanderPlanner")
assert.ok(
  buildEmbedSnippet({ href: HREF, kind: "banner", text: 'Con "comillas"' }).includes(
    'aria-label="Con &quot;comillas&quot; — Prueba WanderPlanner"',
  ),
  "aria-label escapado",
)

const cta = buildEmbedSnippet({ href: HREF, variant: "color", kind: "cta" })
assert.ok(/<\/span><br><span/.test(cta), "cta: kicker y logotipo separados por <br>")
assert.ok(
  !cta.replace(/ style="[^"]*"/g, "").includes("enWander"),
  "cta: sin estilos no se pegan kicker y logotipo",
)

// Comillas del href: el snippet las escapa para no romper el atributo.
assert.ok(
  !buildEmbedSnippet({ href: 'https://x.com/?a="b', kind: "banner" }).includes('?a="b'),
  "href con comillas escapado",
)

assert.equal(
  cleanSourceUrl("https://Blog.com/Post/?utm_source=x&id=3#top"),
  "https://blog.com/Post?id=3",
)
assert.equal(cleanSourceUrl("  "), "")
assert.equal(
  cleanSourceUrl(
    "https://www.instagram.com/p/DblDYKZjOhx/?utm_source=ig_web_copy_link&igsi=MzRlODBiNWFlZA==",
  ),
  "https://www.instagram.com/p/DblDYKZjOhx",
)
assert.equal(
  cleanSourceUrl(
    "https://www.instagram.com/reel/DbYAsLVM7Yd/?utm_source=ig_web_copy_link&igsh=abc&img_index=1&igshid=legacy",
  ),
  "https://www.instagram.com/p/DbYAsLVM7Yd",
)
assert.equal(
  cleanSourceUrl("https://www.instagram.com/lacosmopolilla/p/DblDYKZjOhx/?igsi=x"),
  "https://www.instagram.com/p/DblDYKZjOhx",
)
assert.equal(normalizeRefSlug("  La Cosmopolilla!! "), "la-cosmopolilla")
assert.equal(
  buildStartUrl({ origin: "https://wanderplanner.ai/", sourceUrl: "https://b.com/x", ref: "b", days: 7 }),
  "https://wanderplanner.ai/start?source=https%3A%2F%2Fb.com%2Fx&ref=b&days=7",
)
assert.equal(
  buildStartUrl({ origin: "https://wanderplanner.ai", sourceUrl: "https://b.com/x", ref: "b", days: 0 }),
  "https://wanderplanner.ai/start?source=https%3A%2F%2Fb.com%2Fx&ref=b",
)

console.log("partner-button: ok")
