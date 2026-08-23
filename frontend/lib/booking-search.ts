/**
 * Enlace de búsqueda de Booking para alojamientos del asistente.
 *
 * Analogía de [`flight-search.ts`](./flight-search.ts): búsqueda prerellenada,
 * sin API ni precios. El `aid` es el identificador de afiliado propio
 * (Partner Hub). Nunca pisa el `affiliateUrl` de una fuente: el bloguero
 * conserva el suyo.
 *
 * Las fechas (`checkin`/`checkout`) y el número de viajeros se añaden al
 * pintar, no se persisten — ver [`booking-dates.ts`](./booking-dates.ts).
 */
import { ASSISTANT_SOURCE_ID } from "@/lib/item-provenance"
import { sanitizeAffiliateUrl } from "@/lib/affiliate-url"
import { bookingStayHref, isBookingStayUrl } from "@/lib/booking-dates"

/** Enganche de afiliación PROPIO: solo stays vía asistente, nunca fuentes. */
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
  const url = new URL(BOOKING_SEARCH_ORIGIN)
  url.searchParams.set("ss", ss)
  url.searchParams.set("aid", BOOKING_AFFILIATE_AID)
  url.searchParams.set("label", BOOKING_AFFILIATE_LABEL)
  url.searchParams.set("lang", "es")
  return url.toString()
}

/** Base persistible: el afiliado del ítem, o Booking nuestro si es del asistente. */
export function resolveStayAffiliateUrl(item: StayReserveInput): string | null {
  const stored = sanitizeAffiliateUrl(item.affiliateUrl)
  if (stored) return stored
  if (item.type === "stay" && item.sourceId === ASSISTANT_SOURCE_ID) {
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
