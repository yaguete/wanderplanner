/**
 * Mapbox: geocoding (nombres → coordenadas) y Directions (ruta por carretera).
 * Requiere `NEXT_PUBLIC_MAPBOX_TOKEN` (token público pk.…).
 * Search Box `/forward` para POIs del itinerario; `/category` (T4B.3) para hubs.
 *
 * Licencia (T4B.3 §9.11) — dos escalones:
 * - Autocompletar (`suggestPlaces`): dataset temporal, barato, NO persistible.
 * - Persistir: `resolvePermanentCoords` contra `mapbox.places-permanent`, una
 *   llamada por lugar guardado. Kill switch `NEXT_PUBLIC_MAPBOX_PERMANENT_GEOCODING=false`.
 * - Resultados de Search Box son efímeros salvo contrato explícito; ver
 *   `place-search-guardrails.ts` (`ALLOW_TRANSPORT_HUB_PERSISTENCE`).
 * - Kill switch: `NEXT_PUBLIC_TRANSPORT_PLACE_SEARCH_ENABLED=false`.
 * - Proxy backend preferido: `GET /places/suggest` y `GET /transport-hubs`
 *   (`TRANSPORT_PLACE_SEARCH_ENABLED` en el servidor).
 */
import type { RoutePlaceKind } from "@/types/itinerary"
import {
  isPermanentGeocodingEnabled,
  isPlaceSearchEnabled,
} from "@/lib/place-search-guardrails"
import {
  featureTypeFromMapboxId,
  pickBestAnchorHit,
  regionAnchorQueryLadder,
  type GeocodeCandidate,
  type RegionAnchor,
} from "@/lib/geocode-validate"
import { placeSearchBias } from "@/lib/place-search-bias"

const CACHE_VERSION = 7
const CACHE_PREFIX = "wp-mapbox-geo-v7"
const LEGACY_GEO_CACHE_KEYS = ["wp-mapbox-geo-v4", "wp-mapbox-geo-v5", "wp-mapbox-geo-v6"]
const TTL_MS = 30 * 24 * 60 * 60 * 1000
const REGION_ANCHOR_TYPES = "place,locality,district,region,country"

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ""

const memoryCache = new Map<string, { lng: number; lat: number; exp: number }>()
const candidateMemoryCache = new Map<string, { candidates: GeocodeCandidate[]; exp: number }>()
const anchorMemoryCache = new Map<string, { value: RegionAnchor; exp: number }>()

/**
 * Añade el destino del viaje a la query para desambiguar POI homónimos
 * (p. ej. “Mirador del Embrujo” cerca de Granada, no en Madrid).
 * No usar `c.includes(n)` con nombres cortos: puede devolver solo "np" o "lodge" y perder el país.
 */
function buildContextualQuery(placeName: string, tripDestination: string | null | undefined): string {
  const n = placeName?.trim() ?? ""
  if (!n) return ""
  const c = tripDestination?.trim() ?? ""
  if (!c) return n
  const nL = n.toLowerCase()
  const cL = c.toLowerCase()
  if (nL === cL) return n
  if (nL.includes(cL)) return n
  return `${n}, ${c}`
}

function geocodeQueryKey(
  fullQuery: string,
  proximity: [number, number] | null,
  countryKey: string,
  extra = "",
): string {
  const p = proximity
    ? `${proximity[0].toFixed(3)}_${proximity[1].toFixed(3)}`
    : "none"
  const base = `${fullQuery.trim().toLowerCase()}|${p}|${countryKey}`
  return extra ? `${base}|${extra}` : base
}

type GeoCacheEntry = {
  v: number
  exp: number
  lng?: number
  lat?: number
  featureType?: string
  label?: string
  candidates?: GeocodeCandidate[]
}

let clearedLegacyGeoCache = false
function clearLegacyGeoLocalStorage(): void {
  if (clearedLegacyGeoCache) return
  clearedLegacyGeoCache = true
  if (typeof window === "undefined") return
  try {
    for (const key of LEGACY_GEO_CACHE_KEYS) localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function readGeoStore(): Record<string, GeoCacheEntry> {
  clearLegacyGeoLocalStorage()
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(CACHE_PREFIX)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, GeoCacheEntry>
  } catch {
    return {}
  }
}

function writeGeoStore(data: Record<string, GeoCacheEntry>): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(CACHE_PREFIX, JSON.stringify(data))
  } catch {
    // ignore quota
  }
}

function readLocalCache(key: string): { lng: number; lat: number } | null {
  try {
    const data = readGeoStore()
    const e = data[key]
    if (!e || e.v !== CACHE_VERSION) return null
    if (e.exp < Date.now()) {
      delete data[key]
      writeGeoStore(data)
      return null
    }
    if (typeof e.lng !== "number" || typeof e.lat !== "number") return null
    return { lng: e.lng, lat: e.lat }
  } catch {
    return null
  }
}

function writeLocalCache(key: string, lng: number, lat: number, extra?: Partial<GeoCacheEntry>): void {
  try {
    const data = readGeoStore()
    data[key] = {
      v: CACHE_VERSION,
      lng,
      lat,
      exp: Date.now() + TTL_MS,
      ...extra,
    }
    writeGeoStore(data)
  } catch {
    // ignore quota
  }
}

