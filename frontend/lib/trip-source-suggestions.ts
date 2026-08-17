/**
 * Sugerencias de fuentes para el diálogo «Añadir fuente».
 *
 * Query/fingerprint del viaje + caché memoria/sessionStorage por fingerprint
 * (no por tripId: dos viajes a Austria comparten búsqueda). Fetch perezoso;
 * el filtrado de URLs ya activas es en render, no en la caché.
 */
import { authHeaders } from "@/lib/api-auth"
import { getCountryByCode, resolveTripCountryCodes } from "@/lib/countries"
import {
  isSourceSuggestEnabled,
  suggestSources,
  type SourceSuggestHit,
} from "@/lib/source-suggest"
import { sourceMatchKey } from "@/lib/trip-sources"
import type { Source, Trip } from "@/types/itinerary"

export const TRIP_SOURCE_SUGGEST_LIMIT = 8
export const TRIP_SOURCE_SUGGEST_MOBILE_MAX = 3

const SESSION_KEY = "wp-trip-source-suggest"
const MAX_SESSION_ENTRIES = 40
const MIN_QUERY_LEN = 3
const MAX_QUERY_LEN = 60
const Q_STRIP = /[^\p{L}\p{N}_\s\-]/gu

type CacheEntry = { hits: SourceSuggestHit[]; fetchedAt: number }

const memoryCache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<SourceSuggestHit[]>>()

export type TripSuggestQuery = { query: string; fingerprint: string }

export type SuggestFetcher = typeof suggestSources

