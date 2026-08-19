/**
 * Validación de candidatos de geocoding contra un ancla de región.
 * Puro: sin I/O. La distancia filtra homónimos lejanos; el tipo del candidato
 * decide exact vs approximate (un `place` es el centro de la ciudad, no el sitio).
 * Un `address`/`street` cuyo nombre no coincide con la query no es el sitio.
 */
import { haversineMeters } from "./map-route-geometry"

export type LngLat = { lng: number; lat: number }

export type RegionAnchor = {
  coord: LngLat
  /** Tipo Mapbox: place, locality, district, region, country, … */
  featureType: string
  label: string
}

export type GeocodeCandidate = {
  coord: LngLat
  featureType: string
  placeName?: string
  /** `text` corto de Mapbox (p. ej. «Igls»), no el place_name completo. */
  text?: string
}

export type PlaceGeocodeOutcome =
  | { precision: "exact"; coord: LngLat }
  | { precision: "approximate"; coord: LngLat; anchorLabel: string }
  | { precision: "unlocated" }

/** Radios en metros según el tipo del ancla. `country` no usa radio. */
const RADIUS_M: Record<string, number> = {
  locality: 15_000,
  neighborhood: 15_000,
  place: 25_000,
  district: 60_000,
  region: 150_000,
}

const COUNTRY_OK_TYPES = new Set(["place", "locality", "region", "district", "country"])

/** Tipos administrativos: son el centro de una zona, no el sitio con nombre propio. */
const COARSE_TYPES = new Set([
  "place",
  "locality",
  "neighborhood",
  "district",
  "region",
  "postcode",
  "country",
])

const STREET_LIKE_TYPES = new Set(["address", "street"])

/** Menor = más específico. Empates conservan el orden de Mapbox. */
const TYPE_SPECIFICITY: Record<string, number> = {
  poi: 0,
  address: 1,
  street: 1,
  neighborhood: 2,
  locality: 3,
  place: 4,
  district: 5,
  postcode: 6,
  region: 7,
  country: 8,
}

/** Barrios / puntos cardinales: no anclan solos y no cuentan para el match de tokens. */
const WEAK_GEO_TOKENS = new Set([
  "zona",
  "centro",
  "downtown",
  "casco",
  "antiguo",
  "historico",
  "barrio",
  "pueblo",
  "ciudad",
  "provincia",
  "region",
  "norte",
  "este",
  "oeste",
  "calle",
  "avenida",
  "plaza",
  "paseo",
  "ronda",
  "old",
  "town",
])

const MIN_TOKEN_LEN = 4

function typeSpecificity(featureType: string): number {
  return TYPE_SPECIFICITY[featureType] ?? 9
}

function candidateAnchorLabel(candidate: GeocodeCandidate, fallback?: string): string {
  const text = candidate.text?.trim()
  if (text) return text
  const placeName = candidate.placeName?.trim()
  if (placeName) {
    const first = placeName.split(",")[0]?.trim()
    if (first) return first
  }
  return fallback?.trim() ?? ""
}