function readCandidateCache(key: string): GeocodeCandidate[] | null {
  try {
    const data = readGeoStore()
    const e = data[key]
    if (!e || e.v !== CACHE_VERSION) return null
    if (e.exp < Date.now()) {
      delete data[key]
      writeGeoStore(data)
      return null
    }
    if (e.candidates && e.candidates.length > 0) return e.candidates
    if (typeof e.lng === "number" && typeof e.lat === "number") {
      return [{ coord: { lng: e.lng, lat: e.lat }, featureType: e.featureType ?? "unknown" }]
    }
    return null
  } catch {
    return null
  }
}

function writeCandidateCache(key: string, candidates: GeocodeCandidate[]): void {
  try {
    const data = readGeoStore()
    data[key] = {
      v: CACHE_VERSION,
      exp: Date.now() + TTL_MS,
      candidates,
    }
    writeGeoStore(data)
  } catch {
    // ignore quota
  }
}

function readAnchorCache(key: string): RegionAnchor | null {
  try {
    const data = readGeoStore()
    const e = data[key]
    if (!e || e.v !== CACHE_VERSION) return null
    if (e.exp < Date.now()) {
      delete data[key]
      writeGeoStore(data)
      return null
    }
    if (typeof e.lng !== "number" || typeof e.lat !== "number") return null
    return {
      coord: { lng: e.lng, lat: e.lat },
      featureType: e.featureType ?? "place",
      label: e.label ?? "",
    }
  } catch {
    return null
  }
}

function getFromMemory(key: string): { lng: number; lat: number } | null {
  const e = memoryCache.get(key)
  if (!e) return null
  if (e.exp < Date.now()) {
    memoryCache.delete(key)
    return null
  }
  return { lng: e.lng, lat: e.lat }
}

function setMemory(key: string, lng: number, lat: number): void {
  memoryCache.set(key, { lng, lat, exp: Date.now() + TTL_MS })
}

function getCandidatesFromMemory(key: string): GeocodeCandidate[] | null {
  const e = candidateMemoryCache.get(key)
  if (!e) return null
  if (e.exp < Date.now()) {
    candidateMemoryCache.delete(key)
    return null
  }
  return e.candidates
}

function setCandidateMemory(key: string, candidates: GeocodeCandidate[]): void {
  candidateMemoryCache.set(key, { candidates, exp: Date.now() + TTL_MS })
}

function getAnchorFromMemory(key: string): RegionAnchor | null {
  const e = anchorMemoryCache.get(key)
  if (!e) return null
  if (e.exp < Date.now()) {
    anchorMemoryCache.delete(key)
    return null
  }
  return e.value
}

function setAnchorMemory(key: string, value: RegionAnchor): void {
  anchorMemoryCache.set(key, { value, exp: Date.now() + TTL_MS })
}

export type LngLat = { lng: number; lat: number }

function countryParamsKey(codes: string[] | null | undefined): string {
  if (!codes?.length) return "none"
  return [...new Set(codes.map((c) => c.toLowerCase()))].sort().join(".")
}

function appendCountryParams(
  params: URLSearchParams,
  codes: string[] | null | undefined,
) {
  if (!codes?.length) return
  for (const c of new Set(codes.map((x) => x.toLowerCase()))) {
    if (c.length === 2) params.append("country", c)
  }
}

/**
 * Datasets de Geocoding v5. El permanente es un **endpoint distinto**, no un
 * parámetro: `mapbox.places` ignora en silencio `permanent=true` (devuelve 200
 * igual que con cualquier parámetro inventado), así que pedirlo por query nunca
 * hizo nada.
 */
const GEOCODE_DATASET = "mapbox.places"
const GEOCODE_DATASET_PERMANENT = "mapbox.places-permanent"

function buildGeocodeUrl(
  query: string,
  params: URLSearchParams,
  options?: { permanent?: boolean },
): string {
  const dataset = options?.permanent ? GEOCODE_DATASET_PERMANENT : GEOCODE_DATASET
  return `https://api.mapbox.com/geocoding/v5/${dataset}/${encodeURIComponent(query)}.json?${params}`
}

type MapboxFeature = {
  id?: string
  place_name?: string
  text?: string
  center?: [number, number]
  /** ISO corto del propio feature cuando es un país (p. ej. "ES"). */
  short_code?: string
  properties?: { short_code?: string }
  context?: { id?: string; text?: string; short_code?: string }[]
}

/**
 * ISO 3166-1 alpha-2 desde una feature de Geocoding v5.
 * Preferencia: short_code del context `country.*` → short_code de la feature si es país.
 */
export function countryCodeFromMapboxFeature(feature: {
  id?: string
  short_code?: string
  properties?: { short_code?: string }
  context?: { id?: string; short_code?: string }[]
}): string | null {
  const normalize = (raw: string | undefined | null): string | null => {
    if (!raw) return null
    const code = raw.trim().toUpperCase()
    // Mapbox a veces usa "ES" o códigos de región ("ES-CT"); solo aceptamos alpha-2.
    const m = code.match(/^([A-Z]{2})$/)
    return m ? m[1]! : null
  }

  for (const c of feature.context ?? []) {
    if (c.id?.startsWith("country.")) {
      const fromCtx = normalize(c.short_code)
      if (fromCtx) return fromCtx
      // Fallback: id "country.XXXX" no es ISO; solo short_code es fiable.
    }
  }

  if (feature.id?.startsWith("country.")) {
    return normalize(feature.short_code) ?? normalize(feature.properties?.short_code)
  }

  return normalize(feature.short_code) ?? normalize(feature.properties?.short_code)
}

