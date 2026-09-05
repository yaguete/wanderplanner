/**
 * CTAs de alojamiento en el formulario (alta a mano, edición y consolidar
 * desde fuente). Booking sigue en [`booking-search.ts`](./booking-search.ts)
 * — tiene `aid` propio. Airbnb y HomeExchange son búsqueda prerellenada
 * **sin** comisión hasta que haya enganche; analogía de Skyscanner en vuelos.
 *
 * Precedencia del formulario:
 * 1. `affiliateUrl` guardado → no generar búsqueda (el enlace del autor gana).
 * 2. Sin enlace → nuestros buscadores. En un ítem de fuente hace falta
 *    `allowFromSource` (solo el diálogo lo pasa). `resolveStayAffiliateUrl`
 *    de la tarjeta **no** lleva el flag: un stay de fuente sin afiliado no
 *    pinta Booking en Ruta.
 *
 * El href **no se persiste** en `affiliateUrl`. Fechas y viajeros se pintan
 * aquí, igual que en Booking.
 *
 * Contratos verificados en navegador el 1 sep 2026:
 * - Airbnb `GET /s/homes?query&checkin&checkout&adults&locale=es&currency` →
 *   301 a `/s/{query}/homes` conservando todo; la página pinta «Alojamientos
 *   en {query}», el rango de fechas y los viajeros.
 * - HomeExchange `GET /es/search-v2/{ciudad}?date_ranges=from_to&adults=N`.
 *   `date_ranges` es `YYYY-MM-DD_YYYY-MM-DD` y filtra de verdad (Praga: 373
 *   casas sin fechas, 48 con ellas); `adults` también (17 con `adults=9`).
 *   Stay22 no tiene hop a Airbnb ni a HomeExchange.
 *
 * ⚠️ El **`/es` no es cosmético**. La ciudad va en el path y la app la
 * geocodifica con el autocompletado de Jawg quedándose con el primer
 * resultado (`generateLocationFilters` → `getPlaceSuggestions(query)[0]`),
 * y ese ranking depende del idioma de la ruta. Sin `/es` los topónimos
 * españoles se van a otro continente: `Edimburgo` → un local de Torreón
 * (México), `Londres` → Saint-Martin-de-Londres (Francia), `Nueva York` →
 * una localidad mexicana. Con `/es` los cuatro casos (y Praga, Atenas,
 * Berlín, Milán) resuelven a la ciudad correcta.
 *
 * Residuo conocido: `Roma` resuelve a **Rumanía** (el geocodificador
 * prefiere el país). No se arregla desde la URL — añadir el país lo empeora
 * (`Roma, Italia` → un restaurante en EE. UU.), y por eso el destino va
 * recortado al primer segmento antes de la coma, igual que en Civitatis.
 */
import { isSyntheticSourceId } from "@/lib/item-provenance"
import { sanitizeAffiliateUrl } from "@/lib/affiliate-url"
import { bookingOmitsStayDates, stayDatesFromDayIndexes } from "@/lib/booking-dates"
import { stayFormSearchHref } from "@/lib/booking-search"
import { collectCountryCodesFromHint, getCountryByCode } from "@/lib/countries"

const AIRBNB_SEARCH_ORIGIN = "https://www.airbnb.es/s/homes"
const HOME_EXCHANGE_SEARCH_ORIGIN = "https://www.homeexchange.com"
/** El `/es` decide el geocodificador del path: ver la cabecera del fichero. */
const HOME_EXCHANGE_SEARCH_PATH = "/es/search-v2"

export type StayDiscoveryHrefs = {
  booking: string | null
  airbnb: string | null
  homeExchange: string | null
}

function clampAdults(n: number | null | undefined): number {
  const raw = n == null || !Number.isFinite(n) ? 1 : Math.floor(n)
  return Math.min(Math.max(raw, 1), 9)
}

function firstCommaSegment(raw: string): string {
  const head = raw.split(",")[0]?.trim() ?? ""
  return head || raw.trim()
}

function paintDates(
  startDate: string | null,
  dayIndexes: readonly number[],
): { checkin: string; checkout: string } | null {
  if (bookingOmitsStayDates(startDate, dayIndexes)) return null
  return stayDatesFromDayIndexes(startDate, dayIndexes)
}

export type StayDiscoveryInput = {
  destination: string
  startDate: string | null
  dayIndexes: readonly number[]
  currency?: string | null
  numTravelers?: number | null
  affiliateUrl?: string | null
  sourceId?: string | null
  /**
   * Enciende los buscadores propios en un ítem de fuente **sin** `affiliateUrl`.
   * Default off: sin flag, `sourceId` real → `null` (la tarjeta no cambia).
   */
  allowFromSource?: boolean
}

/**
 * Búsqueda Airbnb.es: `query` = destino, fechas si el check-in no ha pasado,
 * viajeros y divisa. Sin `aid`.
 */
