/**
 * Helpers del kit de partners (`/partners`): URL limpia, slug, enlace /start y snippet HTML.
 * Los tracking params deben coincidir con backend/article_fetch.py (_TRACKING_PARAMS).
 */

import { BRAND_COLOR, brandSvgMarkup } from "@/components/brand-mark"
import { parseDaysParam } from "@/lib/partner-trip"

export type PartnerButtonVariant = "color" | "negative"
export type PartnerEmbedKind = "cta" | "banner"

/** Kicker visual del botón. El nombre accesible es `PARTNER_BUTTON_ARIA_LABEL`. */
export const PARTNER_BUTTON_KICKER = "Planifica este viaje en"
export const PARTNER_BUTTON_ARIA_LABEL = "Planifica este viaje en WanderPlanner"

export const PARTNER_BANNER_LINE_1 = "¿Tienes dudas? ¿Necesitas ayuda"
export const PARTNER_BANNER_LINE_2_PREFIX = "para "
export const PARTNER_BANNER_EMPHASIS = "planificar esta ruta"
export const PARTNER_BANNER_CHIP_KICKER = "Prueba"
export const PARTNER_BANNER_ARIA_LABEL =
  "Prueba WanderPlanner: ¿necesitas ayuda para planificar esta ruta?"

const BANNER_HOVER_CLASS = "wp-wanderplanner-banner"
const COLOR_INK = "#1F1C1A"

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

const VARIANT_PAINT: Record<PartnerButtonVariant, VariantPaint> = {
  color: {
    background: COLOR_BG,
    color: BRAND_COLOR,
    border: `1px solid ${BRAND_COLOR}`,
  },
  negative: {
    background: NEGATIVE_BG,
    color: NEGATIVE_PAINT,
    border: `1px solid ${NEGATIVE_PAINT}`,
  },
}

const ANCHOR_LAYOUT =
  "display:inline-flex;align-items:center;gap:14px;padding:12px 16px;" +
  "width:fit-content;max-width:100%;text-decoration:none;border-radius:12px;" +
  "font-family:Inter,system-ui,-apple-system,sans-serif;" +
  "line-height:1.15;box-sizing:border-box;"

