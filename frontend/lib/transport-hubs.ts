/**
 * Decisiones puras de hubs por extremo (T4B.3 §9.1).
 * Sin I/O: el formulario consulta solo cuando el usuario pulsa «Elegir …».
 */
import type { RouteMode, RoutePlace, RoutePlaceKind } from "@/types/itinerary"

export type HubKind = "airport" | "station" | "busStation"

export function hubKindForMode(mode: RouteMode | "undecided" | null | undefined): HubKind | null {
  if (mode === "flight") return "airport"
  if (mode === "train") return "station"
  if (mode === "bus") return "busStation"
  return null
}

export function hubLabelForKind(kind: HubKind): string {
  switch (kind) {
    case "airport":
      return "aeropuerto"
    case "station":
      return "estación"
    case "busStation":
      return "estación de autobús"
  }
}

export function hubActionLabel(kind: HubKind): string {
  switch (kind) {
    case "airport":
      return "Elegir aeropuerto"
    case "station":
      return "Elegir estación"
    case "busStation":
      return "Elegir estación de autobús"
  }
}

/**
 * Ciudad/dirección ancla para buscar hubs. Si el extremo ya es hub,
 * usar el ancla de sesión (no las coords del hub) para no rebuscar alrededor del aeropuerto.
 */
export function cityAnchorForHubSearch(
  selected: RoutePlace | null,
  cityAnchor: RoutePlace | null,
): RoutePlace | null {
  if (cityAnchor && (cityAnchor.kind === "city" || cityAnchor.kind === "address")) {
    return cityAnchor
  }
  if (selected && (selected.kind === "city" || selected.kind === "address")) {
    return selected
  }
  return null
}

export function endpointNeedsHub(
  hubKind: HubKind | null,
  selected: RoutePlace | null,
): boolean {
  if (!hubKind || !selected) return false
  return selected.kind !== hubKind
}

export type HubSearchDecision =
  | { shouldSearch: false; reason: "no-hub-mode" | "no-city" | "already-hub" | "not-requested" }
  | { shouldSearch: true; proximity: { lng: number; lat: number }; kind: HubKind; cacheKey: string }

/**
 * ¿Debe este extremo disparar Search Box?
 * Solo tras acción explícita (`userRequested`) y con ciudad ancla.
 */
export function decideHubSearch(params: {
  mode: RouteMode | "undecided" | null | undefined
  selected: RoutePlace | null
  cityAnchor: RoutePlace | null
  userRequested: boolean
}): HubSearchDecision {
  const kind = hubKindForMode(params.mode)
  if (!kind) return { shouldSearch: false, reason: "no-hub-mode" }
  if (!params.userRequested) return { shouldSearch: false, reason: "not-requested" }
  if (!endpointNeedsHub(kind, params.selected)) {
    return { shouldSearch: false, reason: "already-hub" }
  }
  const city = cityAnchorForHubSearch(params.selected, params.cityAnchor)
  if (!city) return { shouldSearch: false, reason: "no-city" }
  const proximity = city.coords
  const cacheKey = `${kind}|${proximity.lng.toFixed(3)},${proximity.lat.toFixed(3)}`
  return { shouldSearch: true, proximity, kind, cacheKey }
}

export function isCityOrAddressKind(kind: RoutePlaceKind): boolean {
  return kind === "city" || kind === "address"
}
