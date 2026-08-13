/**
 * Helpers puros de tramos de ida/vuelta (T4B.3).
 * Parsing defensivo, naming, localización, propuesta de extremos y reanclaje.
 */
import type {
  RouteLeg,
  RouteMode,
  RoutePlace,
  RoutePlaceKind,
  TransportRoute,
  Trip,
  TripOrigin,
  UserDay,
  UserDayItem,
} from "@/types/itinerary"
import { MANUAL_SOURCE_ID } from "@/lib/item-provenance"

export const ROUTE_MODES: readonly RouteMode[] = [
  "car",
  "train",
  "bus",
  "flight",
  "ferry",
  "other",
] as const

export const ROUTE_PLACE_KINDS: readonly RoutePlaceKind[] = [
  "airport",
  "station",
  "busStation",
  "city",
  "address",
  "other",
] as const

export const ROUTE_LEGS: readonly RouteLeg[] = ["outbound", "return"] as const

const ROUTE_MODE_SET = new Set<string>(ROUTE_MODES)
const ROUTE_PLACE_KIND_SET = new Set<string>(ROUTE_PLACE_KINDS)
const ROUTE_LEG_SET = new Set<string>(ROUTE_LEGS)

export function isRouteLeg(value: unknown): value is RouteLeg {
  return typeof value === "string" && ROUTE_LEG_SET.has(value)
}

export function isRouteMode(value: unknown): value is RouteMode {
  return typeof value === "string" && ROUTE_MODE_SET.has(value)
}

export function formatLegName(fromLabel: string, toLabel: string): string {
  return `${fromLabel.trim()} → ${toLabel.trim()}`
}

export function routeModeLabel(mode: RouteMode | null | undefined): string {
  switch (mode) {
    case "car":
      return "Coche"
    case "train":
      return "Tren"
    case "bus":
      return "Autobús"
    case "flight":
      return "Avión"
    case "ferry":
      return "Ferry"
    case "other":
      return "Otro"
    default:
      return "Medio por decidir"
  }
}

export function isRouteLegItem(item: Pick<UserDayItem, "route">): boolean {
  return isRouteLeg(item.route?.leg)
}

export function findLegItem(
  days: UserDay[],
  leg: RouteLeg,
): { dayIndex: number; itemIndex: number; item: UserDayItem } | null {
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = days[dayIndex]!
    for (let itemIndex = 0; itemIndex < day.items.length; itemIndex++) {
      const item = day.items[itemIndex]!
      if (item.type === "transport" && item.route?.leg === leg) {
        return { dayIndex, itemIndex, item }
      }
    }
  }
  return null
}

export function hasRouteLeg(days: UserDay[], leg: RouteLeg): boolean {
  return findLegItem(days, leg) != null
}

function parseLngLat(raw: unknown): { lng: number; lat: number } | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const c = raw as Record<string, unknown>
  if (typeof c.lng !== "number" || typeof c.lat !== "number") return null
  const { lng, lat } = c
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lng < -180 ||
    lng > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return null
  }
  return { lng, lat }
}

export function parseRoutePlace(raw: unknown): RoutePlace | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const label = typeof obj.label === "string" ? obj.label.trim() : ""
  if (!label) return null
  const coords = parseLngLat(obj.coords)
  if (!coords) return null
  const kindRaw = typeof obj.kind === "string" ? obj.kind : "other"
  const kind: RoutePlaceKind = ROUTE_PLACE_KIND_SET.has(kindRaw)
    ? (kindRaw as RoutePlaceKind)
    : "other"
  return { label, coords, kind }
}

export function parseTransportRoute(raw: unknown): TransportRoute | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const from = parseRoutePlace(obj.from)
  const to = parseRoutePlace(obj.to)
  if (!from || !to) return null

  const mode: RouteMode | null =
    obj.mode == null || obj.mode === ""
      ? null
      : isRouteMode(obj.mode)
        ? obj.mode
        : null

  const route: TransportRoute = { from, to, mode }
  if (isRouteLeg(obj.leg)) route.leg = obj.leg
  return route
}

/**
 * Limpia un ítem cargado del jsonb: si `route` está corrupto, lo elimina
 * sin tumbar el resto del viaje.
 */
export function sanitizeUserDayItem(item: UserDayItem): UserDayItem {
  if (item.route === undefined) return item
  const route = parseTransportRoute(item.route)
  if (!route) {
    const rest = { ...item }
    delete rest.route
    return rest
  }
  if (item.route === route) return item
  return { ...item, route }
}

