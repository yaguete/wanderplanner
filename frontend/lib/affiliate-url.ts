/**
 * Un afiliado usable es un http(s) absoluto con host.
 * Haiku a veces escribe `/` / `n/a` porque el esquema no admite null;
 * una relativa se resolvería contra wanderplanner.ai y no pagaría al bloguero.
 */

const SENTINELS = new Set(["/", "#", "n/a", "na", "none", "null", "-", "undefined"])

export function sanitizeAffiliateUrl(href: string | null | undefined): string | null {
  const raw = href?.trim()
  if (!raw) return null
  if (SENTINELS.has(raw.toLowerCase())) return null
  const candidate = raw.startsWith("//") ? `https:${raw}` : raw
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    if (!parsed.hostname) return null
    return candidate
  } catch {
    return null
  }
}
