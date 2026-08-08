/**
 * Convierte la respuesta `Itinerary` del `POST /itinerary` en un `Source` (ítems aplanados y básicos).
 * Aquí vive el mapeo de `affiliate_url` (backend) a `affiliateUrl` (front) y `mapBasicCategory` (snake → camel).
 * No cambies `dayHint` sin entender `source_structured_by_days` y el panel de inspiración.
 */
import type { BasicCategory, Itinerary, Source, SourceBasicItem, SourceItem } from "@/types/itinerary"

let _counter = 0
function uid(): string {
  return `si-${Date.now()}-${++_counter}`
}

function uidBasic(): string {
  return `sb-${Date.now()}-${++_counter}`
}

// Heurística de marca para mostrar en UI; no afecta al enlace de afiliado.
function vendorFromUrl(href: string | null | undefined): string | null {
  if (!href?.trim()) return null
  try {
    const host = new URL(href).hostname.replace(/^www\./, "")
    const part = host.split(".")[0]
    if (!part) return null
    return part.charAt(0).toUpperCase() + part.slice(1)
  } catch {
    return null
  }
}

// El JSON del backend usa snake_case; en `SourceBasicItem` la categoría es camelCase.
function mapBasicCategory(raw: string): BasicCategory {
  switch (raw) {
    case "insurance":
      return "insurance"
    case "sim":
      return "sim"
    case "car_rental":
      return "carRental"
    case "flight":
      return "flight"
    case "other":
      return "other"
    default:
      return "other"
  }
}

/**
 * Flatten a backend Itinerary into a flat list of SourceItems
 * suitable for the Inspiration panel.
 */
export function flattenItinerary(itinerary: Itinerary): SourceItem[] {
  const items: SourceItem[] = []

  for (const day of itinerary.days) {
    // Solo aporta pista de día al agrupar en el panel; si el artículo no iba estructurado, queda `null` en todo el listado.
    const dayHint = itinerary.source_structured_by_days ? day.day : null

    for (const t of day.transport ?? []) {
      const name = t.from && t.to ? `${t.from} → ${t.to}` : t.type.charAt(0).toUpperCase() + t.type.slice(1)
      items.push({
        id: uid(),
        type: "transport",
        name,
        detail: t.notes,
        dayHint,
        region: t.region ?? null,
        thumbUrl: t.thumb_url ?? null,
      })
    }

    for (const a of day.accommodations ?? []) {
      // `affiliate_url` se copia a `affiliateUrl` (camel) para clics de reserva en el front.
      const href = a.affiliate_url ?? null
      const vendor = href ? vendorFromUrl(href) : null
      items.push({
        id: uid(),
        type: "stay",
        name: a.name,
        detail: a.notes,
        dayHint,
        region: a.region ?? null,
        thumbUrl: a.thumb_url ?? null,
        affiliateUrl: href,
        vendor,
      })
    }

    for (const r of day.restaurants ?? []) {
      items.push({
        id: uid(),
        type: "food",
        name: r.name,
        detail: r.notes,
        dayHint,
        region: r.region ?? null,
        thumbUrl: r.thumb_url ?? null,
      })
    }

    for (const act of day.activities ?? []) {
      items.push({
        id: uid(),
        type: "activity",
        name: act.name,
        detail: act.notes,
        dayHint,
        region: act.region ?? null,
        thumbUrl: act.thumb_url ?? null,
      })
      for (const sub of act.sub_activities ?? []) {
        // Si la sub-actividad no trae `region`, hereda la de su actividad padre (más concreta que el `area` del artículo).
        items.push({
          id: uid(),
          type: "activity",
          name: sub.name,
          detail: sub.notes,
          dayHint,
          region: sub.region ?? act.region ?? null,
          thumbUrl: sub.thumb_url ?? null,
        })
      }
    }
  }

  return items
}

/**
 * Vuelca `itinerary.basics` a ítems para la pestaña Descuentos.
 */
export function flattenBasics(itinerary: Itinerary): SourceBasicItem[] {
  const list = itinerary.basics ?? []
  // Cada `b.affiliate_url` se expone como `affiliateUrl` alineado con el resto del front.
  return list.map((b) => ({
    id: uidBasic(),
    category: mapBasicCategory(b.category),
    name: b.name,
    detail: b.notes,
    vendor: b.vendor,
    affiliateUrl: b.affiliate_url,
    thumbUrl: b.thumb_url ?? null,
  }))
}

/**
 * Build a Source from a backend Itinerary response + metadata.
 */
export function buildSource(
  url: string,
  itinerary: Itinerary,
): Source {
  let author: string
  try {
    author = new URL(url).hostname.replace("www.", "").split(".")[0]
  } catch {
    author = url
  }

  return {
    id: crypto.randomUUID(),
    url,
    author,
    title: `${itinerary.destination} — ${itinerary.total_days} días`,
    // `area` = destino del artículo; usado como fallback de geocoding cuando un ítem no trae `region`.
    area: itinerary.destination?.trim() ? itinerary.destination.trim() : null,
    totalDays:
      Number.isFinite(itinerary.total_days) && itinerary.total_days > 0
        ? Math.floor(itinerary.total_days)
        : null,
    items: flattenItinerary(itinerary),
    basics: flattenBasics(itinerary),
    articleHtml: itinerary.article_html ?? "",
    ogImage: itinerary.og_image ?? null,
  }
}
