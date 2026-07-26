import { collectCountryCodesFromHint, getCountryByCode } from "@/lib/countries"

const UNSPLASH_KEY = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY

const SESSION_KEY = "wp-unsplash-thumb-v1"
const MAX_SESSION_ENTRIES = 80

interface UnsplashPhoto {
  urls: {
    raw: string
    regular: string
    small: string
  }
  alt_description: string | null
  user: { name: string }
}

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
 * Devuelve URL de imagen 128px (Unsplash) o `null` si no hay clave, query vacía o sin resultados.
 * Caché en memoria y sessionStorage; cola de concurrencia para no saturar la API.
 */
export async function fetchUnsplashThumbnailByQuery(query: string | null | undefined): Promise<string | null> {
  if (!UNSPLASH_KEY?.trim() || !query?.trim()) return null
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

    const params = new URLSearchParams({
      query: key,
      per_page: "1",
      content_filter: "high",
    })

    const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
    })

    if (!res.ok) {
      memoryCache.set(key, null)
      return null
    }

    const data = (await res.json()) as { results?: UnsplashPhoto[] }
    const photo = data.results?.[0]
    if (!photo?.urls?.raw) {
      memoryCache.set(key, null)
      return null
    }
    const url = `${photo.urls.raw}&w=128&h=128&fit=crop&q=80`
    memoryCache.set(key, url)
    writeSessionKey(key, url)
    return url
  } catch {
    memoryCache.set(key, null)
    return null
  } finally {
    release()
  }
}

/**
 * Resuelve URL de miniatura: usa caché/fetch Unsplash; si falla, `null` (el caller aplica Picsum).
 */
export async function resolveThumbUrlOrNull(query: string | null | undefined): Promise<string | null> {
  return fetchUnsplashThumbnailByQuery(query)
}

/**
 * Search Unsplash for a destination photo.
 * Returns a URL sized for a card cover, or null if unavailable.
 */
export async function fetchDestinationCover(destination: string): Promise<string | null> {
  if (!UNSPLASH_KEY) return null

  try {
    const params = new URLSearchParams({
      query: `${destination} travel landscape`,
      per_page: "1",
      orientation: "landscape",
      content_filter: "high",
    })

    const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
    })

    if (!res.ok) return null

    const data = (await res.json()) as { results?: UnsplashPhoto[] }
    const photo: UnsplashPhoto | undefined = data.results?.[0]
    if (!photo) return null

    return `${photo.urls.raw}&w=600&h=300&fit=crop&q=80`
  } catch {
    return null
  }
}

/**
 * Consultas de portada en orden de preferencia a partir de una fuente:
 * 1) `source.area` (destino del artículo),
 * 2) nombre del país inferido desde ese área.
 */
export function coverQueriesFromSource(source: {
  area: string | null
}): string[] {
  const queries: string[] = []
  const area = source.area?.trim()
  if (area) queries.push(area)

  const codes = collectCountryCodesFromHint(area)
  for (const code of codes) {
    const name = getCountryByCode(code.toUpperCase())?.name
    if (name && !queries.some((q) => q.toLowerCase() === name.toLowerCase())) {
      queries.push(name)
    }
  }
  return queries
}

/** Prueba cada consulta con `fetchDestinationCover` y devuelve la primera imagen. */
export async function fetchCoverFromQueries(queries: string[]): Promise<string | null> {
  for (const q of queries) {
    if (!q.trim()) continue
    const url = await fetchDestinationCover(q.trim())
    if (url) return url
  }
  return null
}
