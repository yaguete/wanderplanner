/**
 * Discriminador de transporte: trayecto A→B vs coche propio vs alquiler.
 * Solo tipos; no importa item-span / trip-tasks / route-legs (evitar ciclos).
 *
 * Un alquiler no se detecta por nombre, vendor, igualdad de extremos ni
 * `spanDays`. Hace falta `mode: "car"`, `carUse: "rental"` y sin `leg`.
 */
import type {
  RouteCarUse,
  RouteLeg,
  RouteMode,
  RoutePlace,
  TransportRoute,
  UserDayItem,
} from "@/types/itinerary"

export const DEFAULT_CAR_RENTAL_NAME = "Coche de alquiler"

export type TransportKindProbe = {
  type?: string | null
  route?: {
    mode?: RouteMode | null
    carUse?: RouteCarUse | null
    leg?: RouteLeg | null
  } | null
}

export function isRouteCarUse(value: unknown): value is RouteCarUse {
  return value === "owned" || value === "rental"
}

export function isCarRentalRoute(
  route: TransportKindProbe["route"] | TransportRoute | null | undefined,
): boolean {
  return (
    route?.mode === "car" &&
    route.carUse === "rental" &&
    (route.leg == null || route.leg === undefined)
  )
}

export function isOwnedCarRoute(
  route: TransportKindProbe["route"] | TransportRoute | null | undefined,
): boolean {
  return (
    route?.mode === "car" &&
    route.carUse === "owned" &&
    (route.leg == null || route.leg === undefined)
  )
}

export function isCarRentalItem(item: TransportKindProbe): boolean {
  return item.type === "transport" && isCarRentalRoute(item.route)
}

export function isOwnedCarItem(item: TransportKindProbe): boolean {
  return item.type === "transport" && isOwnedCarRoute(item.route)
}

function copyRoutePlace(place: RoutePlace): RoutePlace {
  return {
    label: place.label,
    coords: { lng: place.coords.lng, lat: place.coords.lat },
    kind: place.kind,
  }
}

/**
 * `from` = recogida. `to` = copia si no hay entrega distinta; si no, la
 * ciudad de entrega. Sigue sin ser un trayecto: comparar por valor.
 */
export function rentalRouteFromPickup(
  pickup: RoutePlace,
  dropoff?: RoutePlace | null,
): TransportRoute {
  const same = dropoff == null || sameRoutePlace(pickup, dropoff)
  return {
    from: pickup,
    to: copyRoutePlace(same || !dropoff ? pickup : dropoff),
    mode: "car",
    carUse: "rental",
  }
}

export function rentalPickupPlace(
  route: TransportRoute | null | undefined,
): RoutePlace | null {
  if (!isCarRentalRoute(route) || !route) return null
  return route.from
}

/** Ciudad de entrega si es distinta de la recogida; si no, `null`. */
export function rentalDropoffPlace(
  route: TransportRoute | null | undefined,
): RoutePlace | null {
  if (!isCarRentalRoute(route) || !route) return null
  return sameRoutePlace(route.from, route.to) ? null : route.to
}

export function rentalRegionLabel(route: TransportRoute): string {
  if (sameRoutePlace(route.from, route.to)) return route.from.label
  return `${route.from.label} → ${route.to.label}`
}

export function rentalDisplayName(vendor?: string | null): string {
  const company = vendor?.trim()
  return company || DEFAULT_CAR_RENTAL_NAME
}

/**
 * Nombre para lecturas públicas (Compartir, MCP). No sustituye el `name`
 * persistido. Doble prefijo si el vendor ya es el genérico.
 */
export function rentalDescriptiveName(vendor?: string | null): string {
  const company = vendor?.trim()
  if (!company || company === DEFAULT_CAR_RENTAL_NAME) return DEFAULT_CAR_RENTAL_NAME
  if (company.startsWith(`${DEFAULT_CAR_RENTAL_NAME} · `)) return company
  return `${DEFAULT_CAR_RENTAL_NAME} · ${company}`
}

