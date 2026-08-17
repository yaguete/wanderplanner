/**
 * Helpers del kit de partners (`/partners`): URL limpia, slug, enlace /start y snippet HTML.
 * Los tracking params deben coincidir con backend/article_fetch.py (_TRACKING_PARAMS).
 */

import { BRAND_INK, brandSvgMarkup } from "@/components/brand-mark"
import { parseDaysParam } from "@/lib/partner-trip"

export type PartnerButtonVariant = "color" | "negative"
export type PartnerEmbedKind = "cta" | "banner"

/** Kicker visual del botón. El nombre accesible es `PARTNER_BUTTON_ARIA_LABEL`. */
export const PARTNER_BUTTON_KICKER = "Planifica este viaje en"
export const PARTNER_BUTTON_ARIA_LABEL = "Planifica este viaje en WanderPlanner"

/** Texto editable del banner: cada salto de línea es un `<br>` del snippet. */
export const PARTNER_BANNER_DEFAULT_TEXT =
  "¿Tienes dudas? ¿Necesitas ayuda\npara planificar esta ruta?"
/** Fragmento en negrita: la primera aparición dentro del texto, si sigue estando. */
export const PARTNER_BANNER_DEFAULT_EMPHASIS = "planificar esta ruta"
export const PARTNER_BANNER_MAX_LENGTH = 160
export const PARTNER_BANNER_CHIP_KICKER = "Prueba"

const BANNER_HOVER_CLASS = "wp-wanderplanner-banner"

const COLOR_BG = "#E8E5E4"
const COLOR_HOVER_BG = "#ffffff"
const NEGATIVE_BG = "#000000"
const NEGATIVE_PAINT = "#ffffff"

const COLOR_HOVER_CLASS = "wp-wanderplanner-btn"

type VariantPaint = {
  background: string
  color: string
  border: string
}

// `BRAND_INK`, no `BRAND_COLOR`: el acento claro no vale como color de texto
// (3.6:1 sobre blanco). Es la tinta del lockup del header.
const VARIANT_PAINT: Record<PartnerButtonVariant, VariantPaint> = {
  color: {
    background: COLOR_BG,
    color: BRAND_INK,
    border: `1px solid ${BRAND_INK}`,
  },
  negative: {
    background: NEGATIVE_BG,
    color: NEGATIVE_PAINT,
    border: `1px solid ${NEGATIVE_PAINT}`,
  },
}

/**
 * Marca cada declaración con `!important`.
 *
 * El snippet vive en temas ajenos (Astra, Elementor, page builders) que aplican
 * reglas con `!important` sobre los enlaces y los `span` del contenido, y esas sí
 * ganan a un estilo inline normal.
 *
 * Regla al usarlo: **lo que el `<style>` tenga que pisar se queda fuera**, porque un
 * `!important` inline gana a cualquier hoja de estilo, la nuestra incluida. Hoy son
 * el `background` del `<a>` en color (hover) y el `flex-wrap` / `flex` del banner
 * (apilado en móvil). Sin esa excepción esas reglas del `<style>` no hacen nada.
 */
function important(css: string): string {
  const decls = css
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
  return decls.length ? `${decls.join(" !important;")} !important;` : ""
}

const ANCHOR_LAYOUT =
  "display:inline-flex;align-items:center;gap:14px;padding:12px 16px;margin:0;" +
  "width:fit-content;max-width:100%;text-decoration:none;box-shadow:none;" +
  "border-radius:12px;font-family:Inter,system-ui,-apple-system,sans-serif;" +
  "line-height:1.15;box-sizing:border-box;"

function anchorCss(variant: PartnerButtonVariant): string {
  const paint = VARIANT_PAINT[variant]
  const base = important(
    ANCHOR_LAYOUT + `color:${paint.color};border:${paint.border};`,
  )
  if (variant === "negative") return base + important(`background:${paint.background}`)
  return (
    base +
    `background:${paint.background};` + // sin !important: lo pisa el hover del <style>
    important("transition:background-color .15s ease")
  )
}

/** Mantener en espejo con backend/article_fetch.py (_TRACKING_PARAMS). */
export const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
])

/**
 * URL canónica ligera para el enlace del blogger: sin fragmento ni tracking.
 * No altera el path (mayúsculas incluidas); el lookup canónico del backend cubre variantes.
 */
