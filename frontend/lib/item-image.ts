import type { BasicCategory } from "@/types/itinerary"

const THUMB_QUERY_MAX = 200

/**
 * Construye la query de búsqueda para Unsplash: nombre + región, o solo área del artículo si no hay más contexto.
 */
export function buildThumbQuery(
  name: string,
  region: string | null | undefined,
  area: string | null | undefined,
): string | null {
  const n = name?.trim() ?? ""
  const r = region?.trim() ?? ""
  const a = area?.trim() ?? ""
  let q = ""
  if (n && r) {
    const nLower = n.toLowerCase()
    const rLower = r.toLowerCase()
    q = nLower.includes(rLower) || rLower.includes(nLower) ? n : `${n} ${r}`
  } else if (n) {
    q = n
  } else if (r) {
    q = r
  } else {
    q = a
  }
  q = q.replace(/\s+/g, " ").trim()
  if (!q) return null
  if (q.length > THUMB_QUERY_MAX) return q.slice(0, THUMB_QUERY_MAX)
  return q
}

/**
 * Query para básicos (ofertas / descuentos): nombre + categoría + área opcional.
 */
export function buildBasicThumbQuery(
  name: string,
  category: BasicCategory,
  area: string | null | undefined,
): string | null {
  const n = name?.trim() ?? ""
  const a = area?.trim() ?? ""
  const catHint: Record<BasicCategory, string> = {
    insurance: "travel insurance",
    sim: "esim travel",
    carRental: "car rental",
    flight: "flight",
    other: "travel",
  }
  const parts = [n, catHint[category] ?? "travel", a].filter((p) => p.length > 0)
  if (parts.length === 0) return null
  const q = parts.join(" ").replace(/\s+/g, " ").trim()
  if (q.length > THUMB_QUERY_MAX) return q.slice(0, THUMB_QUERY_MAX)
  return q
}