/**
 * Etiqueta corta legible para la tarjeta: `text` + primera parte de contexto (ciudad/región/país).
 */
export function shortPlaceLabel(feature: {
  text?: string
  place_name?: string
  context?: { id?: string; text?: string }[]
}): string {
  const primary = feature.text?.trim() || feature.place_name?.trim() || ""
  if (!primary) return ""
  const ctx = feature.context ?? []
  const prefer = (prefix: string) =>
    ctx.find((c) => c.id?.startsWith(prefix) && c.text?.trim())?.text?.trim()
  const secondary =
    prefer("place.") ||
    prefer("locality.") ||
    prefer("region.") ||
    prefer("country.") ||
    null
  if (!secondary || secondary.toLowerCase() === primary.toLowerCase()) return primary
  if (primary.toLowerCase().includes(secondary.toLowerCase())) return primary
  return `${primary}, ${secondary}`
}

export type GeocodeSuggestion = {
  id: string
  /** place_name completo (útil para caché / debug). */
  placeName: string
  /** Etiqueta corta para `UserDayItem.region` y la tarjeta. */
  text: string
  center: LngLat
  /** ISO 3166-1 alpha-2 si Mapbox lo aporta; null si no. */
  countryCode: string | null
  /** Search Box `poi_category_ids` (estable frente al idioma). Ausente en v5. */
  poiCategoryIds?: string[] | null
}

type SearchBoxForwardHit = {
  id: string
  text: string
  placeName: string
  coord: LngLat
  featureType: string
  countryCode: string | null
  poiCategoryIds: string[] | null
}

type SearchBoxForwardFeature = {
  geometry?: { type?: string; coordinates?: [number, number] }
  properties?: {
    mapbox_id?: string
    name?: string
    name_preferred?: string
    full_address?: string
    place_formatted?: string
    feature_type?: string
    poi_category?: string[]
    poi_category_ids?: string[]
    coordinates?: { longitude?: number; latitude?: number }
    context?: { country?: { country_code?: string; name?: string } }
  }
}

function searchBoxCountryParam(codes: string[] | null | undefined): string | null {
  if (!codes?.length) return null
  const uniq = [...new Set(codes.map((c) => c.trim().toLowerCase()).filter((c) => c.length === 2))]
  return uniq.length ? uniq.join(",") : null
}

function coordsFromSearchBoxFeature(f: SearchBoxForwardFeature): LngLat | null {
  const p = f.properties?.coordinates
  if (p?.longitude != null && p?.latitude != null) {
    return { lng: p.longitude, lat: p.latitude }
  }
  const c = f.geometry?.coordinates
  if (c && c.length >= 2) return { lng: c[0], lat: c[1] }
  return null
}

function countryCodeFromSearchBox(f: SearchBoxForwardFeature): string | null {
  const raw = f.properties?.context?.country?.country_code?.trim().toUpperCase()
  return raw && /^[A-Z]{2}$/.test(raw) ? raw : null
}

/** Search Box `/forward`. Resultados temporales: caché solo de sesión, no localStorage. */
async function searchBoxForward(
  query: string,
  options?: {
    proximity?: [number, number] | null
    countryCodes?: string[] | null
    limit?: number
    signal?: AbortSignal
  },
): Promise<SearchBoxForwardHit[]> {
  if (!MAPBOX_TOKEN?.trim() || !query.trim()) return []
  const limit = Math.min(Math.max(options?.limit ?? 5, 1), 10)
  const params = new URLSearchParams({
    q: query.trim(),
    access_token: MAPBOX_TOKEN,
    language: "es",
    limit: String(limit),
  })
  if (options?.proximity) {
    params.set("proximity", `${options.proximity[0]},${options.proximity[1]}`)
  }
  const country = searchBoxCountryParam(options?.countryCodes)
  if (country) params.set("country", country)

  const url = `https://api.mapbox.com/search/searchbox/v1/forward?${params}`
  try {
    const res = await fetch(url, { signal: options?.signal })
    if (!res.ok) return []
    const data = (await res.json()) as { features?: SearchBoxForwardFeature[] }
    const out: SearchBoxForwardHit[] = []
    for (const f of data.features ?? []) {
      const coord = coordsFromSearchBoxFeature(f)
      if (!coord) continue
      const text =
        f.properties?.name_preferred?.trim() ||
        f.properties?.name?.trim() ||
        ""
      if (!text) continue
      const placeName =
        f.properties?.full_address?.trim() ||
        [text, f.properties?.place_formatted?.trim()].filter(Boolean).join(", ") ||
        text
      out.push({
        id: f.properties?.mapbox_id ?? `${text}-${coord.lng}-${coord.lat}`,
        text,
        placeName,
        coord,
        featureType: f.properties?.feature_type?.trim() || "unknown",
        countryCode: countryCodeFromSearchBox(f),
        poiCategoryIds: Array.isArray(f.properties?.poi_category_ids)
          ? f.properties.poi_category_ids.filter((id) => typeof id === "string" && id.trim())
          : null,
      })
    }
    return out
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err
    return []
  }
}

const searchBoxSessionCache = new Map<string, GeocodeCandidate[]>()

function searchBoxPlaceCacheKey(
  name: string,
  proximity: [number, number],
  countryKey: string,
): string {
  return `${name.trim().toLowerCase()}|${proximity[0].toFixed(3)}_${proximity[1].toFixed(3)}|${countryKey}`
}

