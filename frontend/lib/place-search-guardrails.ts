/**
 * Guardas de coste / licencia para búsquedas de lugares (T4B.3 §9.11).
 *
 * - Kill switch: `NEXT_PUBLIC_TRANSPORT_PLACE_SEARCH_ENABLED=false`
 * - Presupuesto de sesión (modal): tope de suggests + hubs
 * - Ciudades persistibles → Geocoding permanente (`permanent=true`)
 * - Hubs Search Box: efímeros salvo `NEXT_PUBLIC_ALLOW_TRANSPORT_HUB_PERSISTENCE=true`
 *
 * No hay caché compartida de resultados facturables hasta verificar licencia.
 */
import type { RoutePlace, RoutePlaceKind } from "@/types/itinerary"

/** Candidato de UI: no escribir en Trip.origin / route sin convertir. */
export type EphemeralPlaceSuggestion = {
  id: string
  label: string
  placeName: string
  center: { lng: number; lat: number }
  kind?: RoutePlaceKind
  countryCode?: string | null
  /** Solo hubs Search Box. */
  distanceKm?: number
}

/** Único tipo aceptado al persistir extremos en jsonb. */
export type PersistableRoutePlace = RoutePlace & {
  /** Origen del dato para auditoría local (no se serializa distinto). */
  _persistSource?: "permanent-geocode" | "hub-licensed" | "city-fallback"
}

export function isPlaceSearchEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_TRANSPORT_PLACE_SEARCH_ENABLED ?? "true")
    .trim()
    .toLowerCase()
  return raw !== "false" && raw !== "0" && raw !== "off"
}

/**
 * Persistencia de aeropuerto/estación en jsonb.
 * Default: permitido fuera de producción (prototipo); en production requiere flag explícito.
 */
export function allowTransportHubPersistence(): boolean {
  const raw = (process.env.NEXT_PUBLIC_ALLOW_TRANSPORT_HUB_PERSISTENCE ?? "").trim().toLowerCase()
  if (raw === "true" || raw === "1" || raw === "on") return true
  if (raw === "false" || raw === "0" || raw === "off") return false
  return process.env.NODE_ENV !== "production"
}

export function isHubKind(kind: RoutePlaceKind | null | undefined): boolean {
  return kind === "airport" || kind === "station" || kind === "busStation"
}

/**
 * Convierte el extremo elegido a un lugar persistible.
 * Si el hub no está licenciado, cae a la ciudad ancla (nunca inventa coords).
 */
export function toPersistableRoutePlace(
  selected: RoutePlace,
  cityAnchor: RoutePlace | null,
): PersistableRoutePlace {
  if (!isHubKind(selected.kind)) {
    return { ...selected, _persistSource: "permanent-geocode" }
  }
  if (allowTransportHubPersistence()) {
    return { ...selected, _persistSource: "hub-licensed" }
  }
  if (cityAnchor && (cityAnchor.kind === "city" || cityAnchor.kind === "address")) {
    return { ...cityAnchor, _persistSource: "city-fallback" }
  }
  // Sin ancla: persistimos label del hub pero kind=city (coords del hub no se reclaman como POI).
  return {
    label: selected.label,
    coords: selected.coords,
    kind: "city",
    _persistSource: "city-fallback",
  }
}

export function stripPersistMeta(place: PersistableRoutePlace): RoutePlace {
  return {
    label: place.label,
    coords: place.coords,
    kind: place.kind,
  }
}

/** Contadores por sesión de modal (reset al montar el formulario). */
export type PlaceSearchBudget = {
  suggests: number
  hubs: number
  maxSuggests: number
  maxHubs: number
}

export function createPlaceSearchBudget(options?: {
  maxSuggests?: number
  maxHubs?: number
}): PlaceSearchBudget {
  if (isPlaceSearchBudgetUnlimited()) {
    return {
      suggests: 0,
      hubs: 0,
      maxSuggests: Number.MAX_SAFE_INTEGER,
      maxHubs: Number.MAX_SAFE_INTEGER,
    }
  }
  return {
    suggests: 0,
    hubs: 0,
    maxSuggests: options?.maxSuggests ?? 24,
    maxHubs: options?.maxHubs ?? 8,
  }
}

/**
 * Para pruebas locales: `NEXT_PUBLIC_PLACE_SEARCH_BUDGET_UNLIMITED=true` en `.env.local`
 * (y reinicia `npm run dev`). Cerrar/reabrir el diálogo también resetea el presupuesto.
 */
export function isPlaceSearchBudgetUnlimited(): boolean {
  const raw = (process.env.NEXT_PUBLIC_PLACE_SEARCH_BUDGET_UNLIMITED ?? "")
    .trim()
    .toLowerCase()
  return raw === "true" || raw === "1" || raw === "on"
}

export function canSpendSuggest(budget: PlaceSearchBudget): boolean {
  return isPlaceSearchEnabled() && budget.suggests < budget.maxSuggests
}

export function canSpendHub(budget: PlaceSearchBudget): boolean {
  return isPlaceSearchEnabled() && budget.hubs < budget.maxHubs
}

export function recordSuggest(budget: PlaceSearchBudget): PlaceSearchBudget {
  return { ...budget, suggests: budget.suggests + 1 }
}

export function recordHub(budget: PlaceSearchBudget): PlaceSearchBudget {
  return { ...budget, hubs: budget.hubs + 1 }
}

export const PLACE_SEARCH_DISABLED_MESSAGE =
  "La búsqueda de lugares está desactivada temporalmente. Puedes cancelar o seguir sin estructurar el traslado."

export const PLACE_SEARCH_BUDGET_MESSAGE =
  "Has alcanzado el límite de búsquedas en esta sesión. Conserva el texto y guarda más tarde, o cancela."
