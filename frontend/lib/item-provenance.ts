import type { Source, SourceBasicItem, SourceItem, UserBasicItem, UserDayItem } from "@/types/itinerary"

/** Centinelas de procedencia (no son UUIDs de `Source`). */
export const MANUAL_SOURCE_ID = "manual"
export const ASSISTANT_SOURCE_ID = "assistant"

export function isSyntheticSourceId(sourceId: string): boolean {
  return sourceId === MANUAL_SOURCE_ID || sourceId === ASSISTANT_SOURCE_ID
}

/**
 * Texto de atribución para UI y briefing del asistente.
 * Ítems propios: neutro, sin «vía @…» ni nombre de blog.
 */
export function itemProvenanceLabel(item: {
  sourceId: string
  sourceAuthor: string
}): string {
  if (item.sourceId === MANUAL_SOURCE_ID) return "Añadido por ti"
  return `vía @${item.sourceAuthor}`
}

/** Copia un ítem extraído al día, conservando autor y afiliado. */
export function userDayItemFromSource(item: SourceItem, source: Source): UserDayItem {
  return {
    id: crypto.randomUUID(),
    sourceItemId: item.id,
    sourceId: source.id,
    type: item.type,
    name: item.name,
    detail: item.detail,
    sourceAuthor: source.author,
    region: item.region ?? source.area ?? null,
    coords: item.coords ?? null,
    affiliateUrl: item.affiliateUrl ?? null,
    vendor: item.vendor ?? null,
    sourceRouteHint: item.sourceRouteHint,
  }
}

/** Copia un básico extraído al viaje, conservando autor y afiliado. */
export function userBasicItemFromSource(
  basic: SourceBasicItem,
  source: Source,
): UserBasicItem {
  return {
    id: crypto.randomUUID(),
    sourceBasicItemId: basic.id,
    sourceId: source.id,
    category: basic.category,
    name: basic.name,
    detail: basic.detail,
    vendor: basic.vendor,
    affiliateUrl: basic.affiliateUrl,
    sourceAuthor: source.author,
  }
}
