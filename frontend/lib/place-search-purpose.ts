/**
 * Propósito de una búsqueda de lugares: qué tipos pedir a Mapbox y cómo
 * acotar la zona. Puro: sin I/O. El endpoint (/suggest vs /forward) lo
 * decide el llamante.
 */
import { maxDistanceMetersForAnchorType } from "./geocode-validate"
import { haversineMeters } from "./map-route-geometry"

export type PlaceSearchPurpose = "city" | "address" | "poi" | "site"
export type PlaceSearchProvider = "searchbox" | "geocoding-v5"
export type PlaceSearchScope = "anchored" | "anywhere"

export type LngLat = { lng: number; lat: number }

/** west, south, east, north. No cruza el antimeridiano. */
export type Bbox = [number, number, number, number]

export type PlaceSearchAnchor = {
  id: string
  label: string
  featureType: string
  coords: LngLat
  countryCode: string | null
  bbox: Bbox | null
}

export const CITY_FEATURE_TYPES = ["place", "region", "district"] as const
export const ADDRESS_FEATURE_TYPES = ["poi", "address", "street"] as const
export const POI_FEATURE_TYPES = ["poi"] as const

const CITY_TYPE_SET = new Set<string>(CITY_FEATURE_TYPES)
const ADDRESS_TYPE_SET = new Set<string>(ADDRESS_FEATURE_TYPES)
const POI_TYPE_SET = new Set<string>(POI_FEATURE_TYPES)

export const SESSION_IDLE_MS = 180_000
export const SESSION_MAX_SUGGESTS = 50

export type PlaceSearchSession = {
  token: string
  suggests: number
  createdAt: number
  lastSuggestAt: number
}