/**
 * POIs del itinerario vía Search Box `/forward`. `mapbox.places` v5 no indexa
 * restaurantes ni monumentos: devuelve calles homónimas. Sin `proximity` no
 * busca (un «Taberna El Botijo» suelto se iría a otra ciudad).
 * Caché de sesión; no localStorage (datos temporales de licencia).
 */
export async function searchPlaceCandidates(
  name: string,
  options: {
    proximity: [number, number]
    countryCodes?: string[] | null
    signal?: AbortSignal
  },
): Promise<GeocodeCandidate[]> {
  if (!MAPBOX_TOKEN?.trim() || !name?.trim()) return []
  const proximity = options.proximity
  if (!Number.isFinite(proximity[0]) || !Number.isFinite(proximity[1])) return []
  const cKey = countryParamsKey(options.countryCodes)
  const key = searchBoxPlaceCacheKey(name, proximity, cKey)
  const cached = searchBoxSessionCache.get(key)
  if (cached && cached.length > 0) return cached

  const hits = await searchBoxForward(name.trim(), {
    proximity,
    countryCodes: options.countryCodes,
    limit: 5,
    signal: options.signal,
  })
  const candidates: GeocodeCandidate[] = hits.map((h) => ({
    coord: h.coord,
    featureType: h.featureType,
    placeName: h.placeName,
    text: h.text,
  }))
  if (candidates.length > 0) searchBoxSessionCache.set(key, candidates)
  return candidates
}

/**
 * Autocompletado de lugares. Search Box `/forward` (tiene POIs); si no hay
 * hits, Geocoding v5. Siempre temporal: la coordenada que acaba en el jsonb
 * la resuelve `resolvePermanentCoords` al confirmar.
 */
export async function suggestPlaces(
  text: string,
  options?: {
    proximity?: [number, number] | null
    countryCodes?: string[] | null
    limit?: number
    signal?: AbortSignal
  },
): Promise<GeocodeSuggestion[]> {
  if (!isPlaceSearchEnabled()) return []
  if (!MAPBOX_TOKEN?.trim() || !text?.trim()) return []
  const limit = Math.min(Math.max(options?.limit ?? 6, 1), 10)
  const bias = placeSearchBias(text, {
    proximity: options?.proximity,
    countryCodes: options?.countryCodes,
  })
  const proximity = bias.proximity
  const countryCodes = bias.countryCodes.length ? bias.countryCodes : undefined
  const fromBox = await searchBoxForward(text.trim(), {
    proximity,
    countryCodes,
    limit,
    signal: options?.signal,
  })
  if (fromBox.length > 0) {
    return fromBox.map((f) => ({
      id: f.id,
      placeName: f.placeName,
      text: f.text,
      center: f.coord,
      countryCode: f.countryCode,
      poiCategoryIds: f.poiCategoryIds,
    }))
  }
  return suggestPlacesGeocodingV5(text.trim(), {
    proximity,
    countryCodes,
    limit,
    signal: options?.signal,
  })
}

async function suggestPlacesGeocodingV5(
  text: string,
  options: {
    proximity: [number, number] | null
    countryCodes?: string[] | null
    limit: number
    signal?: AbortSignal
  },
): Promise<GeocodeSuggestion[]> {
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    limit: String(options.limit),
    autocomplete: "true",
    language: "es",
  })
  if (options.proximity) {
    params.set("proximity", `${options.proximity[0]},${options.proximity[1]}`)
  }
  appendCountryParams(params, options.countryCodes)

  const url = buildGeocodeUrl(text, params)
  const res = await fetch(url, { signal: options.signal })
  if (!res.ok) return []
  const data = (await res.json()) as { features?: MapboxFeature[] }
  const out: GeocodeSuggestion[] = []
  for (const f of data.features ?? []) {
    const c = f.center
    if (!c || c.length < 2) continue
    const placeName = f.place_name?.trim()
    if (!placeName) continue
    const center = { lng: c[0], lat: c[1] }
    out.push({
      id: f.id ?? `${placeName}-${center.lng}-${center.lat}`,
      placeName,
      text: shortPlaceLabel(f),
      center,
      countryCode: countryCodeFromMapboxFeature(f),
    })
  }
  return out
}

/** Descarta el punto permanente si no se parece al elegido (ver `resolvePermanentCoords`). */
const PERMANENT_MAX_DRIFT_KM = 25
const PERMANENT_TIMEOUT_MS = 5000

/**
 * Coordenada definitiva de un lugar **ya elegido**, contra el dataset permanente
 * de Mapbox. Es el único resultado que la licencia permite guardar en base de
 * datos; el de `suggestPlaces` es temporal y solo vale para pintar el desplegable.
 *
 * Contrato deliberado: **no puede fallar**. Devuelve el `fallback` que le pasa el
 * caller —la coordenada temporal que ya tenía— si el permanente está apagado,
 * responde error, tarda de más o devuelve un punto que no se parece al elegido.
 * Es lo que hace seguro llamarla desde cualquier sitio: en el peor caso se
 * persiste exactamente lo mismo que se persistía antes de existir esta función.
 *
 * Una llamada por lugar guardado, con caché: el permanente se factura aparte y
 * más caro que el temporal, así que no vale para autocompletar.
 */