function anchorCss(variant: PartnerButtonVariant): string {
  const paint = VARIANT_PAINT[variant]
  const hover =
    variant === "color" ? "transition:background-color .15s ease;" : ""
  return (
    ANCHOR_LAYOUT +
    hover +
    `background:${paint.background};color:${paint.color};border:${paint.border};`
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

function wordmarkSpans(): string {
  return `<span style="font-weight:700">Wander</span><span style="font-weight:300">Planner</span>`
}

function chipInnerHtml(variant: PartnerButtonVariant, kicker: string): string {
  const paint = VARIANT_PAINT[variant]
  const chipBg = variant === "color" ? "#F4F2F1" : "transparent"
  return (
    `<span style="display:inline-flex;flex-shrink:0;align-items:center;gap:10px;` +
    `padding:10px 14px;border-radius:10px;border:${paint.border};` +
    `background:${chipBg};color:${paint.color};box-sizing:border-box">` +
    `<span style="display:inline-flex;flex-shrink:0;line-height:0">${brandSvg(variant, 22, 31)}</span>` +
    `<span style="display:flex;flex-direction:column;gap:1px;color:${paint.color};line-height:1.15">` +
    `<span style="font-size:12px;font-weight:400">${kicker}</span>` +
    `<span style="font-size:16px;letter-spacing:-0.02em">${wordmarkSpans()}</span>` +
    `</span></span>`
  )
}

function bannerCopyHtml(color: string): string {
  return (
    `<span style="display:flex;flex-direction:column;justify-content:center;gap:2px;` +
    `flex:1;min-width:0;font-size:18px;font-weight:500;line-height:1.3;` +
    `letter-spacing:-0.02em;text-align:left;color:${color}">` +
    `<span>${PARTNER_BANNER_LINE_1}</span>` +
    `<span>${PARTNER_BANNER_LINE_2_PREFIX}<span style="font-weight:700">${PARTNER_BANNER_EMPHASIS}</span>?</span>` +
    `</span>`
  )
}

function bannerCss(variant: PartnerButtonVariant): string {
  const font =
    "font-family:Inter,system-ui,-apple-system,sans-serif;text-decoration:none;" +
    "box-sizing:border-box;width:100%;max-width:100%;"
  const layout =
    "display:flex;align-items:center;justify-content:space-between;gap:28px;" +
    "flex-wrap:nowrap;padding:22px 26px;border-radius:16px;"
  if (variant === "color") {
    return (
      layout +
      font +
      `background:${COLOR_BG};color:${COLOR_INK};border:0;` +
      "transition:background-color .15s ease;"
    )
  }
  return (
    layout +
    font +
    "background:linear-gradient(90deg,#6B7380 0%,#121212 100%);color:#ffffff;border:0;"
  )
}

function buildCtaSnippet(href: string, variant: PartnerButtonVariant): string {
  const paint = VARIANT_PAINT[variant]
  const hoverRule =
    variant === "color"
      ? `<style>.${COLOR_HOVER_CLASS}:hover{background:${COLOR_HOVER_BG} !important}</style>\n`
      : ""
  const classAttr = variant === "color" ? ` class="${COLOR_HOVER_CLASS}"` : ""
  return [
    `${hoverRule}<a href="${href}" target="_blank" rel="noopener noreferrer"${classAttr}`,
    `  aria-label="${PARTNER_BUTTON_ARIA_LABEL}"`,
    `  style="${anchorCss(variant)}">`,
    `  <span style="display:inline-flex;flex-shrink:0;line-height:0">${brandSvg(variant)}</span>`,
    `  <span style="display:flex;flex-direction:column;gap:2px;color:${paint.color}">`,
    `    <span style="font-size:13px;font-weight:400">${PARTNER_BUTTON_KICKER}</span>`,
    `    <span style="font-size:18px;letter-spacing:-0.02em">${wordmarkSpans()}</span>`,
    `  </span>`,
    `</a>`,
  ].join("\n")
}

function buildBannerSnippet(href: string, variant: PartnerButtonVariant): string {
  const copyColor = variant === "color" ? COLOR_INK : "#ffffff"
  const hoverRule =
    variant === "color"
      ? `<style>.${BANNER_HOVER_CLASS}:hover{background:${COLOR_HOVER_BG} !important}</style>\n`
      : ""
  const classAttr = variant === "color" ? ` class="${BANNER_HOVER_CLASS}"` : ""
  return [
    `${hoverRule}<a href="${href}" target="_blank" rel="noopener noreferrer"${classAttr}`,
    `  aria-label="${PARTNER_BANNER_ARIA_LABEL}"`,
    `  style="${bannerCss(variant)}">`,
    `  ${bannerCopyHtml(copyColor)}`,
    `  ${chipInnerHtml(variant, PARTNER_BANNER_CHIP_KICKER)}`,
    `</a>`,
  ].join("\n")
}

/**
 * Snippet HTML autocontenido para pegar en un bloque HTML de WordPress.
 * Estilos inline (WP puede filtrar <style>); sin JS ni fuentes externas.
 */
export function buildEmbedSnippet({
  href,
  variant = "color",
  kind = "cta",
}: {
  href: string
  variant?: PartnerButtonVariant
  kind?: PartnerEmbedKind
}): string {
  const safeHref = href.replace(/"/g, "&quot;")
  return kind === "banner"
    ? buildBannerSnippet(safeHref, variant)
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
      display: "flex",
      flexDirection: "column" as const,
      gap: "2px",
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
      color: isColor ? COLOR_INK : "#ffffff",
      border: 0,
      transition: isColor ? "background-color .15s ease" : undefined,
    },
    copy: {
      display: "flex",
      flexDirection: "column" as const,
      justifyContent: "center",
      gap: "2px",
      flex: 1,
      minWidth: 0,
      fontSize: "18px",
      fontWeight: 500,
      lineHeight: 1.3,
      letterSpacing: "-0.02em",
      textAlign: "left" as const,
      color: isColor ? COLOR_INK : "#ffffff",
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
      boxSizing: "border-box" as const,
    },
    chipCopy: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "1px",
      color: VARIANT_PAINT[variant].color,
      lineHeight: 1.15,
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
