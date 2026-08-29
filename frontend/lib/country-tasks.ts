/**
 * Cliente de GET /country-tasks + helpers de filtrado / ids.
 * Caché memoria + sessionStorage (patrón thumbs.ts). Fail soft: nunca bloquea la UI.
 */
import { parseApiDetail } from "@/lib/api"
import { authHeaders } from "@/lib/api-auth"
import { resolveTripCountryCodes } from "@/lib/countries"
import type { ExtraTask, Source, Trip, TripTaskCategory } from "@/types/itinerary"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const SESSION_KEY = "wp-country-tasks-v1"
const MAX_SESSION_ENTRIES = 40
/** Cliente web y MCP: Fly puede estar dormido (`min_machines_running = 0`). */
export const COUNTRY_TASKS_FETCH_TIMEOUT_MS = 25_000
const FETCH_TIMEOUT_MS = COUNTRY_TASKS_FETCH_TIMEOUT_MS

export const COUNTRY_TASK_ID_PREFIX = "country:"

export type CountryTaskSuggestion = {
  id: string
  title: string
  category: Extract<TripTaskCategory, "paperwork" | "health">
  leadTimeDays: number | null
  details: string | null
  countryCode: string
  countryName: string
}

export type CountryTaskSource = {
  countryCode: string
  name: string
  url: string | null
  briefFetchedAt: string | null
}

export type CountryTasksResult = {
  disclaimer: string
  briefSource: string
  suggestions: CountryTaskSuggestion[]
  /** Fuentes oficiales por país (URL MAE + fecha de consulta). */
  sources: CountryTaskSource[]
  /** Países consultados con error (no confundir con tasks vacío verificado). */
  errors: { countryCode: string; name: string; error: string }[]
}

type WireTask = {
  id?: string
  title?: string
  category?: string
  lead_time_days?: number | null
  details?: string | null
}

type WireCountry = {
  country_code?: string
  name?: string
  tasks?: WireTask[]
  error?: string | null
  cached?: boolean
  brief_fetched_at?: string | null
  url?: string | null
}

type WireResponse = {
  disclaimer?: string
  brief_source?: string
  countries?: WireCountry[]
}

const memoryCache = new Map<string, CountryTasksResult>()

function readSessionMap(): Record<string, CountryTasksResult> {
  if (typeof window === "undefined") return {}
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, CountryTasksResult>
  } catch {
    return {}
  }
}

function writeSessionKey(key: string, value: CountryTasksResult) {
  if (typeof window === "undefined") return
  try {
    const m = readSessionMap()
    m[key] = value
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

export function countryTasksCacheKey(codes: string[]): string {
  return [...codes].map((c) => c.toUpperCase()).sort().join(",")
}

export function invalidateCountryTasksCache(codes?: string[]) {
  if (!codes || codes.length === 0) {
    memoryCache.clear()
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(SESSION_KEY)
      } catch {
        // ignore
      }
    }
    return
  }
  const key = countryTasksCacheKey(codes)
  memoryCache.delete(key)
  if (typeof window === "undefined") return
  try {
    const m = readSessionMap()
    delete m[key]
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(m))
  } catch {
    // ignore
  }
}

export function isCountryTaskId(id: string): boolean {
  return id.startsWith(COUNTRY_TASK_ID_PREFIX)
}

/** Prefijo ISO de un id `country:th:visado-tdac` → `TH`. */
export function countryCodeFromTaskId(id: string): string | null {
  if (!isCountryTaskId(id)) return null
  const parts = id.split(":")
  if (parts.length < 3) return null
  const code = parts[1]?.toUpperCase()
  return code && /^[A-Z]{2}$/.test(code) ? code : null
}

/**
 * Destinos efectivos para trámites: `trip.countries` si hay; si no, inferencia
 * conservadora vía `resolveTripCountryCodes` (fuentes/regiones activas).
 */
export function effectiveCountryCodesForTasks(
  trip: Trip,
  sources: Source[] = [],
): string[] {
  return resolveTripCountryCodes(trip, sources)
}

