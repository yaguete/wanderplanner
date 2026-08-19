/**
 * Reconoce URLs de Google Maps publicadas en artículos y extrae coordenadas.
 * Puro: sin red. Los short links (`maps.app.goo.gl`) se marcan para resolver
 * en el backend; las URLs largas traen el pin en el propio href.
 *
 * Orden de fiabilidad: `!3d!4d` (pin del lugar) > `q=` / `ll=` > `@lat,lng` (cámara).
 */
export type MapsLngLat = { lng: number; lat: number }

const PIN_3D_4D = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/
const AT_CAMERA = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/
const PAIR = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/

function hostnameOf(href: string): { host: string; url: URL } | null {
  try {
    const url = new URL(href.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return { host: url.hostname.toLowerCase().replace(/^www\./, ""), url }
  } catch {
    return null
  }
}

function isGoogleMapsHost(host: string): boolean {
  if (host === "maps.app.goo.gl") return true
  if (host === "goo.gl") return true
  if (host === "maps.google.com" || host.startsWith("maps.google.")) return true
  if (host === "google.com") return true
  return /^google\.[a-z]{2,}(?:\.[a-z]{2,})*$/.test(host)
}

function pathLooksLikeMaps(pathname: string): boolean {
  const p = pathname.toLowerCase()
  return p.includes("/maps") || p.startsWith("/maps")
}

/** True si el href es un enlace de Google Maps (corto o largo). */
export function isMapsUrl(href: string | null | undefined): boolean {
  if (!href?.trim()) return false
  const parsed = hostnameOf(href)
  if (!parsed || !isGoogleMapsHost(parsed.host)) return false
  if (parsed.host === "maps.app.goo.gl") return true
  if (parsed.host === "goo.gl") return parsed.url.pathname.toLowerCase().startsWith("/maps")
  if (parsed.host === "maps.google.com" || parsed.host.startsWith("maps.google.")) return true
  return pathLooksLikeMaps(parsed.url.pathname)
}

/** Short link opaco: hay que resolverlo en servidor. */
export function isShortMapsUrl(href: string | null | undefined): boolean {
  if (!href?.trim()) return false
  const parsed = hostnameOf(href)
  if (!parsed) return false
  if (parsed.host === "maps.app.goo.gl") return true
  return parsed.host === "goo.gl" && parsed.url.pathname.toLowerCase().startsWith("/maps")
}

function asCoord(lat: number, lng: number): MapsLngLat | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat === 0 && lng === 0) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lng, lat }
}

function pairFromSearch(url: URL): MapsLngLat | null {
  for (const key of ["q", "query", "ll"]) {
    const raw = url.searchParams.get(key)
    if (!raw) continue
    const m = raw.trim().match(PAIR)
    if (!m) continue
    const coord = asCoord(Number(m[1]), Number(m[2]))
    if (coord) return coord
  }
  return null
}

/**
 * Extrae `{lng,lat}` de una URL larga de Maps. `null` en short links,
 * direcciones (`/dir/`), búsquedas (`/search/`) y cualquier cosa sin par válido.
 */
export function parseMapsCoords(href: string | null | undefined): MapsLngLat | null {
  if (!href?.trim() || !isMapsUrl(href) || isShortMapsUrl(href)) return null
  const parsed = hostnameOf(href)
  if (!parsed) return null
  const path = parsed.url.pathname.toLowerCase()
  // `/maps/d/` es un visor My Maps: `ll=` es el centro del overlay, no un POI.
  if (path.includes("/dir/") || path.includes("/search/") || path.includes("/maps/d/")) {
    return null
  }

  const pin = href.match(PIN_3D_4D)
  if (pin) {
    const coord = asCoord(Number(pin[1]), Number(pin[2]))
    if (coord) return coord
  }

  const fromQuery = pairFromSearch(parsed.url)
  if (fromQuery) return fromQuery

  const at = href.match(AT_CAMERA)
  if (at) return asCoord(Number(at[1]), Number(at[2]))
  return null
}

/** Clave de caché: host+path en minúsculas, sin barra final; short links sin query. */
export function canonicalizeMapsUrl(href: string): string {
  const raw = href.trim()
  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase()
    const path = u.pathname.replace(/\/+$/, "") || ""
    const short =
      host.replace(/^www\./, "") === "maps.app.goo.gl" ||
      (host.replace(/^www\./, "") === "goo.gl" && u.pathname.toLowerCase().startsWith("/maps"))
    return short
      ? `${u.protocol}//${host}${path}`
      : `${u.protocol}//${host}${path}${u.search}`
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase()
  }
}