export function buildAirbnbSearchUrl(params: {
  destination: string
  checkin?: string | null
  checkout?: string | null
  adults?: number | null
  currency?: string | null
}): string | null {
  const query = params.destination.trim()
  if (!query) return null
  const url = new URL(AIRBNB_SEARCH_ORIGIN)
  url.searchParams.set("query", query)
  url.searchParams.set("locale", "es")
  url.searchParams.set("adults", String(clampAdults(params.adults)))
  const cur = (params.currency ?? "").trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(cur)) url.searchParams.set("currency", cur)
  const checkin = params.checkin?.trim() || ""
  const checkout = params.checkout?.trim() || ""
  if (checkin && checkout && checkout > checkin) {
    url.searchParams.set("checkin", checkin)
    url.searchParams.set("checkout", checkout)
  }
  return url.toString()
}

/**
 * Búsqueda HomeExchange: destino en el path (`/es/search-v2/{ciudad}`),
 * `date_ranges=checkin_checkout` y `adults`. Sin afiliado.
 *
 * La ciudad se escapa con `encodeURIComponent`: es un **segmento** de path,
 * y un destino con barra («Rímini/Riccione») partiría la ruta en dos.
 */
export function buildHomeExchangeSearchUrl(params: {
  destination: string
  checkin?: string | null
  checkout?: string | null
  adults?: number | null
}): string | null {
  const city = firstCommaSegment(params.destination)
  if (!city) return null
  const url = new URL(HOME_EXCHANGE_SEARCH_ORIGIN)
  url.pathname = `${HOME_EXCHANGE_SEARCH_PATH}/${encodeURIComponent(city)}`
  url.searchParams.set("adults", String(clampAdults(params.adults)))
  const checkin = params.checkin?.trim() || ""
  const checkout = params.checkout?.trim() || ""
  if (checkin && checkout && checkout > checkin) {
    url.searchParams.set("date_ranges", `${checkin}_${checkout}`)
  }
  return url.toString()
}

/**
 * CTAs de descubrimiento. `null` = no pintar (enlace guardado, o fuente
 * sin `allowFromSource`). Cada href interno puede ser `null` si falta destino.
 */
export function stayDiscoveryHrefs(
  params: StayDiscoveryInput,
): StayDiscoveryHrefs | null {
  if (sanitizeAffiliateUrl(params.affiliateUrl)) return null
  if (
    params.sourceId &&
    !isSyntheticSourceId(params.sourceId) &&
    !params.allowFromSource
  ) {
    return null
  }

  const dates = paintDates(params.startDate, params.dayIndexes)
  const adults = params.numTravelers ?? 1
  return {
    booking: stayFormSearchHref(params),
    airbnb: buildAirbnbSearchUrl({
      destination: params.destination,
      checkin: dates?.checkin,
      checkout: dates?.checkout,
      adults,
      currency: params.currency,
    }),
    homeExchange: buildHomeExchangeSearchUrl({
      destination: params.destination,
      checkin: dates?.checkin,
      checkout: dates?.checkout,
      adults,
    }),
  }
}

/** Separa ciudad y calle de un `region` (stay / activity / food). */
export function splitStayPlace(region: string | null | undefined): {
  city: string
  address: string
} {
  const raw = region?.trim() ?? ""
  if (!raw) return { city: "", address: "" }
  if (!/\d/.test(raw)) return { city: raw, address: "" }
  const comma = raw.lastIndexOf(",")
  if (comma <= 0) return { city: "", address: raw }
  return {
    address: raw.slice(0, comma).trim(),
    city: raw.slice(comma + 1).trim(),
  }
}

function englishCountryName(code: string): string | null {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? null
  } catch {
    return null
  }
}

function captionAlreadyHasCountry(place: string, code: string): boolean {
  const names = [getCountryByCode(code)?.name, englishCountryName(code)].filter(
    (n): n is string => Boolean(n),
  )
  const n = place.toLocaleLowerCase("es")
  return names.some((name) => n.includes(name.toLocaleLowerCase("es")))
}

/**
 * Subtítulo de lugar: ciudad (primer segmento de `region`) + país en español.
 * El país sale de la propia región si se reconoce; si no, de `extraHints`
 * (p. ej. el área de la fuente) o del código único del viaje.
 */
export function formatItemPlaceCaption(params: {
  region?: string | null
  countryCodes?: readonly string[] | null
  extraHints?: readonly (string | null | undefined)[]
}): string {
  const { city: regionCity } = splitStayPlace(params.region)
  const city = firstCommaSegment(regionCity || params.region?.trim() || "")
  const hintCodes = [
    ...new Set(
      [params.region, ...(params.extraHints ?? [])].flatMap((h) =>
        collectCountryCodesFromHint(h).map((c) => c.toUpperCase()),
      ),
    ),
  ]
  const tripCodes = [
    ...new Set(
      (params.countryCodes ?? [])
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length === 2),
    ),
  ]
  const code =
    hintCodes.length === 1 ? hintCodes[0]! : tripCodes.length === 1 ? tripCodes[0]! : null
  const country = code ? (getCountryByCode(code)?.name ?? "") : ""
  if (!city) return country
  if (!country || captionAlreadyHasCountry(city, code)) return city
  return `${city}, ${country}`
}

/** Persiste ciudad ± calle en `UserDayItem.region`. */
export function joinStayPlace(city: string, address: string): string | null {
  const c = city.trim()
  const a = address.trim()
  if (!a && !c) return null
  if (!a) return c
  if (!c) return a
  const cFold = c.toLocaleLowerCase("es")
  if (a.toLocaleLowerCase("es").includes(cFold)) return a
  return `${a}, ${c}`
}
