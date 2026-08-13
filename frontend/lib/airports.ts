/**
 * Resolución de código IATA / área metropolitana a partir de un RoutePlace (T4B.3b).
 * Tabla generada: `airports-data.ts` (OurAirports). No persistir el código en el jsonb.
 */
import { AIRPORTS_PACKED } from "@/lib/airports-data"
import { haversineMeters } from "@/lib/map-route-geometry"
import type { RoutePlace, RoutePlaceKind } from "@/types/itinerary"

export const AIRPORT_HUB_MAX_KM = 25
export const AIRPORT_CITY_MAX_KM = 80

const LABEL_IATA_RE = /\(([A-Z]{3})\)/

type AirportRow = { code: string; lng: number; lat: number }

let parsed: AirportRow[] | null = null
let byCode: Map<string, AirportRow> | null = null

function parsePacked(): AirportRow[] {
  if (parsed) return parsed
  const rows: AirportRow[] = []
  const map = new Map<string, AirportRow>()
  for (const chunk of AIRPORTS_PACKED.split("|")) {
    if (chunk.length < 6) continue
    const code = chunk.slice(0, 3)
    const comma = chunk.indexOf(",", 3)
    if (comma < 0) continue
    const lng = Number(chunk.slice(3, comma))
    const lat = Number(chunk.slice(comma + 1))
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    const row = { code, lng, lat }
    rows.push(row)
    map.set(code, row)
  }
  parsed = rows
  byCode = map
  return rows
}

function airportByCode(code: string): AirportRow | null {
  parsePacked()
  return byCode?.get(code) ?? null
}

/**
 * Códigos IATA de área metropolitana. Solo para extremos ciudad/dirección:
 * «el más cercano» falla en Londres (LCY), París (LBG / aviación privada), etc.
 * OurAirports no contiene estos códigos; Kiwi `/deep` sí los acepta (verificado 13 ago 2026).
 */
const METRO_AREAS: readonly [code: string, lng: number, lat: number, radiusKm: number][] = [
  ["LON", -0.128, 51.507, 60],
  ["PAR", 2.352, 48.857, 50],
  ["NYC", -74.006, 40.713, 50],
  ["MIL", 9.19, 45.464, 50],
  ["ROM", 12.496, 41.903, 40],
  ["TYO", 139.692, 35.69, 70],
  ["STO", 18.069, 59.329, 50],
  ["YTO", -79.383, 43.653, 40],
  ["BUE", -58.382, -34.604, 40],
  ["MOW", 37.618, 55.756, 50],
  ["SAO", -46.633, -23.55, 40],
  ["RIO", -43.173, -22.907, 40],
  ["CHI", -87.629, 41.878, 50],
  ["WAS", -77.037, 38.907, 50],
  ["OSA", 135.502, 34.694, 50],
  ["SEL", 126.978, 37.566, 50],
  ["BER", 13.405, 52.52, 40],
  ["BKK", 100.502, 13.756, 50],
  ["IST", 28.978, 41.008, 50],
  ["JKT", 106.845, -6.208, 50],
  ["TEH", 51.389, 35.689, 40],
  ["BHZ", -43.938, -19.917, 40],
  ["DTT", -83.046, 42.331, 50],
]

function radiusKmForKind(kind: RoutePlaceKind): number {
  return kind === "airport" ? AIRPORT_HUB_MAX_KM : AIRPORT_CITY_MAX_KM
}

function kmTo(place: RoutePlace, lng: number, lat: number): number {
  return haversineMeters(place.coords, { lng, lat }) / 1000
}

function nearestInTable(place: RoutePlace, maxKm: number): AirportRow | null {
  let best: AirportRow | null = null
  let bestKm = maxKm
  for (const row of parsePacked()) {
    const km = kmTo(place, row.lng, row.lat)
    if (km <= bestKm) {
      best = row
      bestKm = km
    }
  }
  return best
}

function metroForCity(place: RoutePlace): string | null {
  let best: string | null = null
  let bestKm = Infinity
  for (const [code, lng, lat, radiusKm] of METRO_AREAS) {
    const km = kmTo(place, lng, lat)
    if (km <= radiusKm && km < bestKm) {
      best = code
      bestKm = km
    }
  }
  return best
}

function iataFromLabel(label: string, place: RoutePlace, maxKm: number): string | null {
  const match = LABEL_IATA_RE.exec(label)
  if (!match) return null
  const code = match[1]!
  const row = airportByCode(code)
  if (!row) return null
  if (kmTo(place, row.lng, row.lat) > maxKm) return null
  return code
}

/** Código IATA de aeropuerto o de área metropolitana; null si no hay ninguno en radio. */
export function resolveAirportCode(place: RoutePlace): string | null {
  const maxKm = radiusKmForKind(place.kind)
  const fromLabel = iataFromLabel(place.label, place, maxKm)
  if (fromLabel) return fromLabel

  if (place.kind === "airport") {
    return nearestInTable(place, AIRPORT_HUB_MAX_KM)?.code ?? null
  }

  const metro = metroForCity(place)
  if (metro) return metro

  return nearestInTable(place, AIRPORT_CITY_MAX_KM)?.code ?? null
}
