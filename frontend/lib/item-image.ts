import type { BasicCategory, ItemType } from "@/types/itinerary"

const TYPE_HINT: Record<ItemType, string> = {
  transport: "road",
  stay: "hotel",
  food: "food",
  activity: "landscape",
}

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

/** Thumbnail estable por ítem (Picsum; sin API key). */
export function getItemThumbnail(item: { id: string; type: ItemType }): string {
  const seed = `${item.type}-${item.id}-${TYPE_HINT[item.type]}`
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/128/128`
}

const BASIC_HINT: Record<BasicCategory, string> = {
  insurance: "shield",
  sim: "wifi",
  carRental: "car",
  flight: "plane",
  other: "sparkle",
}

/** Thumbnail para ítems de la pestaña Descuentos. */
export function getBasicThumbnail(item: { id: string; category: BasicCategory }): string {
  const seed = `basic-${item.category}-${item.id}-${BASIC_HINT[item.category]}`
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/128/128`
}
