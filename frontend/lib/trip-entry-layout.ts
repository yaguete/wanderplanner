/**
 * Aterrizaje del detalle del viaje: qué paneles se abren la primera vez.
 *
 * El invitado que llega del CTA de un blog cae en Fuentes + Mi viaje: el
 * artículo que acaba de leer a un lado y una ruta vacía al otro. El asistente
 * queda apagado tras un toggle que nadie pulsa, así que la parte que más
 * ayuda a decidir no se descubre. Para él —y para quien acaba de registrarse
 * y este es su único viaje— el aterrizaje es Fuentes + Asistente, y en móvil
 * la sección Asistente.
 *
 * La preferencia guardada (`wp-trip-panels`) gana siempre: esto solo decide
 * cuando no hay ninguna. El detalle persiste el resultado, así que la segunda
 * visita ya lee su propia elección.
 */

export type TripPanelPrefs = {
  sources: boolean
  plan: boolean
  assistant: boolean
}

export type TripEntrySection = "sources" | "plan" | "assistant"

export const DEFAULT_TRIP_PANELS: TripPanelPrefs = {
  sources: true,
  plan: true,
  assistant: false,
}

export const ASSISTANT_FIRST_TRIP_PANELS: TripPanelPrefs = {
  sources: true,
  plan: false,
  assistant: true,
}

export type AssistantFirstInput = {
  isGuest: boolean
  /** `true` mientras `useTrips()` hidrata: sin recuento fiable no se decide. */
  tripsLoading: boolean
  /** Viajes sin archivar de la cuenta. */
  activeTripCount: number
}

/**
 * Quién necesita entrar por el asistente: el invitado (siempre tiene un solo
 * hueco) y la cuenta que aún no ha pasado de su primer viaje.
 */
export function isAssistantFirstVisitor(input: AssistantFirstInput): boolean {
  if (input.isGuest) return true
  if (input.tripsLoading) return false
  return input.activeTripCount <= 1
}

export type TripEntryInput = {
  /** `null` = nunca ha tocado los toggles en este navegador. */
  stored: TripPanelPrefs | null
  assistantFirst: boolean
  /** `?tab=` (deep link del widget MCP): el plan se abre sí o sí. */
  forcePlan: boolean
}

export function resolveEntryPanels(input: TripEntryInput): TripPanelPrefs {
  const base =
    input.stored ?? (input.assistantFirst ? ASSISTANT_FIRST_TRIP_PANELS : DEFAULT_TRIP_PANELS)
  return { ...base, plan: input.forcePlan ? true : base.plan }
}

/**
 * Sección activa en móvil. No se persiste (el dock arranca donde diga esto en
 * cada carga), así que la señal de «ya ha estado aquí» es la misma preferencia
 * de paneles: el detalle la escribe en la primera visita.
 */
export function resolveEntrySection(input: TripEntryInput): TripEntrySection {
  if (input.forcePlan) return "plan"
  if (!input.stored && input.assistantFirst) return "assistant"
  return "sources"
}