export async function resolvePermanentCoords(
  label: string,
  fallback: LngLat,
  options?: {
    countryCodes?: string[] | null
    proximity?: [number, number] | null
    /** Tope de distancia contra `fallback` para aceptar el resultado. Default 25 km. */
    maxDriftKm?: number
    timeoutMs?: number
    signal?: AbortSignal
  },
): Promise<LngLat> {
  const name = label?.trim()
  if (!name || !MAPBOX_TOKEN?.trim()) return fallback
  if (!isPermanentGeocodingEnabled()) return fallback

  const cKey = countryParamsKey(options?.countryCodes)
  const key = geocodeQueryKey(`__perm__${name}`, options?.proximity ?? null, cKey, "perm")
  const cached = getFromMemory(key) ?? readLocalCache(key)
  if (cached) return cached

  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    limit: "1",
    autocomplete: "false",
    language: "es",
  })
  if (options?.proximity) {
    params.set("proximity", `${options.proximity[0]},${options.proximity[1]}`)
  }
  appendCountryParams(params, options?.countryCodes)

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? PERMANENT_TIMEOUT_MS,
  )
  const onExternalAbort = () => controller.abort()
  options?.signal?.addEventListener("abort", onExternalAbort)

  try {
    const url = buildGeocodeUrl(name, params, { permanent: true })
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return fallback
    const data = (await res.json()) as { features?: MapboxFeature[] }
    const c = data.features?.[0]?.center
    if (!c || c.length < 2) return fallback

    const point: LngLat = { lng: c[0]!, lat: c[1]! }
    // El permanente responde a la etiqueta, no al id del candidato: si apunta a
    // otro sitio (homónimo en otro país), preferimos no cambiar lo que eligió el
    // usuario. Mejor una coordenada temporal correcta que una permanente errónea.
    const drift = haversineKm(point, fallback)
    if (!Number.isFinite(drift) || drift > (options?.maxDriftKm ?? PERMANENT_MAX_DRIFT_KM)) {
      return fallback
    }

    setMemory(key, point.lng, point.lat)
    writeLocalCache(key, point.lng, point.lat, { label: name })
    return point
  } catch {
    // Aborto, timeout, red caída, JSON roto: nos quedamos con lo de siempre.
    return fallback
  } finally {
    clearTimeout(timer)
    options?.signal?.removeEventListener("abort", onExternalAbort)
  }
}

/** Sembrar la caché de geocodeFreeText para un place_name ya elegido (acelerador opcional). */
export function seedGeocodeCache(
  placeName: string,
  center: LngLat,
  countryCodes?: string[] | null,
): void {
  const name = placeName?.trim()
  if (!name) return
  const cKey = countryParamsKey(countryCodes)
  const key = geocodeQueryKey(`__dest__${name}`, null, cKey)
  setMemory(key, center.lng, center.lat)
  writeLocalCache(key, center.lng, center.lat)
}

/**
 * Geocodifica un texto libre (p. ej. destino del viaje) y devuelve [lng, lat] para `proximity`.
 */
export async function geocodeFreeText(
  text: string,
  options?: { country?: string; countryCodes?: string[]; types?: string },
): Promise<[number, number] | null> {
  const hit = await geocodeFirstHit(text, options)
  return hit ? [hit.coord.lng, hit.coord.lat] : null
}

async function geocodeFirstHit(
  text: string,
  options?: { country?: string; countryCodes?: string[]; types?: string },
): Promise<{ coord: { lng: number; lat: number }; featureType: string; label: string } | null> {
  if (!MAPBOX_TOKEN?.trim() || !text?.trim()) return null
  const cKey =
    options?.countryCodes && options.countryCodes.length
      ? countryParamsKey(options.countryCodes)
      : "none"
  const typesExtra = options?.types ? `types:${options.types}` : ""
  const key = geocodeQueryKey(`__dest__${text.trim()}`, null, cKey, typesExtra)
  const mem = getFromMemory(key) ?? readLocalCache(key)
  if (mem) {
    const cached = readAnchorCache(key)
    return {
      coord: mem,
      featureType: cached?.featureType ?? "place",
      label: cached?.label || text.trim(),
    }
  }

  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    limit: "1",
    autocomplete: "false",
    language: "es",
  })
  if (options?.country) params.set("country", options.country)
  appendCountryParams(params, options?.countryCodes)
  if (options?.types) params.set("types", options.types)
  const url = buildGeocodeUrl(text.trim(), params)

  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as { features?: MapboxFeature[] }
  const f = data.features?.[0]
  const c = f?.center
  if (!c) return null
  const lng = c[0]
  const lat = c[1]
  const featureType = featureTypeFromMapboxId(f?.id)
  const label = f?.text?.trim() || f?.place_name?.trim() || text.trim()
  setMemory(key, lng, lat)
  writeLocalCache(key, lng, lat, { featureType, label })
  return { coord: { lng, lat }, featureType, label }
}