export function cleanSourceUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  try {
    const u = new URL(trimmed)
    if (u.protocol !== "http:" && u.protocol !== "https:") return trimmed
    const kept = new URLSearchParams()
    u.searchParams.forEach((value, key) => {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) {
        kept.append(key, value)
      }
    })
    u.search = kept.toString()
    u.hash = ""
    u.pathname = u.pathname.replace(/\/$/, "") || ""
    u.hostname = u.hostname.toLowerCase()
    return u.toString()
  } catch {
    return trimmed
  }
}

/** Slug de partner: minúsculas, espacios → guiones, solo [a-z0-9-]. */
export function normalizeRefSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function buildStartUrl({
  origin,
  sourceUrl,
  ref,
  days,
}: {
  origin: string
  sourceUrl: string
  ref: string
  days?: number | null
}): string {
  const base = origin.replace(/\/$/, "")
  const params = new URLSearchParams()
  params.set("source", sourceUrl)
  params.set("ref", ref)
  const parsedDays = days == null ? null : parseDaysParam(String(days))
  if (parsedDays != null) params.set("days", String(parsedDays))
  return `${base}/start?${params.toString()}`
}

/** Ardilla del snippet; WordPress puede filtrar el SVG — el <a> sigue viéndose bien sin él. */
function brandSvg(variant: PartnerButtonVariant, width = 28, height = 39): string {
  return brandSvgMarkup(VARIANT_PAINT[variant].color, width, height)
}

/** `<strong>` en «Wander»: si el editor se come los `style`, el logotipo sigue leyéndose. */
function wordmarkSpans(): string {
  return (
    `<strong style="${important("font-weight:700;color:inherit")}">Wander</strong>` +
    `<span style="${important("font-weight:300")}">Planner</span>`
  )
}

function iconWrapHtml(svg: string): string {
  return `<span style="${important("display:inline-flex;flex-shrink:0;line-height:0")}">${svg}</span>`
}

function chipInnerHtml(variant: PartnerButtonVariant, kicker: string): string {
  const paint = VARIANT_PAINT[variant]
  const chipBg = variant === "color" ? "#F4F2F1" : "transparent"
  return (
    `<span style="${important(
      "display:inline-flex;flex-shrink:0;align-items:center;gap:10px;" +
        `padding:10px 14px;border-radius:10px;border:${paint.border};` +
        `background:${chipBg};color:${paint.color};white-space:nowrap;box-sizing:border-box`,
    )}">` +
    iconWrapHtml(brandSvg(variant, 22, 31)) +
    // El font-size del contenedor fija el strut de la línea: sin él lo hereda del
    // blog anfitrión (Astra pone 17px) y el chip crece respecto a la vista previa.
    `<span style="${important(`display:block;font-size:12px;color:${paint.color};line-height:1.2`)}">` +
    `<span style="${important("font-size:12px;font-weight:400")}">${kicker}</span><br>` +
    `<span style="${important("font-size:16px;letter-spacing:-0.02em")}">${wordmarkSpans()}</span>` +
    `</span></span>`
  )
}

export type BannerRun = { text: string; strong: boolean }

/**
 * Descompone el texto del banner en líneas de tramos. Fuente única para el HTML y
 * para la vista previa JSX: si divergen, el bloguero copia algo que no ha visto.
 * El énfasis es la primera aparición literal (sin distinguir mayúsculas) y no cruza
 * saltos de línea; si el bloguero lo reescribe y ya no aparece, simplemente no hay
 * negrita — nunca se inventa dónde ponerla.
 */
export function splitBannerCopy(text: string, emphasis: string): BannerRun[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const needle = emphasis.trim()
  let pendiente = needle.length > 0
  return lines.map((line) => {
    const at = pendiente ? line.toLowerCase().indexOf(needle.toLowerCase()) : -1
    if (at < 0) return [{ text: line, strong: false }]
    pendiente = false
    return [
      { text: line.slice(0, at), strong: false },
      { text: line.slice(at, at + needle.length), strong: true },
      { text: line.slice(at + needle.length), strong: false },
    ].filter((run) => run.text.length > 0)
  })
}

