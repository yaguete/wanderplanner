/**
 * Validación de candidatos de Geocoding v5 contra un ancla de región.
 * Puro: sin I/O. La distancia filtra homónimos lejanos; el tipo del candidato
 * decide exact vs approximate (un `place` es el centro de la ciudad, no el sitio).
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

/** Menor = más específico. Empates conservan el orden de Mapbox. */
const TYPE_SPECIFICITY: Record<string, number> = {
  poi: 0,
  address: 1,
  neighborhood: 2,
  locality: 3,
  place: 4,
  district: 5,
  postcode: 6,
  region: 7,
  country: 8,
}

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
 * Entre los que pasan el filtro, el más específico (poi > address > … > country).
 * Empates conservan el orden de Mapbox.
 */
export function pickFirstValidCandidate(
  candidates: GeocodeCandidate[],
  anchor: RegionAnchor | null,
): GeocodeCandidate | null {
  const passing = anchor
    ? candidates.filter((c) => candidatePassesAnchor(c, anchor))
    : candidates
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
): PlaceGeocodeOutcome {
  const hit = pickFirstValidCandidate(candidates, anchor)
  if (hit) {
    if (COARSE_TYPES.has(hit.featureType)) {
      return {
        precision: "approximate",
        coord: hit.coord,
        anchorLabel: candidateAnchorLabel(hit, anchor?.label),
      }
    }
    return { precision: "exact", coord: hit.coord }
  }
  if (anchor) {
    return { precision: "approximate", coord: anchor.coord, anchorLabel: anchor.label }
  }
  return { precision: "unlocated" }
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
