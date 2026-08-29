/**
 * El kill switch apaga el DATO, no el pintado: si `affiliateUrl` viaja en
 * structuredContent, ChatGPT puede imprimirlo aunque el widget no lo enlace.
 */
import { isMcpAffiliateLinksEnabled } from "./config"

export function applyMcpAffiliateGate<T>(
  data: T,
  enabled: boolean = isMcpAffiliateLinksEnabled(),
): T {
  if (enabled) return data
  return stripAffiliateUrls(data)
}

export function stripAffiliateUrls<T>(value: T): T {
  if (value == null || typeof value !== "object") return value
  if (Array.isArray(value)) {
    return value.map((item) => stripAffiliateUrls(item)) as T
  }
  const out: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    out[key] = key === "affiliateUrl" ? null : stripAffiliateUrls(nested)
  }
  return out as T
}
