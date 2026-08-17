/**
 * Destino geográfico del mapa: `source.area` + país inferido.
 * El título del viaje no se geocodifica (es un nombre, no un lugar).
 */
import type { Source, Trip } from "@/types/itinerary"
import { getCountryByCode, resolveTripCountryCodes } from "@/lib/countries"
import { isWeakRegionHint } from "@/lib/geocode-validate"

export type MapDestinationTrip = Pick<Trip, "name" | "countries" | "days">
export type MapDestinationSource = Pick<Source, "area" | "items">

export function mapCountryCodes(
  trip: MapDestinationTrip,
  sources: MapDestinationSource[] = [],
): string[] {
  return resolveTripCountryCodes(trip, sources)
}

function uniqueAreas(sources: Pick<Source, "area">[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of sources) {
    const a = s.area?.trim()
    if (!a) continue
    const key = a.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

function hintAlreadyHasCountry(hint: string, countryNames: string[]): boolean {
  const n = hint.toLowerCase()
  return countryNames.some((name) => n.includes(name.toLowerCase()))
}

/**
 * Texto para anclar el mapa. `null` si no hay un área única (varias fuentes
 * en destinos distintos, o ninguna): mejor no anclar que geocodificar el título.
 */
export function mapDestinationHint(
  trip: MapDestinationTrip,
  sources: MapDestinationSource[] = [],
): string | null {
  const areas = uniqueAreas(sources)
  if (areas.length !== 1) return null
  const area = areas[0]!
  const names = mapCountryCodes(trip, sources)
    .map((c) => getCountryByCode(c)?.name)
    .filter((n): n is string => Boolean(n))
  if (names.length === 0) return area
  if (hintAlreadyHasCountry(area, names)) return area
  return `${area}, ${names.join(", ")}`
}

/** Una `region` de ítem solo ancla por sí misma si no es un barrio genérico. */
export function isIndependentRegionHint(region: string | null | undefined): boolean {
  if (!region?.trim()) return false
  return !isWeakRegionHint(region)
}
