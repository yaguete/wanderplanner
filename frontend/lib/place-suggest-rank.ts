/**
 * Ordena sugerencias de Search Box: categoría cruzada con el tipo del ítem
 * primero, coincidencia de nombre como desempate. La categoría es un empujón,
 * nunca un filtro (Sagrada Família llega con `poi_category_ids` nulo).
 */
import { significantTokens } from "./geocode-validate"

export type PlaceSuggestKind = "stay" | "activity" | "food"

const KIND_CATEGORY_IDS: Record<PlaceSuggestKind, readonly string[]> = {
  activity: [
    "tourist_attraction",
    "monument",
    "museum",
    "historic_site",
    "landmark",
    "park",
    "place_of_worship",
  ],
  food: ["restaurant", "cafe", "bar", "fast_food", "food"],
  stay: ["hotel", "lodging", "hostel"],
}

export type RankableSuggestion = {
  text: string
  placeName: string
  poiCategoryIds?: string[] | null
}

function categoryBoost(ids: string[] | null | undefined, kind: PlaceSuggestKind | null): number {
  if (!kind || !ids?.length) return 0
  const wanted = KIND_CATEGORY_IDS[kind]
  let hits = 0
  for (const id of ids) {
    if (wanted.includes(id)) hits += 1
  }
  return hits
}

function nameOverlap(query: string, suggestion: RankableSuggestion): number {
  const tokens = significantTokens(query)
  if (tokens.length === 0) return 0
  const blob = `${suggestion.text} ${suggestion.placeName}`.toLowerCase()
  let n = 0
  for (const t of tokens) {
    if (blob.includes(t)) n += 1
  }
  return n
}

export function rankPlaceSuggestions<T extends RankableSuggestion>(
  items: T[],
  query: string,
  kind?: PlaceSuggestKind | null,
): T[] {
  const k = kind ?? null
  return [...items].sort((a, b) => {
    const cat = categoryBoost(b.poiCategoryIds, k) - categoryBoost(a.poiCategoryIds, k)
    if (cat !== 0) return cat
    return nameOverlap(query, b) - nameOverlap(query, a)
  })
}