export function parseCountryTasksWire(data: unknown): CountryTasksResult {
  const payload: WireResponse =
    data && typeof data === "object" ? (data as WireResponse) : {}
  const suggestions: CountryTaskSuggestion[] = []
  const errors: CountryTasksResult["errors"] = []
  const sources: CountryTaskSource[] = []
  for (const entry of payload.countries ?? []) {
    const code = (entry.country_code || "").toUpperCase()
    const name = entry.name || code
    const url =
      typeof entry.url === "string" && entry.url.trim() ? entry.url.trim() : null
    const briefFetchedAt =
      typeof entry.brief_fetched_at === "string" && entry.brief_fetched_at.trim()
        ? entry.brief_fetched_at
        : null
    sources.push({ countryCode: code, name, url, briefFetchedAt })
    if (entry.error) {
      errors.push({ countryCode: code, name, error: String(entry.error) })
      continue
    }
    for (const t of entry.tasks ?? []) {
      if (!t?.id || !t.title) continue
      if (t.category !== "paperwork" && t.category !== "health") continue
      suggestions.push({
        id: t.id,
        title: t.title,
        category: t.category,
        leadTimeDays:
          typeof t.lead_time_days === "number" && t.lead_time_days >= 0
            ? t.lead_time_days
            : null,
        details: typeof t.details === "string" && t.details.trim() ? t.details : null,
        countryCode: code,
        countryName: name,
      })
    }
  }
  return {
    disclaimer:
      typeof payload.disclaimer === "string" && payload.disclaimer.trim()
        ? payload.disclaimer
        : "Las recomendaciones del MAE están redactadas para ciudadanos españoles.",
    briefSource:
      typeof payload.brief_source === "string" && payload.brief_source.trim()
        ? payload.brief_source
        : "Ministerio de Asuntos Exteriores (España)",
    suggestions,
    sources,
    errors,
  }
}

export function emptyCountryTasksResult(): CountryTasksResult {
  return {
    disclaimer: "Las recomendaciones del MAE están redactadas para ciudadanos españoles.",
    briefSource: "Ministerio de Asuntos Exteriores (España)",
    suggestions: [],
    sources: [],
    errors: [],
  }
}

export type CountryTasksFetchFailure = {
  ok: false
  reason: "timeout" | "unauthorized" | "http" | "network" | "quota"
  status?: number
  message?: string
}

export type CountryTasksFetchOutcome =
  | { ok: true; result: CountryTasksResult }
  | CountryTasksFetchFailure

/** Copia de `usage.py` (`country_tasks`, daily) si el 429 llega sin `detail.message`. */
export const COUNTRY_TASKS_QUOTA_MESSAGE =
  "Has alcanzado el límite diario de consultas de trámites. Vuelve mañana."

export function countryTasksFetchErrorText(
  failure: Pick<CountryTasksFetchFailure, "reason" | "message">,
): string {
  if (failure.reason === "quota") {
    const custom = failure.message?.trim()
    return custom || COUNTRY_TASKS_QUOTA_MESSAGE
  }
  if (failure.reason === "timeout") {
    return "La consulta de trámites tardó demasiado (el servidor puede estar arrancando). Inténtalo de nuevo."
  }
  if (failure.reason === "unauthorized") {
    return "No hay sesión. Vuelve a conectar WanderPlanner."
  }
  return "No se pudieron cargar los trámites oficiales. Inténtalo de nuevo."
}

async function countryTasksFailureFromResponse(
  res: Response,
): Promise<CountryTasksFetchFailure | null> {
  if (res.ok) return null
  if (res.status === 401) return { ok: false, reason: "unauthorized", status: 401 }
  if (res.status === 429) {
    let message = COUNTRY_TASKS_QUOTA_MESSAGE
    try {
      const body: unknown = await res.json()
      const detail =
        body != null && typeof body === "object" && !Array.isArray(body) && "detail" in body
          ? (body as { detail: unknown }).detail
          : body
      const parsed = parseApiDetail(detail, 429)
      if (parsed.message.trim() && !parsed.message.startsWith("Error del servidor")) {
        message = parsed.message.trim()
      }
    } catch {
      // Cuerpo ilegible: el default diario es el consejo correcto.
    }
    return { ok: false, reason: "quota", status: 429, message }
  }
  return { ok: false, reason: "http", status: res.status }
}

/**
 * Fetch servidor (MCP): Bearer explícito, sin sessionStorage ni caché de proceso.
 * La caché de memoria de `fetchCountryTasks` es de un usuario en el navegador;
 * en serverless mezclaría respuestas entre peticiones.
 */
