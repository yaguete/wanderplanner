/**
 * Helpers del kit de partners (`/partners`): URL limpia, slug, enlace /start y snippet HTML.
 * Los tracking params deben coincidir con backend/article_fetch.py (_TRACKING_PARAMS).
 */

import { brandSvgMarkup } from "@/components/brand-mark"
import { parseDaysParam } from "@/lib/partner-trip"

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

const BUTTON_STYLE =
  "display:inline-flex;align-items:center;gap:10px;padding:12px 18px;" +
  "background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;" +
  "font-family:Inter,system-ui,-apple-system,sans-serif;font-size:15px;font-weight:500;" +
  "line-height:1.2;border:0;box-sizing:border-box;"

const ICON_BOX_STYLE =
  "display:inline-flex;align-items:center;justify-content:center;" +
  "width:28px;height:28px;border-radius:6px;background:#171717;color:#ffffff;flex-shrink:0;"

/** Ardilla en negativo; WordPress puede filtrar el SVG — el <a> sigue viéndose bien sin él. */
const BRAND_SVG = brandSvgMarkup("#ffffff", 16, 22)

/**
 * Snippet HTML autocontenido para pegar en un bloque HTML de WordPress.
 * Estilos inline (WP puede filtrar <style>); sin JS ni fuentes externas.
 */
export function buildEmbedSnippet({
  href,
  label = "Planifica esta ruta con WanderPlanner",
}: {
  href: string
  label?: string
}): string {
  const safeHref = href.replace(/"/g, "&quot;")
  const safeLabel = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return (
    `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="${BUTTON_STYLE}">` +
    `<span style="${ICON_BOX_STYLE}">${BRAND_SVG}</span>` +
    `<span>${safeLabel}</span>` +
    `</a>`
  )
}

/** Estilos de la vista previa JSX (espejo del snippet, sin dangerouslySetInnerHTML). */
export const partnerButtonPreviewStyles = {
  anchor: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 18px",
    background: "#2563eb",
    color: "#ffffff",
    textDecoration: "none",
    borderRadius: "8px",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    fontSize: "15px",
    fontWeight: 500,
    lineHeight: 1.2,
    border: 0,
    boxSizing: "border-box" as const,
  },
  iconBox: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 6,
    background: "#171717",
    color: "#ffffff",
    flexShrink: 0,
  },
}