/** Ancla de región: types restringidos a ciudad/comarca/país (nunca una calle homónima). */
export async function geocodeRegionAnchor(
  text: string,
  options?: { countryCodes?: string[] },
): Promise<RegionAnchor | null> {
  if (!MAPBOX_TOKEN?.trim() || !text?.trim()) return null
  const ladder = regionAnchorQueryLadder(text)
  if (ladder.length === 0) return null
  const cKey =
    options?.countryCodes && options.countryCodes.length
      ? countryParamsKey(options.countryCodes)
      : "none"
  const key = geocodeQueryKey(`__anchor__${text.trim()}`, null, cKey, `types:${REGION_ANCHOR_TYPES}|t7`)
  const mem = getAnchorFromMemory(key) ?? readAnchorCache(key)
  if (mem) return mem

  for (const q of ladder) {
    const hits = await geocodeAnchorHits(q, options?.countryCodes)
    const hit = pickBestAnchorHit(
      hits.map((h) => ({
        coord: h.coord,
        featureType: h.featureType,
        text: h.label,
        placeName: h.placeName,
      })),
      q,
    )
    if (!hit) continue
    const value: RegionAnchor = {
      coord: hit.coord,
      featureType: hit.featureType,
      label: hit.text?.trim() || hit.placeName?.trim() || q,
    }
    setAnchorMemory(key, value)
    writeLocalCache(key, value.coord.lng, value.coord.lat, {
      featureType: value.featureType,
      label: value.label,
    })
    return value
  }
  return null
}

async function geocodeAnchorHits(
  text: string,
  countryCodes?: string[],
): Promise<Array<{ coord: LngLat; featureType: string; label: string; placeName: string }>> {
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    limit: "5",
    autocomplete: "false",
    language: "es",
    types: REGION_ANCHOR_TYPES,
  })
  appendCountryParams(params, countryCodes)
  const url = buildGeocodeUrl(text.trim(), params)
  const res = await fetch(url)
  if (!res.ok) return []
  const data = (await res.json()) as { features?: MapboxFeature[] }
  const out: Array<{ coord: LngLat; featureType: string; label: string; placeName: string }> = []
  for (const f of data.features ?? []) {
    const c = f.center
    if (!c || c.length < 2) continue
    const label = f.text?.trim() || f.place_name?.trim() || text.trim()
    out.push({
      coord: { lng: c[0], lat: c[1] },
      featureType: featureTypeFromMapboxId(f.id),
      label,
      placeName: f.place_name?.trim() || "",
    })
  }
  return out
}

/**
 * Geocodifica el nombre de un sitio.
 * Pasa `tripDestination` (destino del viaje) para construir p. ej. "POI, Granada, …" y reducir homónimos.
 * `countryCodes` añade el filtro `country=` de Mapbox (ISO-3166-1 alpha-2) y evita homónimos en otro continente.
 * Devuelve hasta 5 candidatos (mismo coste que 1); el caller elige con `pickGeocodeOutcome`.
 */
export async function geocodeName(
  name: string,
  options?: {
    proximity?: [number, number] | null
    country?: string
    /** Códigos ISO-2: limitan el geocoder a esos estados. */
    countryCodes?: string[] | null
    /** P. ej. "Alpujarra de Granada" o "Soportújar" — se concatena a la búsqueda si aporta contexto. */
    tripDestination?: string | null
  },
): Promise<GeocodeCandidate[]> {
  if (!MAPBOX_TOKEN?.trim() || !name?.trim()) return []
  const proximity = options?.proximity ?? null
  const fullQuery = buildContextualQuery(name, options?.tripDestination)
  if (!fullQuery) return []
  const cKey = countryParamsKey(options?.countryCodes)
  const key = geocodeQueryKey(fullQuery, proximity, cKey, "n5t")
  const cached = getCandidatesFromMemory(key) ?? readCandidateCache(key)
  if (cached) return cached

  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    limit: "5",
    autocomplete: "false",
    language: "es",
  })
  if (proximity) {
    params.set("proximity", `${proximity[0]},${proximity[1]}`)
  }
  if (options?.countryCodes?.length) {
    appendCountryParams(params, options.countryCodes)
  } else if (options?.country) {
    params.set("country", options.country)
  }

  const url = buildGeocodeUrl(fullQuery, params)

  const res = await fetch(url)
  if (!res.ok) return []
  const data = (await res.json()) as { features?: MapboxFeature[] }
  const candidates: GeocodeCandidate[] = []
  for (const f of data.features ?? []) {
    const c = f.center
    if (!c || c.length < 2) continue
    candidates.push({
      coord: { lng: c[0], lat: c[1] },
      featureType: featureTypeFromMapboxId(f.id),
      placeName: f.place_name?.trim(),
      text: f.text?.trim() || undefined,
    })
  }
  if (candidates.length > 0) {
    setCandidateMemory(key, candidates)
    writeCandidateCache(key, candidates)
  }
  return candidates
}

function chunkCoordsForDirections(coords: LngLat[], maxPerChunk: number): LngLat[][] {
  if (coords.length <= maxPerChunk) return [coords]
  const out: LngLat[][] = []
  let i = 0
  while (i < coords.length) {
    const end = Math.min(i + maxPerChunk, coords.length)
    out.push(coords.slice(i, end))
    if (end >= coords.length) break
    i = end - 1
  }
  return out
}

function mergeLineStrings(parts: { type: "LineString"; coordinates: [number, number][] }[]): {
  type: "LineString"
  coordinates: [number, number][]
} {
  const all: [number, number][] = []
  for (const p of parts) {
    if (p.coordinates.length === 0) continue
    if (all.length === 0) {
      all.push(...p.coordinates)
    } else {
      const [fx, fy] = p.coordinates[0]
      const [lx, ly] = all[all.length - 1]
      if (fx === lx && fy === ly) {
        all.push(...p.coordinates.slice(1))
      } else {
        all.push(...p.coordinates)
      }
    }
  }
  return { type: "LineString", coordinates: all }
}

