/**
 * CTAs de alquiler añadido a mano / asistente. El href se pinta al vuelo
 * y **no** se persiste en `affiliateUrl`.
 *
 * DiscoverCars: `https://www.discovercars.com/es?a_aid=lacosmopolilla`
 * (home española). Las búsquedas reales van a `/es/search/<id>?sq=<base64>`
 * con IDs internos — no hay query string reutilizable de ciudad/fechas.
 *
 * Skyscanner: referrals `cars/day-view` (pickupPlace IATA + fechas) envuelto
 * en el mismo Impact `pxf.io/gOnd70?u=` que los vuelos. Sin IATA o sin
 * fechas de recogida/devolución el CTA no se pinta.
 */
import { resolveAirportCode } from "@/lib/airports"
import { wrapSkyscannerTrackingUrl } from "@/lib/flight-search"
import type { RoutePlace } from "@/types/itinerary"

export const DISCOVERCARS_AFFILIATE_AID = "lacosmopolilla"

const DISCOVERCARS_HOME = "https://www.discovercars.com/es"

/** Hora por defecto en el day-view de Skyscanner (`YYYY-MM-DDTHH:MM`). */
const SKYSCANNER_HIRE_TIME = "10:00"

export function isDiscoverCarsUrl(href: string | null | undefined): boolean {
  if (!href) return false
  try {
    const host = new URL(href).hostname.replace(/^www\./i, "").toLowerCase()
    return host === "discovercars.com" || host.endsWith(".discovercars.com")
  } catch {
    return false
  }
}

export function isOwnDiscoverCarsUrl(href: string | null | undefined): boolean {
  if (!href || !isDiscoverCarsUrl(href)) return false
  try {
    return new URL(href).searchParams.get("a_aid") === DISCOVERCARS_AFFILIATE_AID
  } catch {
    return false
  }
}

/** Home española + afiliado propio. Ciudad y fechas las elige la persona. */
export function buildDiscoverCarsSearchUrl(_params?: {
  city?: string | null
  pickupISO?: string | null
  returnISO?: string | null
}): string {
  const url = new URL(DISCOVERCARS_HOME)
  url.searchParams.set("a_aid", DISCOVERCARS_AFFILIATE_AID)
  return url.toString()
}

/**
 * Href del CTA de DiscoverCars. No se llama si hay `affiliateUrl` de fuente.
 * Ignora ciudad/fechas: no hay contrato de deep link.
 */
export function carRentalFormSearchHref(_params?: {
  city?: string | null
  startDate?: string | null
  pickupIndex?: number
  returnIndex?: number
  affiliateUrl?: string | null
}): string {
  return buildDiscoverCarsSearchUrl()
}

function isoDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

/**
 * Day-view de alquiler en Skyscanner, mismo hop Impact que los vuelos.
 * `pickupPlace` es IATA (ciudad o aeropuerto). Sin código o sin rango de
 * fechas (devolución posterior a la recogida) → null.
 */
export function buildSkyscannerCarHireHref(params: {
  pickup?: RoutePlace | null
  dropoff?: RoutePlace | null
  pickupISO?: string | null
  returnISO?: string | null
  currency?: string | null
}): string | null {
  const pickupISO = isoDate(params.pickupISO)
  const returnISO = isoDate(params.returnISO)
  if (!params.pickup || !pickupISO || !returnISO || returnISO <= pickupISO) return null
  const pickupPlace = resolveAirportCode(params.pickup)
  if (!pickupPlace) return null
  const dropoffPlace = params.dropoff ? resolveAirportCode(params.dropoff) : null
  const currency = params.currency?.trim().toUpperCase() || "EUR"
  // Query a mano: `URLSearchParams` + wrap Impact recodificaría el `:` de la hora
  // (`T10:00` → `%253A`) y Skyscanner no lo lee. Mismo patrón que los vuelos:
  // el `u=` es el único encode.
  const parts = [
    `pickupPlace=${pickupPlace}`,
    dropoffPlace && dropoffPlace !== pickupPlace ? `dropoffPlace=${dropoffPlace}` : null,
    `pickupTime=${pickupISO}T${SKYSCANNER_HIRE_TIME}`,
    `dropoffTime=${returnISO}T${SKYSCANNER_HIRE_TIME}`,
    "locale=es-ES",
    "market=ES",
    `currency=${currency}`,
  ].filter((part): part is string => Boolean(part))
  return wrapSkyscannerTrackingUrl(
    `https://www.skyscanner.net/g/referrals/v1/cars/day-view?${parts.join("&")}`,
  )
}
