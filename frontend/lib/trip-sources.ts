import { cleanSourceUrl } from "@/lib/partner-button"

/**
 * Tope de fuentes por viaje (UX; las cuotas de extraction ya cubren el coste).
 * Un post de Instagram cuenta igual que un artículo: el patrón de pegar varios
 * reels no debe dejar el viaje sin hueco para una crónica con enlaces y días.
 */
export const MAX_SOURCES_PER_TRIP = 5

/**
 * Clave de comparación entre fuentes: `cleanSourceUrl` + host sin `www` + sin esquema.
 * `https://www.x.com/a` y `http://x.com/a/` colapsan a la misma clave.
 * No toca `cleanSourceUrl` (espejo del kit de partners).
 */
export function sourceMatchKey(raw: string): string {
  const cleaned = cleanSourceUrl(raw)
  const value = cleaned || raw.trim()
  if (!value) return ""
  try {
    const u = new URL(value)
    const host = u.hostname.replace(/^www\./i, "").toLowerCase()
    const path = (u.pathname.replace(/\/$/, "") || "").toLowerCase()
    const search = u.search
    return `${host}${path}${search}`
  } catch {
    return value.toLowerCase()
  }
}

/**
 * ¿Se puede iniciar otra extracción?
 * Cuentan fuentes reales + pendings en `loading` (un chip en error no ocupa cupo).
 */
export function canAddSource(opts: {
  sourceCount: number
  loadingPendingCount: number
}): boolean {
  return opts.sourceCount + opts.loadingPendingCount < MAX_SOURCES_PER_TRIP
}
