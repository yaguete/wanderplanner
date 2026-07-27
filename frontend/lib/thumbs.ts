/**
 * Miniaturas de ítems vía GET /thumb (Places en el backend).
 * Misma forma que el antiguo fetch Unsplash: memoria + sessionStorage + cola de concurrencia.
 */
import { authHeaders } from "@/lib/api-auth"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const SESSION_KEY = "wp-place-thumb-v1"
const MAX_SESSION_ENTRIES = 80

const memoryCache = new Map<string, string | null>()

function readSessionMap(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

function writeSessionKey(key: string, url: string) {
  if (typeof window === "undefined") return
  try {
    const m = readSessionMap()
    m[key] = url
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

/**
 * Devuelve URL de miniatura (Places vía backend) o `null`.
 * Caché en memoria y sessionStorage; cola de concurrencia.
 */
export async function fetchPlaceThumbnailByQuery(
  query: string | null | undefined,
): Promise<string | null> {
  if (!query?.trim()) return null
  const key = cacheKey(query)
  if (memoryCache.has(key)) return memoryCache.get(key) ?? null
  if (typeof window !== "undefined") {
    const sm = readSessionMap()[key]
    if (sm) {
      memoryCache.set(key, sm)
      return sm
    }
  }

  await acquire()
  try {
    if (memoryCache.has(key)) return memoryCache.get(key) ?? null

    const params = new URLSearchParams({ q: key })
    const res = await fetch(`${API_BASE}/thumb?${params}`, {
      headers: { ...(await authHeaders()) },
    })

    if (!res.ok) {
      memoryCache.set(key, null)
      return null
    }

    const data = (await res.json()) as { url?: string | null }
    const url = typeof data.url === "string" && data.url.trim() ? data.url : null
    memoryCache.set(key, url)
    if (url) writeSessionKey(key, url)
    return url
  } catch {
    memoryCache.set(key, null)
    return null
  } finally {
    release()
  }
}

/** Resuelve URL de miniatura; si falla, `null` (el caller aplica Picsum). */
export async function resolveThumbUrlOrNull(
  query: string | null | undefined,
): Promise<string | null> {
  return fetchPlaceThumbnailByQuery(query)
}