export function createSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `s-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function newPlaceSearchSession(now = Date.now()): PlaceSearchSession {
  return {
    token: createSessionToken(),
    suggests: 0,
    createdAt: now,
    lastSuggestAt: now,
  }
}

export function sessionNeedsRotation(
  session: PlaceSearchSession | null | undefined,
  now = Date.now(),
): boolean {
  if (!session?.token) return true
  if (session.suggests >= SESSION_MAX_SUGGESTS) return true
  if (now - session.lastSuggestAt >= SESSION_IDLE_MS) return true
  return false
}

export function recordSessionSuggest(
  session: PlaceSearchSession,
  now = Date.now(),
): PlaceSearchSession {
  return {
    ...session,
    suggests: session.suggests + 1,
    lastSuggestAt: now,
  }
}

/**
 * Tipos Mapbox para un propósito. `null` = no mandar `types` (default del proveedor).
 * v5 no indexa POI ni `street`: una búsqueda de POI no debe caer a ciudades homónimas.
 */
export function typesForPurpose(
  purpose: PlaceSearchPurpose,
  provider: PlaceSearchProvider,
): string | null {
  if (purpose === "city") return CITY_FEATURE_TYPES.join(",")
  if (purpose === "poi") {
    return provider === "searchbox" ? "poi" : null
  }
  if (purpose === "address") {
    return provider === "searchbox" ? ADDRESS_FEATURE_TYPES.join(",") : "address"
  }
  if (provider === "searchbox") {
    return "poi,address,street,place,locality,neighborhood,district,region"
  }
  return null
}

export function shouldFallbackToGeocodingV5(purpose: PlaceSearchPurpose): boolean {
  return purpose !== "poi"
}

export function suggestionAllowedForPurpose(
  featureType: string,
  purpose: PlaceSearchPurpose,
): boolean {
  const t = featureType.trim().toLowerCase()
  if (!t || t === "unknown") {
    return purpose === "site"
  }
  if (purpose === "city") return CITY_TYPE_SET.has(t)
  if (purpose === "poi") return POI_TYPE_SET.has(t)
  if (purpose === "address") return ADDRESS_TYPE_SET.has(t)
  return true
}

export function parseBbox(raw: unknown): Bbox | null {
  if (!Array.isArray(raw) || raw.length < 4) return null
  const west = Number(raw[0])
  const south = Number(raw[1])
  const east = Number(raw[2])
  const north = Number(raw[3])
  if (![west, south, east, north].every((n) => Number.isFinite(n))) return null
  if (south < -90 || north > 90 || south > north) return null
  if (west < -180 || east > 180 || west > east) return null
  if (east - west > 359) return null
  return [west, south, east, north]
}

export function bboxToParam(bbox: Bbox): string {
  return bbox.map((n) => n.toFixed(5)).join(",")
}

export function bboxFromCenterAndRadius(center: LngLat, radiusM: number): Bbox | null {
  if (!Number.isFinite(center.lng) || !Number.isFinite(center.lat)) return null
  if (!Number.isFinite(radiusM) || radiusM <= 0) return null
  const latDelta = radiusM / 111_000
  const cos = Math.cos((center.lat * Math.PI) / 180)
  const lngDelta = radiusM / (111_000 * Math.max(0.2, Math.abs(cos)))
  const south = Math.max(-90, center.lat - latDelta)
  const north = Math.min(90, center.lat + latDelta)
  const west = center.lng - lngDelta
  const east = center.lng + lngDelta
  if (west < -180 || east > 180) {
    return parseBbox([
      Math.max(-180, west),
      south,
      Math.min(180, east),
      north,
    ])
  }
  return parseBbox([west, south, east, north])
}

/**
 * Prioriza un bbox válido del retrieve. Sin él, radio por `featureType`
 * (los de geocode-validate). Un país no inventa radio: se filtra por código.
 */
export function bboxForAnchor(anchor: PlaceSearchAnchor): Bbox | null {
  const fromRetrieve = parseBbox(anchor.bbox)
  if (fromRetrieve) return fromRetrieve
  if (anchor.featureType === "country") return null
  const radiusM = maxDistanceMetersForAnchorType(anchor.featureType)
  if (radiusM == null) return null
  return bboxFromCenterAndRadius(anchor.coords, radiusM)
}

export function coordInBbox(coord: LngLat, bbox: Bbox): boolean {
  return (
    coord.lng >= bbox[0] &&
    coord.lng <= bbox[2] &&
    coord.lat >= bbox[1] &&
    coord.lat <= bbox[3]
  )
}

export function coordInAnchorZone(coord: LngLat, anchor: PlaceSearchAnchor): boolean {
  const bbox = parseBbox(anchor.bbox)
  if (bbox) return coordInBbox(coord, bbox)
  if (anchor.featureType === "country") return true
  const maxM = maxDistanceMetersForAnchorType(anchor.featureType)
  if (maxM == null) return true
  return haversineMeters(coord, anchor.coords) <= maxM
}

export function samePlaceSearchAnchor(
  a: PlaceSearchAnchor | null | undefined,
  b: PlaceSearchAnchor | null | undefined,
): boolean {
  if (!a || !b) return a == null && b == null
  if (a.id && b.id && a.id === b.id) return true
  return false
}

export function normalizePlaceQuery(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

export function nameSuggestDedupeKey(params: {
  name: string
  anchorId: string
  purpose: PlaceSearchPurpose
  scope: PlaceSearchScope
}): string {
  return `${normalizePlaceQuery(params.name)}|${params.anchorId}|${params.purpose}|${params.scope}`
}

function fold(raw: string): string {
  return raw.toLocaleLowerCase("es").trim()
}

function firstCommaSegment(raw: string): string {
  const head = raw.split(",")[0]?.trim() ?? ""
  return head || raw.trim()
}

function stripTrailingCity(line: string, cityLabel: string | null | undefined): string {
  const city = cityLabel?.trim()
  if (!city) return line.trim()
  const parts = line.split(",").map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return ""
  const cityFold = fold(city)
  const filtered = parts.filter((p) => fold(p) !== cityFold && !fold(p).startsWith(cityFold + " "))
  if (filtered.length === 0) return ""
  return filtered.join(", ")
}

/**
 * Dirección postal distinta del nombre del POI y de la ciudad.
 * Si no hay calle, cadena vacía: no inventar ni copiar el nombre.
 */
export function postalAddressFromSuggestion(params: {
  text: string
  placeName: string
  featureType: string
  cityLabel?: string | null
}): string {
  const type = params.featureType.trim().toLowerCase()
  const city = params.cityLabel ?? null
  if (type === "poi") {
    const fromPlace = stripTrailingCity(params.placeName, city)
    const nameFold = fold(params.text)
    if (!fromPlace) return ""
    if (fold(fromPlace) === nameFold) return ""
    if (fold(firstCommaSegment(fromPlace)) === nameFold) {
      const rest = fromPlace.split(",").slice(1).join(", ").trim()
      return stripTrailingCity(rest, city)
    }
    return fromPlace
  }
  if (type === "address" || type === "street") {
    const line = params.text.trim() || firstCommaSegment(params.placeName)
    return stripTrailingCity(line, city)
  }
  return ""
}

export function displayLabelForPurpose(
  purpose: PlaceSearchPurpose,
  suggestion: { text: string; placeName: string; featureType: string },
  cityLabel?: string | null,
): string {
  if (purpose === "address" || purpose === "poi") {
    const postal = postalAddressFromSuggestion({
      text: suggestion.text,
      placeName: suggestion.placeName,
      featureType: suggestion.featureType,
      cityLabel,
    })
    if (suggestion.featureType === "poi") return suggestion.text
    if (postal) return postal
  }
  return suggestion.text
}

export function emptyScopeMessage(anchorLabel: string | null | undefined): string {
  const label = anchorLabel?.trim()
  if (!label) return "Sin resultados en esta zona."
  return `Sin resultados en la zona de ${label}`
}
