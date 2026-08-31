import { z } from "zod"
import { preferredDomainsFrom } from "@/lib/assistant-context"
import type { FavoriteReference, TravelerProfile } from "@/lib/db/profile-repo"
import type { SourceSuggestHit } from "@/lib/source-suggest"
import {
  sanitizeSuggestQuery,
  tripSuggestQuery,
} from "@/lib/trip-source-suggestions"
import {
  searchSourcesOutput,
  searchSourcesText,
  type SearchHit,
} from "./search-sources"

export const SEARCH_SUGGEST_LIMIT = 6
export const SEARCH_SUGGEST_TIMEOUT_MS = 8_000
export const SEARCH_TRAVELER_TEXT_MAX = 240

export const searchSuggestionSchema = z.object({
  url: z.string(),
  title: z.string(),
  host: z.string(),
  origin: z.enum(["cache", "curated", "web"]),
  destination: z.string().nullable(),
  totalDays: z.number().nullable(),
})

export const searchTravelerSchema = z
  .object({
    travelerTypes: z.array(z.string()),
    notes: z.string().nullable(),
    favoriteDomains: z.array(z.string()),
    expectations: z.string().nullable(),
  })
  .nullable()

export const searchSourcesToolOutput = z.object({
  layer: z.enum(["trip", "curated", "web", "none"]),
  results: searchSourcesOutput.shape.results,
  suggestions: z.array(searchSuggestionSchema),
  traveler: searchTravelerSchema,
})

export type SearchSuggestion = z.infer<typeof searchSuggestionSchema>
export type SearchTraveler = NonNullable<z.infer<typeof searchTravelerSchema>>
export type SearchSourcesToolResult = z.infer<typeof searchSourcesToolOutput>
export type SearchLayer = SearchSourcesToolResult["layer"]

export function needsSourceSuggest(tripHits: readonly SearchHit[]): boolean {
  return tripHits.length === 0
}

export function slimSuggestHit(hit: SourceSuggestHit): SearchSuggestion {
  return {
    url: hit.url,
    title: hit.title,
    host: hit.host,
    origin: hit.origin,
    destination: hit.destination,
    totalDays: hit.totalDays,
  }
}

/**
 * Una sola capa, sin mezclar. trip gana; si no, cache+curated; si no, web; si no, none.
 * `cache` y `curated` son el nivel 2 de la plataforma (buscador de destinos).
 */
export function resolveSearchLayer(
  tripHits: readonly SearchHit[],
  suggestHits: readonly SourceSuggestHit[],
): Pick<SearchSourcesToolResult, "layer" | "results" | "suggestions"> {
  if (tripHits.length > 0) {
    return { layer: "trip", results: [...tripHits], suggestions: [] }
  }
  const curated = suggestHits.filter((h) => h.origin === "cache" || h.origin === "curated")
  if (curated.length > 0) {
    return { layer: "curated", results: [], suggestions: curated.map(slimSuggestHit) }
  }
  const web = suggestHits.filter((h) => h.origin === "web")
  if (web.length > 0) {
    return { layer: "web", results: [], suggestions: web.map(slimSuggestHit) }
  }
  return { layer: "none", results: [], suggestions: [] }
}

function hostMatchesFavorite(host: string, domain: string): boolean {
  const h = host.replace(/^www\./i, "").toLowerCase()
  const d = domain.replace(/^www\./i, "").toLowerCase()
  if (!h || !d) return false
  return h === d || h.endsWith(`.${d}`)
}

export function rankSuggestionsByFavoriteHosts(
  hits: readonly SearchSuggestion[],
  favoriteDomains: readonly string[],
): SearchSuggestion[] {
  if (favoriteDomains.length === 0) return [...hits]
  const fav: SearchSuggestion[] = []
  const rest: SearchSuggestion[] = []
  for (const hit of hits) {
    const isFav = favoriteDomains.some((d) => hostMatchesFavorite(hit.host, d))
    if (isFav) fav.push(hit)
    else rest.push(hit)
  }
  return [...fav, ...rest]
}

export function suggestQueryForSearch(
  userQuery: string,
  trip: { name: string; countries: string[] },
  sources: Array<{ area: string | null; items?: unknown }>,
): string | null {
  const fromUser = sanitizeSuggestQuery(userQuery)
  if (fromUser) return fromUser
  return (
    tripSuggestQuery(
      { name: trip.name, countries: trip.countries, days: [] },
      sources.map((s) => ({
        area: s.area,
        items: Array.isArray(s.items) ? (s.items as never[]) : [],
      })),
    )?.query ?? null
  )
}

export function clipTravelerField(
  raw: unknown,
  max = SEARCH_TRAVELER_TEXT_MAX,
): string | null {
  if (typeof raw !== "string") return null
  const t = raw.trim()
  if (!t) return null
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trimEnd()}…`
}

export function searchTravelerFrom(
  profile: TravelerProfile | null,
  references: readonly FavoriteReference[],
  expectations: unknown,
): SearchTraveler | null {
  const travelerTypes = profile?.travelerTypes ?? []
  const notes = clipTravelerField(profile?.travelerNotes)
  const favoriteDomains = preferredDomainsFrom([...references])
  const exp = clipTravelerField(expectations)
  if (!travelerTypes.length && !notes && !favoriteDomains.length && !exp) return null
  return {
    travelerTypes,
    notes,
    favoriteDomains,
    expectations: exp,
  }
}

export function searchSourcesToolText(
  query: string,
  layer: SearchLayer,
  results: readonly SearchHit[],
  suggestions: readonly SearchSuggestion[],
  tripSourceCount: number,
  tripName?: string | null,
): string {
  const trip = (tripName ?? "").trim()
  const where = trip ? `«${trip}»` : "este viaje"
  if (layer === "trip") {
    return searchSourcesText(query, [...results], tripSourceCount, tripName)
  }
  if (layer === "none") {
    // Antes decía solo «no tengo fuentes»: ambiguo entre «el viaje no tiene
    // ninguna» y «no hay resultados», y sin decir DÓNDE ha buscado. Con dos
    // viajes abiertos, eso convierte un tripId equivocado en una negativa
    // rotunda.
    return `No hay recomendaciones para «${query}» en las fuentes de ${where} (${tripSourceCount}) ni en los artículos curados de WanderPlanner. Si el usuario preguntaba por otro viaje, compruébalo con list_trips y vuelve a buscar. Si no, no inventes sitios: ofrece añadir una fuente.`
  }
  const heading =
    layer === "curated"
      ? `Artículos curados de WanderPlanner para «${query}»:`
      : `No hay fuentes del viaje ni curadas para «${query}». Artículos externos:`
  const lines = suggestions.slice(0, 8).map((h) => `- ${h.title} (${h.host})`)
  return `${heading}\n${lines.join("\n")}`
}
