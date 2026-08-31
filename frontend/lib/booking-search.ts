/**
 * Enlace de búsqueda de Booking para alojamientos propios (asistente o
 * alta a mano). Analogía de [`flight-search.ts`](./flight-search.ts):
 * búsqueda prerellenada, sin API ni precios. El `aid` es el identificador
 * de afiliado propio (Partner Hub). Nunca pisa el `affiliateUrl` de una
 * fuente: el bloguero conserva el suyo.
 *
 * Las fechas (`checkin`/`checkout`) y el número de viajeros se añaden al
 * pintar, no se persisten — ver [`booking-dates.ts`](./booking-dates.ts).
 */
import { isSyntheticSourceId } from "@/lib/item-provenance"
import { sanitizeAffiliateUrl } from "@/lib/affiliate-url"
import { bookingStayHref, isBookingStayUrl } from "@/lib/booking-dates"

/** Enganche de afiliación PROPIO: stays del asistente o a mano, nunca fuentes. */
export const BOOKING_AFFILIATE_AID = "1607597"

/** Label de campaña del Partner Hub (va junto al aid). */
export const BOOKING_AFFILIATE_LABEL = "v3.cmsxdw3896p5v093075hp4201"

const BOOKING_SEARCH_ORIGIN = "https://www.booking.com/searchresults.es.html"

export type StayReserveInput = {
  type?: string | null
  name: string
  region?: string | null
  sourceId?: string | null
  affiliateUrl?: string | null
}

function clampAdults(n: number | null | undefined): number {
  const raw = n == null || !Number.isFinite(n) ? 1 : Math.floor(n)
  return Math.min(Math.max(raw, 1), 9)
}

function searchQuery(name: string, region?: string | null): string {
  const n = name.trim()
  const r = (region ?? "").trim()
  if (!n) return ""
  if (!r) return n
  const nFold = n.toLocaleLowerCase("es")
  const rFold = r.toLocaleLowerCase("es")
  if (nFold.includes(rFold)) return n
  return `${n} ${r}`
}

export function isOwnBookingAffiliateUrl(href: string | null | undefined): boolean {
  if (!href || !isBookingStayUrl(href)) return false
  try {
    return new URL(href).searchParams.get("aid") === BOOKING_AFFILIATE_AID
  } catch {
    return false
  }
}

function bookingSearchUrl(ss: string): string {
  const url = new URL(BOOKING_SEARCH_ORIGIN)
  url.searchParams.set("ss", ss)
  url.searchParams.set("aid", BOOKING_AFFILIATE_AID)
  url.searchParams.set("label", BOOKING_AFFILIATE_LABEL)
  url.searchParams.set("lang", "es")
  return url.toString()
}

/**
 * URL de searchresults.es.html con `ss` (nombre ± región), `aid` y `label`.
 * Sin fechas ni viajeros: eso va al pintar.
 */
export function buildAssistantBookingSearchUrl(params: {
  name: string
  region?: string | null
}): string | null {
  const ss = searchQuery(params.name, params.region)
  if (!ss) return null
  return bookingSearchUrl(ss)
}

/**
 * Búsqueda por destino (alta manual, antes de nombrar el hotel).
 * El `ss` es la ciudad o dirección; fechas y viajeros van al pintar.
 */
export function buildDestinationBookingSearchUrl(destination: string): string | null {
  const ss = destination.trim()
  if (!ss) return null
  return bookingSearchUrl(ss)
}

/** Base persistible: el afiliado del ítem, o Booking nuestro si es propio.
 *
 * Fuente → el selector ya propaga `affiliateUrl` del bloguero; no sustituir.
 * Asistente / manual → mismo `aid` (el del Partner Hub). Canibalizar al
 * partner rompe el canal de distribución: un stay de fuente nunca debe
 * caer al aid propio aunque el manual/asistente sí lo use.
 */
export function resolveStayAffiliateUrl(item: StayReserveInput): string | null {
  const stored = sanitizeAffiliateUrl(item.affiliateUrl)
  if (stored) return stored
  if (
    item.type === "stay" &&
    item.sourceId &&
    isSyntheticSourceId(item.sourceId)
  ) {
    return buildAssistantBookingSearchUrl({ name: item.name, region: item.region })
  }
  return null
}

function withOwnBookingPaintParams(
  href: string,
  currency?: string | null,
  numTravelers?: number | null,
): string {
  if (!isOwnBookingAffiliateUrl(href)) return href
  try {
    const url = new URL(href)
    const cur = (currency ?? "").trim().toUpperCase()
    if (/^[A-Z]{3}$/.test(cur)) {
      url.searchParams.set("selected_currency", cur)
    }
    if (numTravelers != null) {
      url.searchParams.set("group_adults", String(clampAdults(numTravelers)))
    }
    return url.toString()
  } catch {
    return href
  }
}

/**
 * Href de reserva al pintar: fechas del viaje +, si es nuestro aid,
 * divisa y viajeros. No muta el jsonb.
 */
export function stayReserveHref(params: StayReserveInput & {
  startDate: string | null
  dayIndexes: readonly number[]
  currency?: string | null
  numTravelers?: number | null
}): string | null {
  const base = resolveStayAffiliateUrl(params)
  if (!base) return null
  const dated = bookingStayHref({
    href: base,
    startDate: params.startDate,
    dayIndexes: params.dayIndexes,
  }) ?? base
  return withOwnBookingPaintParams(dated, params.currency, params.numTravelers)
}

/**
 * Href del CTA de Booking en el formulario de alta: destino + fechas del
 * check-in/noches + viajeros/divisa. No se persiste en `affiliateUrl`.
 *
 * Misma tabla que `activityDiscoveryHrefs` / `resolveStayAffiliateUrl`:
 * enlace guardado o procedencia de fuente → no generar búsqueda.
 */
export function stayFormSearchHref(params: {
  destination: string
  startDate: string | null
  dayIndexes: readonly number[]
  currency?: string | null
  numTravelers?: number | null
  affiliateUrl?: string | null
  sourceId?: string | null
}): string | null {
  if (sanitizeAffiliateUrl(params.affiliateUrl)) return null
  if (params.sourceId && !isSyntheticSourceId(params.sourceId)) return null
  const base = buildDestinationBookingSearchUrl(params.destination)
  if (!base) return null
  const dated =
    bookingStayHref({
      href: base,
      startDate: params.startDate,
      dayIndexes: params.dayIndexes,
    }) ?? base
  return withOwnBookingPaintParams(dated, params.currency, params.numTravelers)
}
