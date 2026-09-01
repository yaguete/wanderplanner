/**
 * Sección Tus viajes / Tus fuentes en `/trips`.
 * `?view=fuentes` manda; sin query, `localStorage` `wp-trips-home`.
 */
export const TRIPS_HOME_KEY = "wp-trips-home"
export const TRIPS_HOME_VIEW_PARAM = "view"
export const TRIPS_HOME_VIEW_FUENTES = "fuentes"

export type TripsHomeSection = "trips" | "sources"

export const TRIPS_HOME_SUBTITLE = {
  trips: "Consolida fuentes en las que confías en una ruta editable.",
  sources: "El contenido más reciente de tus fuentes de inspiración",
  directory: "Encuentra inspiración en estas referencias",
} as const

export function parseTripsHomeViewParam(
  raw: string | null | undefined,
): TripsHomeSection | null {
  const t = (raw ?? "").trim().toLowerCase()
  if (t === "fuentes" || t === "sources") return "sources"
  if (t === "viajes" || t === "trips") return "trips"
  return null
}

export function tripsHomeSubtitle(
  section: TripsHomeSection,
  directory = false,
): string {
  if (section === "trips") return TRIPS_HOME_SUBTITLE.trips
  if (directory) return TRIPS_HOME_SUBTITLE.directory
  return TRIPS_HOME_SUBTITLE.sources
}

/** Primera pintura (SSR + hidratación). La query manda; el storage va después de montar. */
export function initialTripsHomeSection(
  viewParam: string | null | undefined,
): TripsHomeSection {
  return parseTripsHomeViewParam(viewParam) ?? "trips"
}

export function readStoredTripsHomeSection(): TripsHomeSection {
  if (typeof window === "undefined") return "trips"
  try {
    return localStorage.getItem(TRIPS_HOME_KEY) === "sources" ? "sources" : "trips"
  } catch {
    return "trips"
  }
}

export function writeStoredTripsHomeSection(section: TripsHomeSection): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(TRIPS_HOME_KEY, section)
  } catch {
    /* private mode */
  }
}

export function readTripsHomeSection(): TripsHomeSection {
  if (typeof window === "undefined") return "trips"
  const fromQuery = parseTripsHomeViewParam(
    new URLSearchParams(window.location.search).get(TRIPS_HOME_VIEW_PARAM),
  )
  if (fromQuery) return fromQuery
  return readStoredTripsHomeSection()
}

/** `replaceState`, no `router.replace`: remontaría el listado. Conserva el resto de query. */
export function replaceTripsHomeViewInUrl(section: TripsHomeSection): void {
  if (typeof window === "undefined") return
  const params = new URLSearchParams(window.location.search)
  if (section === "sources") params.set(TRIPS_HOME_VIEW_PARAM, TRIPS_HOME_VIEW_FUENTES)
  else params.delete(TRIPS_HOME_VIEW_PARAM)
  const query = params.toString()
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}`,
  )
}