export async function fetchCountryTasksWithToken(
  codes: string[],
  accessToken: string,
  options?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<CountryTasksFetchOutcome> {
  const normalized = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))]
  if (normalized.length === 0) {
    return { ok: true, result: emptyCountryTasksResult() }
  }
  const timeoutMs = options?.timeoutMs ?? COUNTRY_TASKS_FETCH_TIMEOUT_MS
  const fetchImpl = options?.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const params = new URLSearchParams({ codes: normalized.join(",") })
    const res = await fetchImpl(`${API_BASE}/country-tasks?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
    const failure = await countryTasksFailureFromResponse(res)
    if (failure) return failure
    const data: unknown = await res.json()
    return { ok: true, result: parseCountryTasksWire(data) }
  } catch {
    if (controller.signal.aborted) return { ok: false, reason: "timeout" }
    return { ok: false, reason: "network" }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch lazy de trámites. La UI degrada ante `ok: false` (timeout, red, cuota).
 * `bypassCache` solo limpia session/memory; el backend sigue sirviendo su caché durable.
 */
export async function fetchCountryTasks(
  codes: string[],
  options?: { signal?: AbortSignal; bypassCache?: boolean },
): Promise<CountryTasksFetchOutcome> {
  const normalized = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))]
  if (normalized.length === 0) {
    return { ok: true, result: emptyCountryTasksResult() }
  }
  const key = countryTasksCacheKey(normalized)
  if (options?.bypassCache) {
    invalidateCountryTasksCache(normalized)
  } else {
    const cached = memoryCache.get(key)
    if (cached) return { ok: true, result: cached }
    if (typeof window !== "undefined") {
      const hit = readSessionMap()[key]
      if (hit) {
        memoryCache.set(key, hit)
        return { ok: true, result: hit }
      }
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  options?.signal?.addEventListener("abort", onAbort)
  try {
    const params = new URLSearchParams({ codes: normalized.join(",") })
    const res = await fetch(`${API_BASE}/country-tasks?${params}`, {
      headers: { ...(await authHeaders()) },
      signal: controller.signal,
    })
    const failure = await countryTasksFailureFromResponse(res)
    if (failure) return failure
    const data = (await res.json()) as WireResponse
    const parsed = parseCountryTasksWire(data)
    memoryCache.set(key, parsed)
    // No congelar fallos parciales en sessionStorage (sí en memoria de pestaña).
    if (parsed.errors.length === 0) {
      writeSessionKey(key, parsed)
    }
    return { ok: true, result: parsed }
  } catch {
    if (options?.signal?.aborted) return { ok: false, reason: "network" }
    if (controller.signal.aborted) return { ok: false, reason: "timeout" }
    return { ok: false, reason: "network" }
  } finally {
    clearTimeout(timer)
    options?.signal?.removeEventListener("abort", onAbort)
  }
}

/** Sugerencias visibles: excluye aceptadas (extraTasks) y descartadas. */
export function filterVisibleSuggestions(
  trip: Trip,
  suggestions: CountryTaskSuggestion[],
): CountryTaskSuggestion[] {
  const accepted = new Set(trip.extraTasks.map((e) => e.id))
  const dismissed = new Set(trip.dismissedCountryTasks ?? [])
  return suggestions.filter((s) => !accepted.has(s.id) && !dismissed.has(s.id))
}

export function hasDismissedActiveCountryTasks(
  trip: Trip,
  activeCodes: string[],
): boolean {
  const active = new Set(activeCodes.map((c) => c.toUpperCase()))
  return (trip.dismissedCountryTasks ?? []).some((id) => {
    const code = countryCodeFromTaskId(id)
    return code != null && active.has(code)
  })
}

/** Notas iniciales al aceptar: details + plazo si existe. */
export function notesForAcceptedSuggestion(s: CountryTaskSuggestion): string | null {
  const parts: string[] = []
  if (s.details?.trim()) parts.push(s.details.trim())
  if (s.leadTimeDays != null) {
    parts.push(`Tramitar con ~${s.leadTimeDays} días de antelación.`)
  }
  if (parts.length === 0) return null
  return parts.join(" ")
}

export function suggestionToExtraTaskInput(s: CountryTaskSuggestion): {
  id: string
  title: string
  category: Extract<TripTaskCategory, "paperwork" | "health">
  state: { status: "pending"; cost: null; notes: string | null }
} {
  return {
    id: s.id,
    title: s.title,
    category: s.category,
    state: {
      status: "pending",
      cost: null,
      notes: notesForAcceptedSuggestion(s),
    },
  }
}

/** Helpers exportados para tests de round-trip de ids. */
export function buildCountryTaskId(countryCode: string, slug: string): string {
  const code = countryCode.trim().toLowerCase()
  const clean = slug
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${COUNTRY_TASK_ID_PREFIX}${code}:${clean || "tramite"}`
}

export type { ExtraTask }
