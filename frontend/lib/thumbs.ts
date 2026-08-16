/**
 * Miniaturas de ítems vía GET /thumb (Commons para actividades, Places de cola).
 * Caché en memoria + sessionStorage; cola de concurrencia.
 */
import { authHeaders } from "@/lib/api-auth"
import type { ItemType } from "@/types/itinerary"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const SESSION_KEY = "wp-place-thumb-v2"
const MAX_SESSION_ENTRIES = 80

export type ThumbProvider = "wikimedia" | "places"

export type ThumbAttribution = {
  author: string
  license: string
  creditUrl: string
}

export type ThumbPayload = {
  url: string | null
  provider: ThumbProvider | null
  attribution: ThumbAttribution | null
}

const EMPTY: ThumbPayload = { url: null, provider: null, attribution: null }

const memoryCache = new Map<string, ThumbPayload>()

function readSessionMap(): Record<string, ThumbPayload> {
  if (typeof window === "undefined") return {}
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, ThumbPayload>
  } catch {
    return {}
  }
}

function writeSessionKey(key: string, payload: ThumbPayload) {
  if (typeof window === "undefined") return
  if (!payload.url) return
  try {
    const m = readSessionMap()
    m[key] = payload
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

let inFlight = 0
const waitQueue: (() => void)[] = []
const MAX_CONCURRENT = 3

function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      inFlight++
      resolve()
    })
  })
}

function release() {
  inFlight = Math.max(0, inFlight - 1)
  const next = waitQueue.shift()
  if (next) next()
}

function cacheKey(query: string): string {
  return query.trim().toLowerCase()
}

function apiKind(kind?: ItemType | "basic"): "activity" | "stay" | "food" | "transport" {
  if (kind === "stay" || kind === "food" || kind === "transport") return kind
  if (kind === "basic") return "stay"
  return "activity"
}

function parsePayload(data: unknown): ThumbPayload {
  if (!data || typeof data !== "object") return EMPTY
  const raw = data as {
    url?: string | null
    provider?: string | null
    attribution?: Partial<ThumbAttribution> | null
  }
  const url = typeof raw.url === "string" && raw.url.trim() ? raw.url.trim() : null
  if (!url) return EMPTY
  const provider = raw.provider === "wikimedia" || raw.provider === "places" ? raw.provider : null
  const a = raw.attribution
  const attribution =
    provider === "wikimedia" && a && typeof a.author === "string" && typeof a.license === "string"
      ? {
          author: a.author,
          license: a.license,
          creditUrl: typeof a.creditUrl === "string" ? a.creditUrl : "",
        }
      : null
  return { url, provider, attribution }
}

/**
 * Miniatura vía backend o `null` en url. Caché en memoria y sessionStorage.
 */
export async function fetchPlaceThumbnailByQuery(
  query: string | null | undefined,
  opts?: { kind?: ItemType | "basic"; name?: string | null },
): Promise<ThumbPayload> {
  if (!query?.trim()) return EMPTY
  const kind = opts?.kind ?? "activity"
  const name = (opts?.name ?? "").trim()
  const q = query.trim().toLowerCase()
  const key = cacheKey(q)
  if (memoryCache.has(key)) return memoryCache.get(key) ?? EMPTY
  if (typeof window !== "undefined") {
    const sm = readSessionMap()[key]
    if (sm?.url) {
      memoryCache.set(key, sm)
      return sm
    }
  }

  await acquire()
  try {
    if (memoryCache.has(key)) return memoryCache.get(key) ?? EMPTY

    const params = new URLSearchParams({ q, kind: apiKind(kind) })
    if (name) params.set("n", name)
    const res = await fetch(`${API_BASE}/thumb?${params}`, {
      headers: { ...(await authHeaders()) },
    })

    if (!res.ok) {
      // 429/5xx: no cachear el fallo, para reintentar si el tope era transitorio.
      return EMPTY
    }

    const payload = parsePayload(await res.json())
    memoryCache.set(key, payload)
    writeSessionKey(key, payload)
    return payload
  } catch {
    return EMPTY
  } finally {
    release()
  }
}

/** Resuelve miniatura; si falla, payload vacío (el caller deja el hueco mudo). */
export async function resolveThumbUrlOrNull(
  query: string | null | undefined,
  opts?: { kind?: ItemType | "basic"; name?: string | null },
): Promise<ThumbPayload> {
  return fetchPlaceThumbnailByQuery(query, opts)
}