/** Texto del banner en una línea, para el nombre accesible del enlace. */
export function bannerAriaLabel(text: string): string {
  const plano = text.replace(/\s+/g, " ").trim()
  return plano ? `${plano} — Prueba WanderPlanner` : "Prueba WanderPlanner"
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Un `<br>` en vez de dos `span` apilados con flex: el salto de línea tiene que
 * sobrevivir a que el editor borre los `style` de los `span` anidados (si no, sale
 * «ayudapara» pegado). Misma razón para `<strong>` en el énfasis.
 */
function bannerCopyHtml(color: string, text: string, emphasis: string): string {
  const inner = splitBannerCopy(text, emphasis)
    .map((runs) =>
      runs
        .map((run) =>
          run.strong
            ? `<strong style="${important("font-weight:700;color:inherit")}">${escapeHtml(run.text)}</strong>`
            : escapeHtml(run.text),
        )
        .join(""),
    )
    .join("<br>")
  return (
    `<span style="${important(
      "display:block;min-width:0;margin:0;padding:0;font-size:18px;" +
        `font-weight:500;line-height:1.35;letter-spacing:-0.02em;text-align:left;color:${color}`,
    )}flex:1;">` + // flex sin !important: lo pisa la media query del <style>
    `${inner}</span>`
  )
}

function bannerCopyColor(variant: PartnerButtonVariant): string {
  return variant === "color" ? BRAND_INK : "#ffffff"
}

function bannerCss(variant: PartnerButtonVariant): string {
  const isColor = variant === "color"
  const base =
    important(
      "display:flex;align-items:center;justify-content:space-between;gap:28px;" +
        "padding:22px 26px;margin:0;border-radius:16px;border:0;" +
        "font-family:Inter,system-ui,-apple-system,sans-serif;text-decoration:none;" +
        "box-shadow:none;box-sizing:border-box;width:100%;max-width:100%;" +
        `color:${bannerCopyColor(variant)}`,
    ) + "flex-wrap:nowrap;" // sin !important: lo pisa la media query del <style>
  if (!isColor) {
    return base + important("background:linear-gradient(90deg,#6B7380 0%,#121212 100%)")
  }
  return (
    base +
    `background:${COLOR_BG};` + // sin !important: lo pisa el hover del <style>
    important("transition:background-color .15s ease")
  )
}

/**
 * Lo que el estilo inline no puede: hover, pseudoelementos que algunos temas
 * cuelgan de los enlaces externos y el apilado en móvil. Si WordPress filtra el
 * `<style>`, el snippet sigue en pie con los inline.
 */
function embedStyleBlock(cls: string, variant: PartnerButtonVariant, kind: PartnerEmbedKind): string {
  const rules = [`.${cls}::before,.${cls}::after{content:none !important;display:none !important}`]
  if (variant === "color") rules.push(`.${cls}:hover{background:${COLOR_HOVER_BG} !important}`)
  if (kind === "banner") {
    // Apilado en móvil. Solo puede tocar lo que el inline deja sin `!important`
    // (`flex-wrap` del `<a>` y `flex` del texto), y necesita `!important` aquí:
    // sin él pierde igual, porque un inline normal ya gana a la hoja de estilo.
    rules.push(
      `@media (max-width:600px){.${cls}{flex-wrap:wrap !important}` +
        `.${cls}>span:first-child{flex:1 0 100% !important}}`,
    )
  }
  return `<style>${rules.join("")}</style>`
}

function anchorOpenTag(href: string, cls: string, label: string, css: string): string {
  return (
    `<a href="${href}" target="_blank" rel="noopener noreferrer" class="${cls}" ` +
    `aria-label="${label}" style="${css}">`
  )
}

function buildCtaSnippet(href: string, variant: PartnerButtonVariant): string {
  const paint = VARIANT_PAINT[variant]
  return (
    embedStyleBlock(COLOR_HOVER_CLASS, variant, "cta") +
    anchorOpenTag(href, COLOR_HOVER_CLASS, PARTNER_BUTTON_ARIA_LABEL, anchorCss(variant)) +
    iconWrapHtml(brandSvg(variant)) +
    `<span style="${important(`display:block;font-size:13px;color:${paint.color};line-height:1.2`)}">` +
    `<span style="${important("font-size:13px;font-weight:400")}">${PARTNER_BUTTON_KICKER}</span><br>` +
    `<span style="${important("font-size:18px;letter-spacing:-0.02em")}">${wordmarkSpans()}</span>` +
    `</span></a>`
  )
}

function buildBannerSnippet(
  href: string,
  variant: PartnerButtonVariant,
  text: string,
  emphasis: string,
): string {
  return (
    embedStyleBlock(BANNER_HOVER_CLASS, variant, "banner") +
    anchorOpenTag(
      href,
      BANNER_HOVER_CLASS,
      escapeHtml(bannerAriaLabel(text)),
      bannerCss(variant),
    ) +
    bannerCopyHtml(bannerCopyColor(variant), text, emphasis) +
    chipInnerHtml(variant, PARTNER_BANNER_CHIP_KICKER) +
    `</a>`
  )
}

/**
 * Snippet HTML autocontenido para pegar en un bloque HTML de WordPress.
 *
 * Va en **una sola línea a propósito**: `wpautop` convierte los saltos de línea del
 * contenido en `<br />`, y un `<br>` suelto dentro del `<a>` flex descuadra el embed.
 * Estilos inline con `!important` (WP puede filtrar el `<style>`), sin JS ni fuentes
 * externas, y sin depender de que sobreviva el `style` de ningún `span` anidado.
 */
export function buildEmbedSnippet({
  href,
  variant = "color",
  kind = "cta",
  text = PARTNER_BANNER_DEFAULT_TEXT,
  emphasis = PARTNER_BANNER_DEFAULT_EMPHASIS,
}: {
  href: string
  variant?: PartnerButtonVariant
  kind?: PartnerEmbedKind
  /** Solo banner: texto del bloguero. Los saltos de línea salen como `<br>`. */
  text?: string
  /** Solo banner: fragmento en negrita (vacío = sin negrita). */
  emphasis?: string
}): string {
  const safeHref = href.replace(/"/g, "&quot;")
  return kind === "banner"
    ? buildBannerSnippet(safeHref, variant, text, emphasis)
    : buildCtaSnippet(safeHref, variant)
}

/** Estilos de la vista previa JSX (espejo del snippet, sin dangerouslySetInnerHTML). */
export function partnerButtonPreviewStyles(variant: PartnerButtonVariant = "color") {
  const paint = VARIANT_PAINT[variant]
  return {
    anchor: {
      display: "inline-flex",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: "14px",
      padding: "12px 16px",
      width: "fit-content",
      maxWidth: "100%",
      background: paint.background,
      color: paint.color,
      textDecoration: "none",
      borderRadius: "12px",
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      lineHeight: 1.15,
      border: paint.border,
      boxSizing: "border-box" as const,
      transition: variant === "color" ? "background-color .15s ease" : undefined,
    },
    copy: {
      display: "block",
      fontSize: "13px",
      lineHeight: 1.2,
      color: paint.color,
    },
    kicker: {
      fontSize: "13px",
      fontWeight: 400,
    },
    wordmark: {
      fontSize: "18px",
      letterSpacing: "-0.02em",
    },
  }
}

/** Estilos de la vista previa del banner (espejo del snippet). */
export function partnerBannerPreviewStyles(variant: PartnerButtonVariant = "color") {
  const isColor = variant === "color"
  return {
    anchor: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "nowrap" as const,
      gap: "28px",
      width: "100%",
      maxWidth: "100%",
      padding: "22px 26px",
      borderRadius: "16px",
      textDecoration: "none",
      boxSizing: "border-box" as const,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      background: isColor
        ? COLOR_BG
        : "linear-gradient(90deg, #6B7380 0%, #121212 100%)",
      color: bannerCopyColor(variant),
      border: 0,
      transition: isColor ? "background-color .15s ease" : undefined,
    },
    copy: {
      display: "block",
      flex: 1,
      minWidth: 0,
      fontSize: "18px",
      fontWeight: 500,
      lineHeight: 1.35,
      letterSpacing: "-0.02em",
      textAlign: "left" as const,
      color: bannerCopyColor(variant),
    },
    chip: {
      display: "inline-flex",
      flexShrink: 0,
      alignItems: "center",
      gap: "10px",
      padding: "10px 14px",
      borderRadius: "10px",
      border: VARIANT_PAINT[variant].border,
      background: isColor ? "#F4F2F1" : "transparent",
      color: VARIANT_PAINT[variant].color,
      whiteSpace: "nowrap" as const,
      boxSizing: "border-box" as const,
    },
    chipCopy: {
      display: "block",
      fontSize: "12px",
      color: VARIANT_PAINT[variant].color,
      lineHeight: 1.2,
    },
    chipKicker: {
      fontSize: "12px",
      fontWeight: 400,
    },
    chipWordmark: {
      fontSize: "16px",
      letterSpacing: "-0.02em",
    },
  }
}
