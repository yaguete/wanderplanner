/**
 * Deep link de Mi viaje: `?tab=` gana al default (Ruta).
 * Las pestañas no viven en localStorage; sin este parámetro el detalle
 * arranca siempre en Ruta.
 */
import { SITE_URL } from "@/lib/site"

export const TRIP_TABS = ["itinerary", "activities", "stay", "transport", "basics"] as const

export type TripTab = (typeof TRIP_TABS)[number]

const TAB_SET = new Set<string>(TRIP_TABS)

export function parseTripTabParam(raw: string | null | undefined): TripTab | null {
  if (!raw) return null
  const t = raw.trim()
  return TAB_SET.has(t) ? (t as TripTab) : null
}

/** Pestaña de tareas que corresponde a un hit de fuente (food vive en Actividades). */
export function tabForItemType(
  kind: "item" | "basic",
  type: string,
): TripTab {
  if (kind === "basic") return "basics"
  if (type === "stay") return "stay"
  if (type === "transport") return "transport"
  return "activities"
}

export function tripDetailPath(tripId: string, tab?: TripTab | null): string {
  const base = `/trips/${tripId}`
  return tab ? `${base}?tab=${tab}` : base
}

/** URL absoluta canónica para el MCP / el widget. */
export function tripWanderplannerUrl(tripId: string, tab?: TripTab | null): string {
  return `${SITE_URL}${tripDetailPath(tripId, tab)}`
}

export function isTripTab(value: string): value is TripTab {
  return TAB_SET.has(value)
}
