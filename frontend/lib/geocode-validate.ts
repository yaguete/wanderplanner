/**
 * Validación de candidatos de Geocoding v5 contra un ancla de región.
 * Puro: sin I/O. La distancia es la única señal fiable (relevance miente).
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
 * Entre los que pasan el filtro, preferir no-address (Calle X vs el POI/ciudad).
 * Orden de Mapbox se conserva dentro de cada grupo.
 */
export function pickFirstValidCandidate(
  candidates: GeocodeCandidate[],
  anchor: RegionAnchor | null,
): GeocodeCandidate | null {
  const passing = anchor
    ? candidates.filter((c) => candidatePassesAnchor(c, anchor))
    : candidates
  if (passing.length === 0) return null
  return passing.find((c) => c.featureType !== "address") ?? passing[0]!
}

export function pickGeocodeOutcome(
  candidates: GeocodeCandidate[],
  anchor: RegionAnchor | null,
): PlaceGeocodeOutcome {
  const hit = pickFirstValidCandidate(candidates, anchor)
  if (hit) return { precision: "exact", coord: hit.coord }
  if (anchor) {
    return { precision: "approximate", coord: anchor.coord, anchorLabel: anchor.label }
  }
  return { precision: "unlocated" }
}

const SPREAD_RADIUS_M = 40
const EARTH_M = 6_371_000

function coordKey(c: LngLat): string {
  return `${c.lng.toFixed(5)},${c.lat.toFixed(5)}`
}

function offsetAround(center: LngLat, index: number, count: number): LngLat {
  const angle = (2 * Math.PI * index) / count
  const dLat = ((SPREAD_RADIUS_M * Math.cos(angle)) / EARTH_M) * (180 / Math.PI)
  const cosLat = Math.cos((center.lat * Math.PI) / 180)
  const dLng =
    ((SPREAD_RADIUS_M * Math.sin(angle)) / (EARTH_M * Math.max(0.2, Math.abs(cosLat)))) *
    (180 / Math.PI)
  return { lng: center.lng + dLng, lat: center.lat + dLat }
}

/**
 * Reparte pines aproximados que caen en la misma coordenada (~40 m, bajo
 * PLACES_ZERO_KM_EPSILON) para que el hover no tape a los demás.
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
