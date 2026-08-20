/**
 * Portadas de viaje: consultas desde la fuente + GET /cover en el backend (Unsplash).
 * Sin claves de Unsplash en el navegador.
 */
import { collectCountryCodesFromHint, getCountryByCode, hasWordBoundaryMatch } from "@/lib/countries"
import { authHeaders } from "@/lib/api-auth"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

/**
 * Search Unsplash (vía backend) for a destination photo.
 * Returns a URL sized for a card cover, or null if unavailable.
 */
export async function fetchDestinationCover(destination: string): Promise<string | null> {
  const q = destination.trim()
  if (!q) return null

  try {
    const params = new URLSearchParams({ q })
    const res = await fetch(`${API_BASE}/cover?${params}`, {
      headers: { ...(await authHeaders()) },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { url?: string | null }
    return typeof data.url === "string" && data.url.trim() ? data.url : null
  } catch {
    return null
  }
}

/**
 * Consultas de portada en orden de preferencia a partir de una fuente:
 * 1) `source.area` (destino del artículo),
 * 2) nombre del país inferido desde ese área,
 * 3) fallback genérico (maleta/mapa) si Unsplash no tiene foto del destino.
 */
export const GENERIC_COVER_QUERY_PREFIX = "generic:"

export function genericCoverQuery(seed: string): string {
  const trimmed = seed.trim() || "viaje"
  return `${GENERIC_COVER_QUERY_PREFIX}${trimmed}`
}

export function coverQueriesFromSource(source: {
  area: string | null
}): string[] {
  const queries: string[] = []
  const area = source.area?.trim()
  if (area) queries.push(area)

  const codes = collectCountryCodesFromHint(area)
  for (const code of codes) {
    const name = getCountryByCode(code.toUpperCase())?.name
    if (!name) continue
    const already = queries.some((q) => q.toLowerCase() === name.toLowerCase())
    // Si el área ya nombra el país ("Costa Vasca, España"), no pedir España
    // suelta: Unsplash devolvería un paisaje cualquiera, no el destino.
    if (already || (area && hasWordBoundaryMatch(area, name))) continue
    queries.push(name)
  }
  queries.push(genericCoverQuery(area || "viaje"))
  return queries
}

/** Prueba cada consulta con `fetchDestinationCover` y devuelve la primera imagen. */
export async function fetchCoverFromQueries(queries: string[]): Promise<string | null> {
  for (const q of queries) {
    if (!q.trim()) continue
    const url = await fetchDestinationCover(q.trim())
    if (url) return url
  }
  return null
}