/**
 * Rechaza combinaciones inválidas en escrituras nuevas. La lectura sigue
 * saneando: un `carUse` suelto en un vuelo legacy no debe tumbar el viaje.
 */
export function transportWriteError(route: {
  mode?: RouteMode | null
  carUse?: RouteCarUse | string | null
  leg?: RouteLeg | string | null
}): string | null {
  const carUse = route.carUse
  if (carUse != null && carUse !== "owned" && carUse !== "rental") {
    return "Uso de coche no válido."
  }
  if (carUse !== "owned" && carUse !== "rental") return null
  if (route.mode !== "car") {
    return "El uso del coche solo aplica a un traslado en coche."
  }
  if (route.leg === "outbound" || route.leg === "return") {
    return carUse === "rental"
      ? "Un tramo de ida o vuelta no puede ser un alquiler."
      : "Un tramo de ida o vuelta no admite ese uso de coche."
  }
  return null
}

/**
 * Último índice de recogida: el penúltimo día. `-1` si el viaje no cabe
 * un alquiler (hace falta un día de devolución posterior).
 */
export function rentalMaxPickupIndex(numDays: number): number {
  if (!Number.isInteger(numDays) || numDays < 2) return -1
  return numDays - 2
}

/** Primer índice de devolución: el día siguiente a la recogida. */
export function rentalMinReturnIndex(pickupIndex: number): number {
  if (!Number.isInteger(pickupIndex) || pickupIndex < 0) return -1
  return pickupIndex + 1
}

/** spanDays inclusivo: recogida día 2 + devolución día 5 → 4. Mínimo 2. */
export function rentalCoverageDays(
  pickupIndex: number,
  returnIndex: number,
): number {
  if (
    !Number.isInteger(pickupIndex) ||
    !Number.isInteger(returnIndex) ||
    pickupIndex < 0 ||
    returnIndex <= pickupIndex
  ) {
    return 1
  }
  return returnIndex - pickupIndex + 1
}

export function rentalReturnIndex(
  pickupIndex: number,
  spanDays: number | undefined,
): number {
  const coverage = spanDays != null && spanDays >= 1 ? Math.floor(spanDays) : 1
  return pickupIndex + Math.max(coverage, 1) - 1
}

/**
 * Política de tarea del transporte. El medio con billete sigue siendo
 * `isBookableTransportMode` en trip-tasks; aquí van las variantes de coche.
 */
export type TransportReservePolicy = {
  bookable: boolean
  /** Tareas: Hecho para no reservables (legacy, `other`, sin medio). */
  usesDoneChip: boolean
  /**
   * Formulario de alta/edición: Hecho solo en coche propio explícito.
   * «Aún no lo sé», Otro y coches legacy conservan Reservado/Pagado.
   */
  formUsesDoneChip: boolean
  /** Sin estado → `main` (no triaje). */
  skipTriageWhenUntouched: boolean
}

export function transportReservePolicy(
  route?: TransportKindProbe["route"] | TransportRoute | null,
): TransportReservePolicy {
  if (isCarRentalRoute(route)) {
    return {
      bookable: true,
      usesDoneChip: false,
      formUsesDoneChip: false,
      skipTriageWhenUntouched: true,
    }
  }
  if (isOwnedCarRoute(route)) {
    return {
      bookable: false,
      usesDoneChip: true,
      formUsesDoneChip: true,
      skipTriageWhenUntouched: true,
    }
  }
  const mode = route?.mode ?? null
  const bookable =
    mode === "flight" ||
    mode === "train" ||
    mode === "bus" ||
    mode === "ferry" ||
    mode === "taxi"
  return {
    bookable,
    usesDoneChip: !bookable,
    formUsesDoneChip: false,
    skipTriageWhenUntouched: bookable,
  }
}

export function sameRoutePlace(a: RoutePlace, b: RoutePlace): boolean {
  return (
    a.label === b.label &&
    a.kind === b.kind &&
    a.coords.lng === b.coords.lng &&
    a.coords.lat === b.coords.lat
  )
}