export function sanitizeUserDays(days: UserDay[]): UserDay[] {
  return days.map((d) => {
    const items = d.items.map(sanitizeUserDayItem)
    const changed = items.some((it, i) => it !== d.items[i])
    return changed ? { ...d, items } : d
  })
}

export function originToRoutePlace(origin: TripOrigin): RoutePlace {
  return {
    label: origin.label,
    coords: origin.coords,
    kind: "city",
  }
}

/**
 * Primer/último ítem con coordenadas que NO es un leg de ida/vuelta.
 * Preferimos stay/activity (los que hoy tienen coords en el mapa).
 */
function firstRoutablePoint(items: UserDayItem[]): RoutePlace | null {
  for (const item of items) {
    if (isRouteLegItem(item)) continue
    if (!item.coords) continue
    if (item.type !== "stay" && item.type !== "activity") continue
    return {
      label: item.region?.trim() || item.name,
      coords: item.coords,
      kind: "city",
    }
  }
  // Fallback: cualquier ítem no-leg con coords.
  for (const item of items) {
    if (isRouteLegItem(item)) continue
    if (!item.coords) continue
    return {
      label: item.region?.trim() || item.name,
      coords: item.coords,
      kind: "city",
    }
  }
  return null
}

function lastRoutablePoint(items: UserDayItem[]): RoutePlace | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    if (isRouteLegItem(item)) continue
    if (!item.coords) continue
    if (item.type !== "stay" && item.type !== "activity") continue
    return {
      label: item.region?.trim() || item.name,
      coords: item.coords,
      kind: "city",
    }
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    if (isRouteLegItem(item)) continue
    if (!item.coords) continue
    return {
      label: item.region?.trim() || item.name,
      coords: item.coords,
      kind: "city",
    }
  }
  return null
}

export type LegEndpointSuggestion = {
  from: RoutePlace | null
  to: RoutePlace | null
}

/**
 * Propone extremos para el formulario de ida/vuelta.
 * Lugares normales (ciudades), nunca aeropuertos.
 * No siembra el input con `trip.name`: parece resuelto y bloquea el envío.
 */
export function suggestLegEndpoints(
  trip: Pick<Trip, "origin" | "days">,
  leg: RouteLeg,
): LegEndpointSuggestion {
  const days = trip.days
  const firstDay = days[0]
  const lastDay = days[days.length - 1]

  if (leg === "outbound") {
    const from = trip.origin ? originToRoutePlace(trip.origin) : null
    const to = firstDay ? firstRoutablePoint(firstDay.items) : null
    return { from, to }
  }

  const from = lastDay ? lastRoutablePoint(lastDay.items) : null
  const to = trip.origin ? originToRoutePlace(trip.origin) : null
  return { from, to }
}

/**
 * Reancla ida al día 1 y vuelta al último día tras cambios de calendario.
 * No crea ni borra legs: solo los mueve si están en el día equivocado.
 */
export function reanchorRouteLegs(days: UserDay[]): UserDay[] {
  if (days.length === 0) return days

  const outbound = findLegItem(days, "outbound")
  const returnLeg = findLegItem(days, "return")

  const needsOutboundMove = outbound != null && outbound.dayIndex !== 0
  const needsReturnMove =
    returnLeg != null && returnLeg.dayIndex !== days.length - 1

  if (!needsOutboundMove && !needsReturnMove) return days

  // Extraer los ítems a mover.
  const next = days.map((d) => ({ ...d, items: [...d.items] }))

  let outboundItem: UserDayItem | null = null
  let returnItem: UserDayItem | null = null

  if (needsOutboundMove && outbound) {
    outboundItem = outbound.item
    next[outbound.dayIndex] = {
      ...next[outbound.dayIndex]!,
      items: next[outbound.dayIndex]!.items.filter((i) => i.id !== outbound.item.id),
    }
  }
  // Recalcular return tras posible extracción de outbound (índices pueden haber cambiado).
  if (needsReturnMove && returnLeg) {
    // Buscar de nuevo en `next` por id.
    const found = findLegItem(next, "return")
    if (found) {
      returnItem = found.item
      next[found.dayIndex] = {
        ...next[found.dayIndex]!,
        items: next[found.dayIndex]!.items.filter((i) => i.id !== found.item.id),
      }
    }
  }

  if (outboundItem) {
    const first = next[0]!
    // Evitar duplicado si ya está (no debería).
    if (!first.items.some((i) => i.id === outboundItem!.id)) {
      next[0] = { ...first, items: [outboundItem, ...first.items] }
    }
  }
  if (returnItem) {
    const lastIdx = next.length - 1
    const last = next[lastIdx]!
    if (!last.items.some((i) => i.id === returnItem!.id)) {
      next[lastIdx] = { ...last, items: [...last.items, returnItem] }
    }
  }

  return next
}

