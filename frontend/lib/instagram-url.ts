/**
 * Detección y canónica de posts/reels públicos de Instagram.
 * Espejo de `parse_instagram_shortcode` / `canonical_instagram_url` en backend/instagram.py.
 */

const SHORTCODE_RE = /^[A-Za-z0-9_-]+$/
const MEDIA_KINDS = new Set(["p", "reel", "reels"])
const RESERVED_FIRST = new Set([
  "p",
  "reel",
  "reels",
  "stories",
  "explore",
  "accounts",
  "about",
  "legal",
  "tv",
  "share",
  "direct",
  "tags",
])

function parseHttpUrl(url: string): { host: string; path: string } | null {
  const raw = url.trim()
  if (!/^https?:\/\//i.test(raw)) return null
  try {
    const parsed = new URL(raw)
    const host = parsed.hostname.toLowerCase()
    if (!host) return null
    return { host, path: parsed.pathname || "/" }
  } catch {
    return null
  }
}

function bareHost(host: string): string {
  return host.replace(/^www\./, "")
}

/** Host de Instagram (www, m, instagr.am). */
export function isInstagramHost(host: string): boolean {
  const h = bareHost(host.toLowerCase())
  return h === "instagram.com" || h.endsWith(".instagram.com") || h === "instagr.am"
}

function pathSegmentsPreserveCase(path: string): string[] {
  return path.split("/").filter(Boolean)
}

/**
 * Shortcode de un post o reel público, o null.
 * Acepta /p/, /reel/, /reels/ y /{user}/p|reel/{code}. El shortcode es case-sensitive.
 */
export function parseInstagramShortcode(url: string): string | null {
  const parsed = parseHttpUrl(url)
  if (!parsed || !isInstagramHost(parsed.host)) return null
  const segs = pathSegmentsPreserveCase(parsed.path)
  if (segs.length >= 2 && MEDIA_KINDS.has(segs[0].toLowerCase())) {
    const code = segs[1]
    return SHORTCODE_RE.test(code) ? code : null
  }
  if (
    segs.length >= 3 &&
    !RESERVED_FIRST.has(segs[0].toLowerCase()) &&
    (segs[1].toLowerCase() === "p" || segs[1].toLowerCase() === "reel")
  ) {
    const code = segs[2]
    return SHORTCODE_RE.test(code) ? code : null
  }
  return null
}

export function isInstagramMediaUrl(url: string): boolean {
  return parseInstagramShortcode(url) != null
}

/** Clave de caché y de /start: siempre https://www.instagram.com/p/{shortcode}. */
export function canonicalInstagramUrl(url: string): string | null {
  const code = parseInstagramShortcode(url)
  if (!code) return null
  return `https://www.instagram.com/p/${code}`
}

/** TikTok / YouTube: copy de «pronto». Perfil/story IG: copy de path. */
export function unsupportedSourceUrlMessage(url: string): string | null {
  const parsed = parseHttpUrl(url)
  if (!parsed) return null
  const host = bareHost(parsed.host)
  if (
    host === "tiktok.com" ||
    host.endsWith(".tiktok.com") ||
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be"
  ) {
    return "TikTok y YouTube llegan pronto. Por ahora, un artículo o un post de Instagram."
  }
  if (isInstagramHost(parsed.host) && !isInstagramMediaUrl(url)) {
    return "Aún no podemos leer perfiles, stories ni hashtags. Pega el enlace de un post o un reel."
  }
  return null
}

export function sourceKindFromUrl(url: string): "instagram" | "article" {
  return isInstagramMediaUrl(url) ? "instagram" : "article"
}
