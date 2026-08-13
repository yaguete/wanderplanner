/**
 * Reductor puro del estado de geocodificación del mapa.
 * Conserva `resolved`/`failed` durante un refresco para no vaciar marcadores.
 */
import type { LngLat } from "@/lib/mapbox"

export type GeocodePoint = {
  id: string
  name: string
  type: "stay" | "activity" | "food" | "hub" | "endpoint"
  dayNumber: number
  region?: string | null
  coords?: { lng: number; lat: number } | null
  hubRole?: "arrival" | "departure"
}

export type GeocodeResolved = {
  point: GeocodePoint
  /** Coordenada real (geometría de la ruta y km del pie). */
  coord: LngLat
  /** Coordenada del marcador si se ha repartido un grupo apilado. */
  displayCoord?: LngLat
  precision?: "exact" | "approximate"
  anchorLabel?: string
}

export type GeocodeState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready" | "refreshing"
      resolved: GeocodeResolved[]
      failed: { point: GeocodePoint }[]
    }
  | { status: "error"; message: string }

export type GeocodeAction =
  | { type: "reset-empty" }
  | { type: "begin"; hasPrevious: boolean }
  | {
      type: "success"
      resolved: GeocodeResolved[]
      failed: { point: GeocodePoint }[]
    }
  | { type: "error"; message: string }

/** Último resultado útil (ready o refreshing). */
export function geocodeDisplayResult(
  state: GeocodeState,
): { resolved: GeocodeResolved[]; failed: { point: GeocodePoint }[] } | null {
  if (state.status === "ready" || state.status === "refreshing") {
    return { resolved: state.resolved, failed: state.failed }
  }
  return null
}

export function reduceGeocode(state: GeocodeState, action: GeocodeAction): GeocodeState {
  switch (action.type) {
    case "reset-empty":
      return { status: "ready", resolved: [], failed: [] }
    case "begin": {
      if (action.hasPrevious && (state.status === "ready" || state.status === "refreshing")) {
        return {
          status: "refreshing",
          resolved: state.resolved,
          failed: state.failed,
        }
      }
      return { status: "loading" }
    }
    case "success":
      return {
        status: "ready",
        resolved: action.resolved,
        failed: action.failed,
      }
    case "error":
      return { status: "error", message: action.message }
    default:
      return state
  }
}
