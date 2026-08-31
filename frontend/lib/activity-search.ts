/**
 * Búsqueda de actividades para ítems propios (asistente o alta a mano).
 * Analogía de [`booking-search.ts`](./booking-search.ts): prerellenada, sin
 * API ni precios. Los `aid` son enganche de afiliación PROPIO (Patri /
 * WanderPlanner), nunca fuentes.
 *
 * El `aid` de Civitatis (`1006`) coincide con el que viaja en los artículos
 * de La Cosmopolilla **porque es la misma cuenta**, no por error. Stay22
 * (`patriciarojassoto`) es el hop hacia GetYourGuide. `classifyOutboundAffiliate`
 * en modo `auto` no puede distinguirlos: los CTAs pasan `affiliate: "own"`
 * a mano; un ítem de fuente con el mismo `aid` sigue `partner` por procedencia.
 *
 * Precedencia (misma tabla que `resolveStayAffiliateUrl`):
 * 1. `affiliateUrl` guardado → no generar búsqueda (el tour concreto gana).
 * 2. Sin enlace y procedencia sintética (`manual` | `assistant`) → nuestros `aid`.
 * 3. Sin enlace y viene de una fuente → nada. Un tour que la guía menciona
 *    pero no enlaza **no** cae a nuestro `aid`: canibalizar al partner rompe
 *    el canal de distribución.
 *
 * El href **no se persiste** en `affiliateUrl`. El CTA es del formulario.
 *
 * Contratos verificados 31 ago 2026:
 * - Stay22 Allez `GET /allez/getyourguide?aid&address&checkin&checkout&adults&lang=es`
 *   → 302 a `getyourguide.es/s?q=…&date_from=&date_to=`.
 * - Civitatis `/es/{slug}/?aid=1006`: `budapest`, `praga`, `munich`, `nueva-york`
 *   responden catálogo. Un slug inventado → 406 vacío, así que el slug sale
 *   solo del candidato Mapbox (español) o del destino del viaje; una calle
 *   (dígitos) no se slugifica.
 */
import { isSyntheticSourceId } from "@/lib/item-provenance"
import { sanitizeAffiliateUrl } from "@/lib/affiliate-url"
import { dateISOForDayIndex, toISODate } from "@/lib/trip-dates"

/** Enganche de afiliación PROPIO: Civitatis. Misma cuenta que en los artículos de la partner. */
export const CIVITATIS_AFFILIATE_AID = "1006"

/** Enganche de afiliación PROPIO: Stay22 → GetYourGuide (primer segmento del enlace corto). */
export const STAY22_AFFILIATE_AID = "patriciarojassoto"

const CIVITATIS_ORIGIN = "https://www.civitatis.com"
const STAY22_GYG_ORIGIN = "https://www.stay22.com/allez/getyourguide"

export type ActivityDiscoveryInput = {
  sourceId?: string | null
  affiliateUrl?: string | null
  /** Label del candidato Mapbox elegido; no el texto libre del campo. */
  selectedPlaceLabel?: string | null
  destinationHint?: string | null
  /** Texto libre del campo; solo para GetYourGuide, no para el slug de Civitatis. */
  addressHint?: string | null
  coords?: { lng: number; lat: number } | null
  startDate?: string | null
  dayIndex?: number
  /** Días de calendario de la actividad (≥ 1). Un día → checkout = checkin + 1. */
  spanDays?: number
  numTravelers?: number | null
}

export type ActivityDiscoveryHrefs = {
  civitatis: string | null
  getYourGuide: string | null
}

function clampAdults(n: number | null | undefined): number {
  const raw = n == null || !Number.isFinite(n) ? 1 : Math.floor(n)
  return Math.min(Math.max(raw, 1), 9)
}

function todayISO(): string {
  return toISODate(new Date())
}

/** Calle / número: no es un slug de destino de Civitatis. */
export function looksLikeStreetAddress(label: string): boolean {
  return /\d/.test(label)
}

function firstCommaSegment(raw: string): string {
  const head = raw.split(",")[0]?.trim() ?? ""
  return head || raw.trim()
}