const MAX_WAYPOINTS = 25
/** Solo memoria: las geometrías overview=full no caben en localStorage sin riesgo de cuota. */
const DIRECTIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Clave legacy a limpiar una vez (Fase 5.4). */
const DIRECTIONS_LEGACY_LS_KEY = "wp-mapbox-dir-v1"

type DirectionsResponse = {
  routes?: {
    distance: number
    geometry: { type: "LineString"; coordinates: [number, number][] }
    legs?: { distance: number }[]
  }[]
  code?: string
}

export type DirectionsResult = {
  geometry: { type: "LineString"; coordinates: [number, number][] }
  distanceMeters: number
  /** false si algún chunk falló: no etiquetar el total como «por carretera». */
  complete: boolean
  failedChunks: number
  /** Distancia por tramo entre waypoints consecutivos (cuando la API la aporta). */
  legDistancesMeters: number[]
}

function directionsCacheKey(coords: LngLat[], profile: string): string {
  const sig = coords.map((c) => `${c.lng.toFixed(5)},${c.lat.toFixed(5)}`).join(";")
  return `${profile}|${sig}`
}

const directionsMemoryCache = new Map<string, { value: DirectionsResult; exp: number }>()

let clearedLegacyDirectionsCache = false
function clearLegacyDirectionsLocalStorage(): void {
  if (clearedLegacyDirectionsCache) return
  clearedLegacyDirectionsCache = true
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(DIRECTIONS_LEGACY_LS_KEY)
  } catch {
    // ignore
  }
}

function readDirectionsCache(key: string): DirectionsResult | null {
  clearLegacyDirectionsLocalStorage()
  const mem = directionsMemoryCache.get(key)
  if (!mem) return null
  if (mem.exp < Date.now()) {
    directionsMemoryCache.delete(key)
    return null
  }
  return mem.value
}

function writeDirectionsCache(key: string, value: DirectionsResult): void {
  // Solo rutas completas en memoria (misma sesión / reabrir el modo).
  if (!value.complete) return
  directionsMemoryCache.set(key, { value, exp: Date.now() + DIRECTIONS_TTL_MS })
}

/**
 * Ruta en coche (driving) entre waypoints; si hay &gt;25, parte en tramos y une geometrías.
 * Devuelve `null` si no hay al menos 2 puntos o ningún chunk devolvió ruta.
 * `complete === false` indica que algún chunk falló (no etiquetar como «por carretera»).
 */
