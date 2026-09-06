/**
 * Resolución del origen en NewTripDialog: qué se puede aceptar en silencio
 * y qué exige confirmación explícita del usuario.
 */
import type { GeocodeSuggestion, LngLat } from "@/lib/mapbox"
import type { TripOrigin } from "@/types/itinerary"

export type OriginSubmitDecision =
  | { kind: "empty" }
  | { kind: "confirmed"; origin: TripOrigin }
  | {
      kind: "needs_confirm"
      origin: TripOrigin
      /** Etiqueta a mostrar en el input (siempre visible antes del 2º toque). */
      displayLabel: string
      placeNameForCache?: string
    }
  | { kind: "unresolved" }

function originFromSuggestion(s: GeocodeSuggestion): TripOrigin {
  return {
    label: s.text,
    countryCode: s.countryCode,
    coords: s.center,
  }
}

/**
 * Solo igualdad exacta (case-insensitive) con `suggestion.text`.
 * Nunca usa prefijos ni `placeName`: eso adivinaría ciudades ("San" → San Francisco).
 */
export function exactTextSuggestionMatch<T extends { text: string }>(
  query: string,
  suggestions: T[],
): T | null {
  const q = query.trim().toLowerCase()
  if (!q || suggestions.length === 0) return null
  const first = suggestions[0]!
  if (first.text.toLowerCase() === q) return first
  return null
}

/**
 * Decide qué hacer al enviar el formulario con texto de origen sin confirmar.
 * `geocodeCoords` es el resultado opcional de `geocodeFreeText` (null = no resolvió).
 *
 * - vacío → empty
 * - ya confirmado (selected.label === query) → confirmed
 * - igualdad exacta con first.text → confirmed
 * - hay candidatos o geocode → needs_confirm (rellenar campo, 2º toque)
 * - nada → unresolved
 */
export function decideOriginOnSubmit(params: {
  query: string
  selected: TripOrigin | null
  suggestions: GeocodeSuggestion[]
  geocodeCoords: LngLat | [number, number] | null
}): OriginSubmitDecision {
  const q = params.query.trim()
  if (!q) return { kind: "empty" }

  if (params.selected && params.selected.label === q) {
    return { kind: "confirmed", origin: params.selected }
  }

  const exact = exactTextSuggestionMatch(q, params.suggestions)
  if (exact) {
    return { kind: "confirmed", origin: originFromSuggestion(exact) }
  }

  // Prefijo / texto parcial: proponer el primero, nunca enviar en silencio.
  if (params.suggestions.length > 0) {
    const first = params.suggestions[0]!
    return {
      kind: "needs_confirm",
      origin: originFromSuggestion(first),
      displayLabel: first.text,
      placeNameForCache: first.placeName,
    }
  }

  // geocodeFreeText: mismo trato — el usuario debe ver el resultado.
  if (params.geocodeCoords) {
    const coords = Array.isArray(params.geocodeCoords)
      ? { lng: params.geocodeCoords[0], lat: params.geocodeCoords[1] }
      : params.geocodeCoords
    return {
      kind: "needs_confirm",
      origin: { label: q, countryCode: null, coords },
      displayLabel: q,
    }
  }

  return { kind: "unresolved" }
}