function normalizeGeoText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Tokens ≥4 letras que no son barrio/calle genéricos. */
export function significantTokens(text: string): string[] {
  if (!text.trim()) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of normalizeGeoText(text).split(" ")) {
    if (t.length < MIN_TOKEN_LEN || WEAK_GEO_TOKENS.has(t) || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/**
 * True si el resultado comparte algún token significativo con la query.
 * «Cuenca, Zona Centro» vs «Centro, Málaga» → false (solo comparten «centro», débil).
 * «Cuenca» vs «Cuenca, provincia de Cuenca» → true.
 */
export function sharesSignificantToken(query: string, result: string): boolean {
  const tokens = significantTokens(query)
  if (tokens.length === 0) return false
  const blob = normalizeGeoText(result)
  if (!blob) return false
  return tokens.some((t) => blob.includes(t))
}

/** Barrio suelto: no se geocodifica como ancla independiente. */
export function isWeakRegionHint(region: string | null | undefined): boolean {
  const t = region?.trim()
  if (!t) return true
  return significantTokens(t).length === 0
}

/**
 * Queries a probar, de más específica a más corta, omitiendo hints débiles.
 * «Cuenca, Zona Centro» → «Cuenca, Zona Centro», «Cuenca».
 */
export function regionAnchorQueryLadder(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const out: string[] = []
  const add = (q: string) => {
    const s = q.trim()
    if (!s || isWeakRegionHint(s)) return
    const key = normalizeGeoText(s)
    if (!key || out.some((x) => normalizeGeoText(x) === key)) return
    out.push(s)
  }
  add(trimmed)
  const first = trimmed.split(",")[0]?.trim()
  if (first) add(first)
  const tokens = significantTokens(trimmed)
  if (tokens.length) add(tokens.join(" "))
  return out
}

function candidateNameBlob(candidate: GeocodeCandidate): string {
  return normalizeGeoText(`${candidate.text ?? ""} ${candidate.placeName ?? ""}`)
}

/**
 * Un `address`/`street` solo es el sitio si todos los tokens significativos
 * de la query aparecen en su nombre. «El Gallo Gastrobar» vs «Calle Cuenca» → false;
 * «Casas Colgadas» vs «Calle Casas Colgadas» → true.
 */
export function candidateNameMatchesQuery(
  candidate: GeocodeCandidate,
  query: string,
): boolean {
  const q = query.trim()
  if (!q) return false
  const blob = candidateNameBlob(candidate)
  if (!blob) return false
  const tokens = significantTokens(q)
  if (tokens.length === 0) return blob.includes(normalizeGeoText(q))
  return tokens.every((t) => blob.includes(t))
}

function isStreetLike(featureType: string): boolean {
  return STREET_LIKE_TYPES.has(featureType)
}

export function maxDistanceMetersForAnchorType(featureType: string): number | null {
  if (featureType === "country") return null
  return RADIUS_M[featureType] ?? RADIUS_M.place!
}

export function featureTypeFromMapboxId(id: string | undefined | null): string {
  if (!id) return "unknown"
  const dot = id.indexOf(".")
  return dot > 0 ? id.slice(0, dot) : id
}

export function candidatePassesAnchor(
  candidate: GeocodeCandidate,
  anchor: RegionAnchor,
): boolean {
  if (anchor.featureType === "country") {
    return COUNTRY_OK_TYPES.has(candidate.featureType)
  }
  const maxM = maxDistanceMetersForAnchorType(anchor.featureType)
  if (maxM == null) return true
  return haversineMeters(candidate.coord, anchor.coord) <= maxM
}

/**
 * Radios para pines GPS del artículo. Más holgados que Search Box: un viaje
 * de 20 días en Alaska (`region`) no cabe en 150 km, y un `poi` falla el
 * filtro `country` de `candidatePassesAnchor`. Bali sigue fuera.
 */
const MAPS_PIN_RADIUS_M: Record<string, number> = {
  locality: 80_000,
  neighborhood: 80_000,
  place: 250_000,
  district: 800_000,
  region: 2_500_000,
  country: 8_000_000,
}

export function mapsPinPassesAnchor(coord: LngLat, anchor: RegionAnchor): boolean {
  const maxM = MAPS_PIN_RADIUS_M[anchor.featureType] ?? MAPS_PIN_RADIUS_M.place!
  return haversineMeters(coord, anchor.coord) <= maxM
}

/**
 * Entre los que pasan el filtro, el más específico (poi > address > … > country).
 * Empates conservan el orden de Mapbox.
 * Un `address`/`street` sin coincidencia de nombre con `query` no cuenta.
 */
export function pickFirstValidCandidate(
  candidates: GeocodeCandidate[],
  anchor: RegionAnchor | null,
  query?: string | null,
): GeocodeCandidate | null {
  const passing = (anchor
    ? candidates.filter((c) => candidatePassesAnchor(c, anchor))
    : candidates
  ).filter((c) => {
    if (!isStreetLike(c.featureType)) return true
    return query ? candidateNameMatchesQuery(c, query) : false
  })
  if (passing.length === 0) return null
  let best = passing[0]!
  let bestRank = typeSpecificity(best.featureType)
  for (let i = 1; i < passing.length; i++) {
    const c = passing[i]!
    const rank = typeSpecificity(c.featureType)
    if (rank < bestRank) {
      best = c
      bestRank = rank
    }
  }
  return best
}

export function pickGeocodeOutcome(
  candidates: GeocodeCandidate[],
  anchor: RegionAnchor | null,
  query?: string | null,
): PlaceGeocodeOutcome {
  if (!anchor) return { precision: "unlocated" }
  const hit = pickFirstValidCandidate(candidates, anchor, query)
  if (hit) {
    if (COARSE_TYPES.has(hit.featureType)) {
      return {
        precision: "approximate",
        coord: hit.coord,
        anchorLabel: candidateAnchorLabel(hit, anchor.label),
      }
    }
    return { precision: "exact", coord: hit.coord }
  }
  return { precision: "approximate", coord: anchor.coord, anchorLabel: anchor.label }
}

/** Radio de reparto visual: ~30 m · n (n = tamaño del grupo). */
const SPREAD_METERS_PER_PIN = 30
const EARTH_M = 6_371_000

function coordKey(c: LngLat): string {
  return `${c.lng.toFixed(5)},${c.lat.toFixed(5)}`
}

function offsetAround(center: LngLat, index: number, count: number): LngLat {
  const radiusM = SPREAD_METERS_PER_PIN * count
  const angle = (2 * Math.PI * index) / count
  const dLat = ((radiusM * Math.cos(angle)) / EARTH_M) * (180 / Math.PI)
  const cosLat = Math.cos((center.lat * Math.PI) / 180)
  const dLng =
    ((radiusM * Math.sin(angle)) / (EARTH_M * Math.max(0.2, Math.abs(cosLat)))) *
    (180 / Math.PI)
  return { lng: center.lng + dLng, lat: center.lat + dLat }
}

/**
 * Reparte pines aproximados que caen en la misma coordenada para el display.
 * El radio crece con el grupo (~30 m · n). No usar el resultado en la geometría
 * de la ruta: solo marcadores y fitBounds (`displayCoord`).
 */
export function offsetStackedApproximate<
  T extends { id: string; coord: LngLat; precision?: string },
>(items: T[]): Map<string, LngLat> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    if (item.precision !== "approximate") continue
    const key = coordKey(item.coord)
    const g = groups.get(key)
    if (g) g.push(item)
    else groups.set(key, [item])
  }
  const out = new Map<string, LngLat>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.forEach((item, i) => {
      out.set(item.id, offsetAround(item.coord, i, group.length))
    })
  }
  return out
}