export async function getDirections(
  coords: LngLat[],
  options?: { profile?: "driving"; signal?: AbortSignal },
): Promise<DirectionsResult | null> {
  if (!MAPBOX_TOKEN?.trim() || coords.length < 2) return null
  const profile = options?.profile ?? "driving"
  const cacheKey = directionsCacheKey(coords, profile)
  const cached = readDirectionsCache(cacheKey)
  if (cached) return cached

  const chunks = chunkCoordsForDirections(coords, MAX_WAYPOINTS)
  const geometries: { type: "LineString"; coordinates: [number, number][] }[] = []
  const legDistancesMeters: number[] = []
  let distanceM = 0
  let failedChunks = 0
  let expectedChunks = 0

  for (const part of chunks) {
    if (part.length < 2) continue
    expectedChunks += 1
    const path = part.map((c) => `${c.lng},${c.lat}`).join(";")
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${path}?${new URLSearchParams({
      access_token: MAPBOX_TOKEN,
      geometries: "geojson",
      overview: "full",
    })}`
    try {
      const res = await fetch(url, { signal: options?.signal })
      if (!res.ok) {
        failedChunks += 1
        continue
      }
      const data = (await res.json()) as DirectionsResponse
      if (data.code && data.code !== "Ok") {
        failedChunks += 1
        continue
      }
      const route = data.routes?.[0]
      if (!route?.geometry || route.geometry.type !== "LineString") {
        failedChunks += 1
        continue
      }
      geometries.push(route.geometry)
      distanceM += route.distance
      if (route.legs?.length) {
        for (const leg of route.legs) {
          legDistancesMeters.push(leg.distance)
        }
      } else if (part.length === 2) {
        legDistancesMeters.push(route.distance)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err
      failedChunks += 1
    }
  }

  if (geometries.length === 0) return null
  const geometry = mergeLineStrings(geometries)
  const result: DirectionsResult = {
    geometry,
    distanceMeters: distanceM,
    complete: failedChunks === 0 && expectedChunks > 0,
    failedChunks,
    legDistancesMeters,
  }
  writeDirectionsCache(cacheKey, result)
  return result
}

// ── Search Box: hubs de transporte (T4B.3) ───────────────────────────────────
// Geocoding v5 no sirve para «aeropuerto más cercano a estas coords».
// Search Box `/category` sí: facturable por petición sobre el token público
// (anotar en vigilancia T1.3). Categorías canónicas del SDK/list/category.

/** Radio máximo por tipo de hub (km). Conservador: un pueblo sin hub cercano no inventa. */
export const HUB_MAX_DISTANCE_KM: Record<"airport" | "station" | "busStation", number> = {
  airport: 200,
  station: 80,
  busStation: 50,
}

/**
 * Categorías Search Box. Varias IDs mejoran cobertura (p. ej. metro en Japón).
 * @see https://docs.mapbox.com/api/search/search-box/#category-search
 */
const SEARCH_BOX_CATEGORY: Record<"airport" | "station" | "busStation", string> = {
  airport: "airport",
  station: "railway_station,metro_station,light_rail_station",
  busStation: "bus_station,bus_stop",
}

/** ~1° lat ≈ 111 km; lng se ajusta por cos(lat). */
export function hubSearchBbox(
  center: LngLat,
  radiusKm: number,
): [number, number, number, number] {
  const latDelta = radiusKm / 111
  const cos = Math.cos((center.lat * Math.PI) / 180)
  const lngDelta = radiusKm / (111 * Math.max(0.2, Math.abs(cos)))
  return [
    center.lng - lngDelta,
    center.lat - latDelta,
    center.lng + lngDelta,
    center.lat + latDelta,
  ]
}

export type TransportHubSuggestion = {
  id: string
  label: string
  placeName: string
  center: LngLat
  kind: Extract<RoutePlaceKind, "airport" | "station" | "busStation">
  distanceKm: number
}

/** Distancia Haversine en km. Exportada para tests. */
export function haversineKm(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

type SearchBoxFeature = {
  type?: string
  geometry?: { type?: string; coordinates?: [number, number] }
  properties?: {
    mapbox_id?: string
    name?: string
    name_preferred?: string
    full_address?: string
    place_formatted?: string
    feature_type?: string
    poi_category?: string[]
    poi_category_ids?: string[]
    coordinates?: { longitude?: number; latitude?: number }
  }
}

const hubSessionCache = new Map<string, TransportHubSuggestion[]>()

function hubCacheKey(
  kind: "airport" | "station" | "busStation",
  proximity: LngLat,
): string {
  return `${kind}|${proximity.lng.toFixed(3)},${proximity.lat.toFixed(3)}`
}

/** Invalida la caché de hubs de la pestaña (p. ej. «Buscar de nuevo»). */
export function clearTransportHubCache(
  kind?: "airport" | "station" | "busStation",
  proximity?: LngLat,
): void {
  if (kind && proximity) {
    hubSessionCache.delete(hubCacheKey(kind, proximity))
    return
  }
  hubSessionCache.clear()
}

/**
 * Aeropuertos / estaciones cercanos vía Search Box `/category`.
 * Usa `proximity` + `bbox` (el bias solo no basta en Asia: Mapbox puede devolver
 * hubs lejanos que luego el filtro Haversine descarta → lista vacía).
 * No cachea resultados vacíos (evita quedar atrapado tras un fallo puntual).
 */
export async function searchTransportHubs(
  kind: "airport" | "station" | "busStation",
  proximity: LngLat,
  options?: { limit?: number; signal?: AbortSignal; countryCodes?: string[] | null },
): Promise<TransportHubSuggestion[]> {
  if (!isPlaceSearchEnabled()) return []
  if (!MAPBOX_TOKEN?.trim()) return []
  if (!Number.isFinite(proximity.lng) || !Number.isFinite(proximity.lat)) return []

  const cacheKey = hubCacheKey(kind, proximity)
  const cached = hubSessionCache.get(cacheKey)
  if (cached && cached.length > 0) return cached

  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 10)
  const category = SEARCH_BOX_CATEGORY[kind]
  const maxKm = HUB_MAX_DISTANCE_KM[kind]
  const bbox = hubSearchBbox(proximity, maxKm)
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    language: "es",
    limit: String(limit),
    proximity: `${proximity.lng},${proximity.lat}`,
    bbox: bbox.map((n) => n.toFixed(5)).join(","),
  })
  // No filtrar por trip.countries: origen/traslado fronterizo pueden quedar fuera.
  // countryCodes queda disponible por si un caller lo necesita explícitamente.
  appendCountryParams(params, options?.countryCodes)

  // Mantener comas en multi-categoría (encodeURIComponent las convierte en %2C y Mapbox falla).
  const url = `https://api.mapbox.com/search/searchbox/v1/category/${encodeURIComponent(category).replace(/%2C/gi, ",")}?${params}`
  try {
    const res = await fetch(url, { signal: options?.signal })
    if (!res.ok) return []
    const data = (await res.json()) as { features?: SearchBoxFeature[] }
    const out: TransportHubSuggestion[] = []

    for (const f of data.features ?? []) {
      const props = f.properties
      const coords =
        props?.coordinates?.longitude != null && props?.coordinates?.latitude != null
          ? { lng: props.coordinates.longitude, lat: props.coordinates.latitude }
          : f.geometry?.coordinates && f.geometry.coordinates.length >= 2
            ? { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }
            : null
      if (!coords) continue
      const distanceKm = haversineKm(proximity, coords)
      if (distanceKm > maxKm) continue
      const label =
        props?.name_preferred?.trim() ||
        props?.name?.trim() ||
        ""
      if (!label) continue
      const placeName =
        props?.full_address?.trim() ||
        [label, props?.place_formatted?.trim()].filter(Boolean).join(", ") ||
        label
      out.push({
        id: props?.mapbox_id ?? `${kind}-${coords.lng}-${coords.lat}`,
        label,
        placeName,
        center: coords,
        kind,
        distanceKm,
      })
    }

    out.sort((a, b) => a.distanceKm - b.distanceKm)
    if (out.length > 0) hubSessionCache.set(cacheKey, out)
    return out
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err
    return []
  }
}