/**
 * Construye el UserDayItem de un tramo a partir de la ruta resuelta.
 * `name` = «A → B»; `coords` = destino (ver comentario en types).
 */
export function buildRouteLegItem(params: {
  route: TransportRoute & { leg: RouteLeg }
  detail?: string | null
  vendor?: string | null
  existingId?: string
  existingSourceItemId?: string
}): UserDayItem {
  const { route, detail, vendor, existingId, existingSourceItemId } = params
  return {
    id: existingId ?? crypto.randomUUID(),
    sourceItemId: existingSourceItemId ?? `manual-${crypto.randomUUID()}`,
    sourceId: MANUAL_SOURCE_ID,
    type: "transport",
    name: formatLegName(route.from.label, route.to.label),
    detail: detail?.trim() ? detail.trim() : null,
    sourceAuthor: "Tú",
    region: route.to.label,
    // Destino del tramo. En vuelta = casa; T4B.6 usará route.from/to.
    coords: route.to.coords,
    vendor: vendor?.trim() ? vendor.trim() : null,
    route,
  }
}

/**
 * Inserta o reemplaza el leg en los días correctos.
 * Ida → índice 0 del día 1; vuelta → final del último día.
 * Máximo un outbound y un return por viaje.
 */
export function upsertLegInDays(
  days: UserDay[],
  item: UserDayItem,
): UserDay[] {
  const leg = item.route?.leg
  if (!isRouteLeg(leg) || days.length === 0) return days

  const targetDayIndex = leg === "outbound" ? 0 : days.length - 1
  const existing = findLegItem(days, leg)

  const next = days.map((d) => ({ ...d, items: [...d.items] }))

  if (existing) {
    // Quitar el anterior (puede estar en otro día).
    next[existing.dayIndex] = {
      ...next[existing.dayIndex]!,
      items: next[existing.dayIndex]!.items.filter((i) => i.id !== existing.item.id),
    }
  }

  const target = next[targetDayIndex]!
  if (leg === "outbound") {
    next[targetDayIndex] = { ...target, items: [item, ...target.items] }
  } else {
    next[targetDayIndex] = { ...target, items: [...target.items, item] }
  }
  return next
}

/**
 * ¿Hay contenido «real» que impida adoptar el calendario de una guía partner?
 * Los legs de ida/vuelta NO cuentan: el usuario puede rellenarlos antes de que
 * llegue la fuente y aun así debe adoptar totalDays + startDate.
 */
export function dayHasNonLegContent(day: UserDay): boolean {
  if (day.label.trim()) return true
  return day.items.some((i) => !isRouteLegItem(i))
}

/**
 * Ancla de casa para `trip.origin`: solo ciudad/dirección.
 * Nunca aeropuerto, estación ni otro hub (T4B.3 §8.2).
 */
export function tripOriginFromCityAnchor(
  place: RoutePlace | null | undefined,
): TripOrigin | null {
  if (!place) return null
  if (place.kind !== "city" && place.kind !== "address") return null
  return {
    label: place.label,
    countryCode: null,
    coords: place.coords,
  }
}

/**
 * Extrae los legs de los días que se van a borrar y los reinserta en el
 * calendario restante. Sin esto, borrar el último día destruye la vuelta
 * (y su coste) sin aviso — un leg es del viaje, no de ese día concreto.
 */
export function rescueLegsFromRemovedDays(
  before: UserDay[],
  after: UserDay[],
): UserDay[] {
  if (after.length === 0) return after
  const removedIds = new Set(
    before.filter((d) => !after.some((a) => a.id === d.id)).map((d) => d.id),
  )
  if (removedIds.size === 0) return after

  const rescued: UserDayItem[] = []
  for (const day of before) {
    if (!removedIds.has(day.id)) continue
    for (const item of day.items) {
      if (isRouteLegItem(item)) rescued.push(item)
    }
  }
  if (rescued.length === 0) return after

  let next = after
  for (const item of rescued) {
    // Si el leg ya está en after (p. ej. no se borró su día), no duplicar.
    if (findLegItem(next, item.route!.leg!)) continue
    next = upsertLegInDays(next, item)
  }
  return next
}
