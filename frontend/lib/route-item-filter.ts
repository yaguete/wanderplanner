/**
 * Filtro de categorías de la Ruta (lista y mapa). Puro: sin I/O.
 * «Lugares» = activity en triaje o sin reserva; «Actividades» = las que se reservan.
 */
import { taskBucket, taskKeyForRouteItem } from "@/lib/trip-tasks"
import type { TripTaskState, UserDay, UserDayItem } from "@/types/itinerary"

export const ROUTE_ITEM_CATEGORIES = [
  "stay",
  "activity",
  "place",
  "food",
  "transport",
] as const

export type RouteItemCategory = (typeof ROUTE_ITEM_CATEGORIES)[number]

export const ROUTE_ITEM_CATEGORY_LABELS: Record<RouteItemCategory, string> = {
  stay: "Alojamientos",
  activity: "Actividades",
  place: "Lugares",
  food: "Restaurantes",
  transport: "Desplazamientos",
}

const PLACE_CATEGORIES: ReadonlySet<RouteItemCategory> = new Set([
  "stay",
  "activity",
  "place",
  "food",
])

const CATEGORY_SET = new Set<string>(ROUTE_ITEM_CATEGORIES)

export const ALL_ROUTE_ITEM_CATEGORIES: readonly RouteItemCategory[] = ROUTE_ITEM_CATEGORIES

export function isRouteItemCategory(value: string): value is RouteItemCategory {
  return CATEGORY_SET.has(value)
}

/** Activity con reserva (main) vs lugar sin reserva (triaje / dismissed). */
export function routeItemCategory(
  item: Pick<UserDayItem, "type" | "affiliateUrl" | "route">,
  state: TripTaskState | null,
): RouteItemCategory {
  if (item.type === "stay") return "stay"
  if (item.type === "food") return "food"
  if (item.type === "transport") return "transport"
  const bucket = taskBucket("activity", state, "dayItem", {
    route: item.route,
    hasAffiliate: Boolean(item.affiliateUrl?.trim()),
  })
  return bucket === "main" ? "activity" : "place"
}

export function allRouteItemCategoriesSelected(
  selected: ReadonlySet<RouteItemCategory>,
): boolean {
  return selected.size === ROUTE_ITEM_CATEGORIES.length
}

export function toggleAllRouteItemCategories(
  selected: ReadonlySet<RouteItemCategory>,
): Set<RouteItemCategory> {
  return allRouteItemCategoriesSelected(selected)
    ? new Set()
    : new Set(ROUTE_ITEM_CATEGORIES)
}

export function toggleRouteItemCategory(
  selected: ReadonlySet<RouteItemCategory>,
  category: RouteItemCategory,
): Set<RouteItemCategory> {
  const next = new Set(selected)
  if (next.has(category)) next.delete(category)
  else next.add(category)
  return next
}

export function routeFilterShowsPlaces(selected: ReadonlySet<RouteItemCategory>): boolean {
  for (const cat of PLACE_CATEGORIES) {
    if (selected.has(cat)) return true
  }
  return false
}

export function routeFilterShowsTransport(
  selected: ReadonlySet<RouteItemCategory>,
): boolean {
  return selected.has("transport")
}

export function routeItemFilterTriggerLabel(
  selected: ReadonlySet<RouteItemCategory>,
): string {
  if (selected.size === 0) return "Ninguna"
  if (allRouteItemCategoriesSelected(selected)) return "Mostrar todo"
  if (selected.size === 1) {
    for (const cat of ROUTE_ITEM_CATEGORIES) {
      if (selected.has(cat)) return ROUTE_ITEM_CATEGORY_LABELS[cat]
    }
  }
  return `${selected.size} categorías`
}

export function itemMatchesRouteFilter(
  item: UserDayItem,
  days: UserDay[],
  tasks: Record<string, TripTaskState>,
  selected: ReadonlySet<RouteItemCategory>,
): boolean {
  if (selected.size === 0) return false
  if (allRouteItemCategoriesSelected(selected)) return true
  const state = tasks[taskKeyForRouteItem(item, days)] ?? null
  return selected.has(routeItemCategory(item, state))
}

/**
 * `null` = usar el default (todas). Array vacío = el usuario ocultó todo.
 * Entrada corrupta → null.
 */
export function parseRouteItemFilter(raw: unknown): RouteItemCategory[] | null {
  if (!Array.isArray(raw)) return null
  const next: RouteItemCategory[] = []
  const seen = new Set<RouteItemCategory>()
  for (const entry of raw) {
    if (typeof entry !== "string" || !isRouteItemCategory(entry) || seen.has(entry)) {
      continue
    }
    seen.add(entry)
    next.push(entry)
  }
  if (raw.length > 0 && next.length === 0) return null
  return next
}