/** Slug de destino Civitatis: minúsculas, sin acentos, espacios → guion. */
export function civitatisSlugFromLabel(label: string): string | null {
  const city = firstCommaSegment(label)
  if (!city || looksLikeStreetAddress(city)) return null
  const folded = city
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
  const slug = folded.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return slug.length >= 2 ? slug : null
}

/**
 * Ciudad para Civitatis: candidato elegido (no calle) → destino del viaje → nada.
 * El texto libre del campo no entra: «Prague» no casa con `/es/praga/`.
 */
export function civitatisPlaceLabel(params: {
  selectedPlaceLabel?: string | null
  destinationHint?: string | null
}): string | null {
  const selected = params.selectedPlaceLabel?.trim() || ""
  if (selected && !looksLikeStreetAddress(firstCommaSegment(selected))) {
    return firstCommaSegment(selected)
  }
  const hint = params.destinationHint?.trim() || ""
  if (hint && !looksLikeStreetAddress(firstCommaSegment(hint))) {
    return firstCommaSegment(hint)
  }
  return null
}

export function buildCivitatisSearchUrl(label: string): string | null {
  const slug = civitatisSlugFromLabel(label)
  if (!slug) return null
  return `${CIVITATIS_ORIGIN}/es/${slug}/?aid=${CIVITATIS_AFFILIATE_AID}`
}

export function buildGetYourGuideSearchUrl(params: {
  address: string
  coords?: { lng: number; lat: number } | null
  checkin?: string | null
  checkout?: string | null
  adults?: number | null
}): string | null {
  const address = params.address.trim()
  if (!address) return null
  const url = new URL(STAY22_GYG_ORIGIN)
  url.searchParams.set("aid", STAY22_AFFILIATE_AID)
  url.searchParams.set("address", address)
  url.searchParams.set("lang", "es")
  const coords = params.coords
  if (
    coords &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng)
  ) {
    url.searchParams.set("lat", String(coords.lat))
    url.searchParams.set("lng", String(coords.lng))
  }
  const checkin = params.checkin?.trim() || ""
  const checkout = params.checkout?.trim() || ""
  if (checkin && checkout && checkout > checkin && checkin >= todayISO()) {
    url.searchParams.set("checkin", checkin)
    url.searchParams.set("checkout", checkout)
  }
  url.searchParams.set("adults", String(clampAdults(params.adults)))
  return url.toString()
}

function gygDateRange(params: {
  startDate?: string | null
  dayIndex?: number
  spanDays?: number
}): { checkin: string | null; checkout: string | null } {
  const dayIndex = params.dayIndex ?? 0
  const span = Math.max(1, Math.floor(params.spanDays ?? 1))
  const checkin = dateISOForDayIndex(params.startDate ?? null, dayIndex)
  const checkout = dateISOForDayIndex(params.startDate ?? null, dayIndex + span)
  return { checkin, checkout }
}

/**
 * CTAs de descubrimiento. `null` = no pintar (enlace guardado o ítem de fuente).
 * Cada href interno puede ser `null` si falta destino.
 */
export function activityDiscoveryHrefs(
  params: ActivityDiscoveryInput,
): ActivityDiscoveryHrefs | null {
  const stored = sanitizeAffiliateUrl(params.affiliateUrl)
  if (stored) return null
  if (!params.sourceId || !isSyntheticSourceId(params.sourceId)) return null

  const civitatisLabel = civitatisPlaceLabel({
    selectedPlaceLabel: params.selectedPlaceLabel,
    destinationHint: params.destinationHint,
  })
  const gygAddress =
    params.selectedPlaceLabel?.trim() ||
    params.addressHint?.trim() ||
    params.destinationHint?.trim() ||
    ""
  const { checkin, checkout } = gygDateRange(params)

  return {
    civitatis: civitatisLabel ? buildCivitatisSearchUrl(civitatisLabel) : null,
    getYourGuide: buildGetYourGuideSearchUrl({
      address: gygAddress,
      coords: params.coords,
      checkin,
      checkout,
      adults: params.numTravelers,
    }),
  }
}
