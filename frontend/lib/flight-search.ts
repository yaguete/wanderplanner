/**
 * Enlace profundo de búsqueda de vuelos (T4B.3b, Nivel 1). Sin API ni precios.
 *
 * Proveedor: Kiwi `/deep` — verificado 13 ago 2026 con curl (Location de /searchDeep):
 * 1. IATA de aeropuerto: from=BCN&to=BUD se conserva.
 * 2. Códigos de área: LON, PAR, NYC, MIL, ROM, TYO, STO, YTO, BUE, MOW, SAO,
 *    RIO, CHI, WAS, OSA, SEL, BER, BKK, IST, JKT, BHZ, DTT, TEH se conservan.
 * 3. Fechas de entrada YYYY-MM-DD (Kiwi las reescribe a DD-MM-YYYY en el redirect).
 * 4. Solo ida: omitir `return` (el redirect no lo añade).
 * 5. Pasajeros: `adults` (comprobado 2 y 9).
 * 6. Sin fechas: Kiwi rellena un rango flexible (~1 mes desde mañana), no la home.
 *
 * Ejemplo real: https://www.kiwi.com/deep?from=BCN&to=BUD&departure=2026-09-14&return=2026-09-20&adults=2
 *
 * Cambiar de buscador = otro `build` en FLIGHT_SEARCH_PROVIDER. Nada más depende de Kiwi.
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

/** Enganche de afiliación PROPIO: solo vuelos, nunca fuentes. Vacío = sin afiliado. */
export const FLIGHT_SEARCH_AFFILIATE_ID = ""

const kiwiProvider: FlightSearchProvider = {
  id: "kiwi",
  build(q) {
    const params = new URLSearchParams()
    params.set("from", q.from)
    params.set("to", q.to)
    if (q.departure) params.set("departure", q.departure)
    if (q.return) params.set("return", q.return)
    params.set("adults", String(q.adults))
    // affilid viaja en la query: rel="noreferrer" no rompe la atribución.
    if (FLIGHT_SEARCH_AFFILIATE_ID) params.set("affilid", FLIGHT_SEARCH_AFFILIATE_ID)
    return `https://www.kiwi.com/deep?${params.toString()}`
  },
}

export const FLIGHT_SEARCH_PROVIDER: FlightSearchProvider = kiwiProvider

const BLOCKING_RETURN_MODES: ReadonlySet<RouteMode> = new Set([
  "train",
  "car",
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