function joinEs(names: string[]): string {
  if (names.length === 0) return ""
  if (names.length === 1) return names[0]!
  if (names.length === 2) return `${names[0]} y ${names[1]}`
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`
}

/** Espejo de `fold_text` en `backend/source_suggest.py`. */
export function foldSuggestText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
}

/** Espejo de `sanitize_suggest_query` (letras/dígitos/espacios/guiones, 3–60). */
export function sanitizeSuggestQuery(raw: string): string | null {
  let q = (raw || "").trim().replace(Q_STRIP, "")
  q = q.replace(/\s+/g, " ").trim()
  if (q.length < MIN_QUERY_LEN) return null
  return q.slice(0, MAX_QUERY_LEN)
}

/**
 * Firma barata para no pagar `resolveTripCountryCodes` en cada mutación del viaje.
 * Solo cambia cuando cambian países, áreas de fuente o el nombre.
 */
export function tripSuggestSignature(
  trip: Pick<Trip, "name" | "countries">,
  sources: Pick<Source, "area">[],
): string {
  return `${(trip.countries ?? []).join(",")}\0${sources.map((s) => s.area ?? "").join("|")}\0${trip.name}`
}

/**
 * Destino para `GET /sources/suggest`. Prioriza el área de la fuente (ciudad
 * o región del artículo) sobre el país inferido: «Cuenca, Spain» → «Cuenca»,
 * no «España». Sin área, hasta 2 países; si no, el nombre del viaje.
 * No usa `tripDestinationLabel` (esa etiqueta alimenta los chips del asistente).
 */
export function tripSuggestQuery(
  trip: Pick<Trip, "name" | "countries" | "days">,
  sources: Pick<Source, "area" | "items">[] = [],
): TripSuggestQuery | null {
  if (typeof performance !== "undefined" && typeof performance.mark === "function") {
    performance.mark("wp-tripSuggestQuery-start")
  }
  try {
    let raw: string | null = null
    const area = sources.map((s) => s.area?.trim()).find(Boolean)
    if (area) {
      const head = area.split(",")[0]!.trim()
      if (head.length >= 2 && head.length <= 40) raw = head
    }
    if (!raw) {
      const codes = resolveTripCountryCodes(trip, sources)
      const picked = codes.slice(0, 2)
      if (picked.length >= 1) {
        const names = picked
          .map((c) => getCountryByCode(c)?.name)
          .filter((n): n is string => Boolean(n))
        if (names.length) raw = joinEs(names)
      }
    }
    if (!raw) {
      const name = trip.name.trim()
      if (name && !/^viaje\b/i.test(name) && name.length <= 40) raw = name
    }
    if (!raw) return null
    const query = sanitizeSuggestQuery(raw)
    if (!query) return null
    return { query, fingerprint: foldSuggestText(query) }
  } finally {
    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
      performance.mark("wp-tripSuggestQuery-end")
    }
  }
}

function readSessionMap(): Record<string, CacheEntry> {
  if (typeof window === "undefined") return {}
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, CacheEntry>
  } catch {
    return {}
  }
}

function writeSessionKey(fingerprint: string, value: CacheEntry) {
  if (typeof window === "undefined") return
  try {
    const m = readSessionMap()
    m[fingerprint] = value
    const keys = Object.keys(m)
    while (keys.length > MAX_SESSION_ENTRIES) {
      const drop = keys.shift()
      if (drop) delete m[drop]
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(m))
  } catch {
    // quota
  }
}

export function getCachedTripSuggestions(fingerprint: string): SourceSuggestHit[] | undefined {
  const mem = memoryCache.get(fingerprint)
  if (mem) return mem.hits
  if (typeof window === "undefined") return undefined
  const hit = readSessionMap()[fingerprint]
  if (!hit || !Array.isArray(hit.hits)) return undefined
  memoryCache.set(fingerprint, hit)
  return hit.hits
}

export function setCachedTripSuggestions(fingerprint: string, hits: SourceSuggestHit[]) {
  const entry: CacheEntry = { hits, fetchedAt: Date.now() }
  memoryCache.set(fingerprint, entry)
  writeSessionKey(fingerprint, entry)
}

/** Tests / kill: vacía memoria, session y single-flight. */
export function resetTripSourceSuggestionsCache() {
  memoryCache.clear()
  inflight.clear()
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

/**
 * Dedup + quita URLs ya activas (fuentes o pendings). Compara con `sourceMatchKey`.
 */
export function filterUnusedHits(
  hits: SourceSuggestHit[],
  usedUrls: string[],
): SourceSuggestHit[] {
  const used = new Set(usedUrls.map((u) => sourceMatchKey(u)).filter(Boolean))
  const seen = new Set<string>()
  const out: SourceSuggestHit[] = []
  for (const hit of hits) {
    const key = sourceMatchKey(hit.url)
    if (!key || used.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(hit)
  }
  return out
}

export async function fetchTripSourceSuggestions(
  query: string,
  fingerprint: string,
  options?: {
    signal?: AbortSignal
    bypassCache?: boolean
    fetcher?: SuggestFetcher
  },
): Promise<SourceSuggestHit[] | null> {
  if (!isSourceSuggestEnabled()) return null
  if (!options?.bypassCache) {
    const cached = getCachedTripSuggestions(fingerprint)
    if (cached) return cached
    const flying = inflight.get(fingerprint)
    if (flying) return flying
  }

  const run = (async () => {
    const fetcher = options?.fetcher ?? suggestSources
    const headers = options?.fetcher ? {} : await authHeaders()
    const response = await fetcher(query, {
      signal: options?.signal,
      scope: "trip",
      limit: TRIP_SOURCE_SUGGEST_LIMIT,
      fresh: options?.bypassCache === true,
      headers,
    })
    const hits = filterUnusedHits(response.results, [])
    setCachedTripSuggestions(fingerprint, hits)
    return hits
  })()

  inflight.set(fingerprint, run)
  try {
    return await run
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e
    return null
  } finally {
    if (inflight.get(fingerprint) === run) inflight.delete(fingerprint)
  }
}

export function prefetchTripSourceSuggestions(
  trip: Pick<Trip, "name" | "countries" | "days">,
  sources: Pick<Source, "area" | "items">[],
): void {
  if (!isSourceSuggestEnabled()) return
  const dest = tripSuggestQuery(trip, sources)
  if (!dest) return
  if (getCachedTripSuggestions(dest.fingerprint)) return
  void fetchTripSourceSuggestions(dest.query, dest.fingerprint).catch(() => {
    /* fail soft */
  })
}
