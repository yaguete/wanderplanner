/**
 * Enlace profundo de búsqueda de vuelos (T4B.3b, Nivel 1). Sin API ni precios.
 *
 * Proveedor: Skyscanner via Impact `pxf.io/gOnd70?u=` — verificado 16 ago 2026
 * (Location del 301 conserva origin/destination/fechas/adultos). El referrals
 * API responde 403 a curl; el cliente previsto es el navegador.
 *
 * 1. IATA de aeropuerto: origin=BCN&destination=BUD se conserva en el `u`.
 * 2. Códigos de área: se emiten tal cual (LON, PAR, NYC…); la docs de
 *    referrals admite IATA de ciudad. Tabla 3→4 letras solo si un hop real falla.
 * 3. Fechas YYYY-MM-DD en outboundDate / inboundDate (`day-view`).
 * 4. Solo ida: omitir inboundDate.
 * 5. Pasajeros: adultsv2.
 * 6. Sin fechas: calendar-month-view (day-view exige outboundDate).
 *
 * El wrap Impact es siempre. FLIGHT_SEARCH_AFFILIATE_ID vacío = no cobramos
 * comisión; el badge «afiliado» no se enciende. El contador `outbound_click`
 * sí marca `affiliate=own` (el hop es nuestro, como el Booking del asistente).
 *
 * Cambiar de buscador = otro `build` en FLIGHT_SEARCH_PROVIDER.
 */
import { resolveAirportCode } from "@/lib/airports"
import { findLegItem } from "@/lib/route-legs"
import { dateISOForDayIndex, endDateFromStartAndNumDays, toISODate } from "@/lib/trip-dates"
import type { RouteMode, TransportRoute, Trip, UserDay } from "@/types/itinerary"

export type FlightQuery = {
  from: string
  to: string
  departure: string | null
  return: string | null
  adults: number
}

export type FlightSearchHit = {
  href: string
  from: string
  to: string
  roundTrip: boolean
}

type FlightSearchProvider = {
  id: string
  build: (q: FlightQuery) => string
}

/** Enganche de afiliación PROPIO: solo vuelos, nunca fuentes. Vacío = sin comisión / sin badge. */
export const FLIGHT_SEARCH_AFFILIATE_ID = ""

/** Hop de Impact hacia Skyscanner. Cada «Buscar vuelos» pasa por aquí. */
export const FLIGHT_SEARCH_TRACKING_URL = "https://skyscanner.pxf.io/gOnd70"

function wrapAffiliate(destination: string): string {
  const url = new URL(FLIGHT_SEARCH_TRACKING_URL)
  url.searchParams.set("u", destination)
  return url.toString()
}

function skyscannerPage(q: FlightQuery): string {
  const page = q.departure ? "day-view" : "calendar-month-view"
  const params = new URLSearchParams()
  params.set("origin", q.from)
  params.set("destination", q.to)
  if (q.departure) {
    params.set("outboundDate", q.departure)
    if (q.return) params.set("inboundDate", q.return)
    params.set("cabinclass", "economy")
  }
  params.set("adultsv2", String(q.adults))
  params.set("locale", "es-ES")
  params.set("market", "ES")
  params.set("currency", "EUR")
  return `https://www.skyscanner.net/g/referrals/v1/flights/${page}?${params.toString()}`
}

const skyscannerProvider: FlightSearchProvider = {
  id: "skyscanner",
  build(q) {
    return wrapAffiliate(skyscannerPage(q))
  },
}

export const FLIGHT_SEARCH_PROVIDER: FlightSearchProvider = skyscannerProvider

const BLOCKING_RETURN_MODES: ReadonlySet<RouteMode> = new Set([
  "train",
  "car",
  "taxi",
  "bus",
  "ferry",
  "other",
])

function clampAdults(n: number | null | undefined): number {
  const raw = n == null || !Number.isFinite(n) ? 1 : Math.floor(n)
  return Math.min(Math.max(raw, 1), 9)
}

function todayISO(): string {
  return toISODate(new Date())
}

function isPastDate(iso: string): boolean {
  return iso < todayISO()
}

/** Ida y vuelta espejadas por IATA (BCN→VIE y VIE→BCN). Open-jaw → false. */
export function transportRoutesMirrorByIata(
  a: TransportRoute,
  b: TransportRoute,
): boolean {
  const aFrom = resolveAirportCode(a.from)
  const aTo = resolveAirportCode(a.to)
  const bFrom = resolveAirportCode(b.from)
  const bTo = resolveAirportCode(b.to)
  if (!aFrom || !aTo || !bFrom || !bTo) return false
  return aFrom === bTo && aTo === bFrom
}

function returnReflectsOutbound(
  outboundFrom: string,
  outboundTo: string,
  returnRoute: TransportRoute,
): boolean {
  const backFrom = resolveAirportCode(returnRoute.from)
  const backTo = resolveAirportCode(returnRoute.to)
  if (!backFrom || !backTo) return false
  return backFrom === outboundTo && backTo === outboundFrom
}

/**
 * Hay ida y vuelta, ambas en avión, con códigos IATA invertidos.
 * Es la condición de «un solo billete» (una tarea, un enlace round-trip).
 */
export function isMirroredFlightRoundtrip(days: UserDay[]): boolean {
  const outbound = findLegItem(days, "outbound")
  const back = findLegItem(days, "return")
  const outRoute = outbound?.item.route
  const backRoute = back?.item.route
  if (!outRoute || !backRoute) return false
  if (outRoute.mode !== "flight" || backRoute.mode !== "flight") return false
  return transportRoutesMirrorByIata(outRoute, backRoute)
}

export function buildFlightSearchUrl(q: FlightQuery): string {
  return FLIGHT_SEARCH_PROVIDER.build(q)
}

export function flightSearchHrefForItem(params: {
  route: TransportRoute
  dayIndex: number
  trip: Pick<Trip, "startDate" | "numDays" | "numTravelers">
  days: UserDay[]
}): FlightSearchHit | null {
  if (params.route.mode !== "flight") return null

  const from = resolveAirportCode(params.route.from)
  const to = resolveAirportCode(params.route.to)
  if (!from || !to) return null

  const adults = clampAdults(params.trip.numTravelers)
  let departure = dateISOForDayIndex(params.trip.startDate, params.dayIndex)
  let returnDate: string | null = null

  if (params.route.leg === "outbound") {
    const back = findLegItem(params.days, "return")
    const backMode = back?.item.route?.mode
    const blocksRoundTrip =
      backMode != null && BLOCKING_RETURN_MODES.has(backMode)
    const mirrors =
      back?.item.route != null &&
      returnReflectsOutbound(from, to, back.item.route)

    if (back && !blocksRoundTrip && mirrors) {
      returnDate = dateISOForDayIndex(params.trip.startDate, back.dayIndex)
    } else if (!back && params.trip.startDate) {
      const numDays = params.trip.numDays ?? params.days.length
      returnDate = endDateFromStartAndNumDays(params.trip.startDate, numDays)
    }
  }

  if (departure && isPastDate(departure)) {
    departure = null
    returnDate = null
  }
  if (returnDate && departure && returnDate < departure) {
    returnDate = null
  }

  const href = buildFlightSearchUrl({
    from,
    to,
    departure,
    return: returnDate,
    adults,
  })
  return { href, from, to, roundTrip: Boolean(returnDate) }
}
