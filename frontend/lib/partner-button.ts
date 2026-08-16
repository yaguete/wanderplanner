/**
 * Helpers del kit de partners (`/partners`): URL limpia, slug, enlace /start y snippet HTML.
 * Los tracking params deben coincidir con backend/article_fetch.py (_TRACKING_PARAMS).
 */

import { BRAND_COLOR, brandSvgMarkup } from "@/components/brand-mark"
import { parseDaysParam } from "@/lib/partner-trip"

export type PartnerButtonVariant = "color" | "negative"

/** Kicker visual del botón. El nombre accesible es `PARTNER_BUTTON_ARIA_LABEL`. */
export const PARTNER_BUTTON_KICKER = "Planifica este viaje en"
export const PARTNER_BUTTON_ARIA_LABEL = "Planifica este viaje en WanderPlanner"

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
function brandSvg(variant: PartnerButtonVariant): string {
  return brandSvgMarkup(VARIANT_PAINT[variant].color, 28, 39)
}

/**
 * Snippet HTML autocontenido para pegar en un bloque HTML de WordPress.
 * Estilos inline (WP puede filtrar <style>); sin JS ni fuentes externas.
 */
export function buildEmbedSnippet({
  href,
  variant = "color",
}: {
  href: string
  variant?: PartnerButtonVariant
}): string {
  const safeHref = href.replace(/"/g, "&quot;")
  const paint = VARIANT_PAINT[variant]
  const hoverRule =
    variant === "color"
      ? `<style>.${COLOR_HOVER_CLASS}:hover{background:${COLOR_HOVER_BG} !important}</style>\n`
      : ""
  const classAttr = variant === "color" ? ` class="${COLOR_HOVER_CLASS}"` : ""
  return [
    `${hoverRule}<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${classAttr}`,
    `  aria-label="${PARTNER_BUTTON_ARIA_LABEL}"`,
    `  style="${anchorCss(variant)}">`,
    `  <span style="display:inline-flex;flex-shrink:0;line-height:0">${brandSvg(variant)}</span>`,
    `  <span style="display:flex;flex-direction:column;gap:2px;color:${paint.color}">`,
    `    <span style="font-size:13px;font-weight:400">${PARTNER_BUTTON_KICKER}</span>`,
    `    <span style="font-size:18px;letter-spacing:-0.02em">`,
    `      <span style="font-weight:700">Wander</span><span style="font-weight:300">Planner</span>`,
    `    </span>`,
    `  </span>`,
    `</a>`,
  ].join("\n")
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
