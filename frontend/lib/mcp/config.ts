import { SITE_URL } from "@/lib/site"

export const DEFAULT_MCP_RESOURCE_URL = `${SITE_URL}/mcp`
export const AUTHENTICATED_AUD = "authenticated"

/** Solo la cadena `true` (sin importar mayúsculas) enciende el MCP. Unset = apagado. */
export function isMcpEnabled(raw: string | undefined = process.env.MCP_ENABLED): boolean {
  return (raw ?? "").trim().toLowerCase() === "true"
}

export function mcpResourceUrl(
  raw: string | undefined = process.env.MCP_RESOURCE_URL,
): string {
  const value = (raw ?? "").trim()
  return value || DEFAULT_MCP_RESOURCE_URL
}

/** Origen del recurso: `withMcpAuth.resourceUrl` es un origen, no el identificador RFC 9728. */
export function mcpResourceOrigin(resource = mcpResourceUrl()): string {
  return new URL(resource).origin
}

export function supabaseUrl(
  raw: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string {
  return (raw ?? "").trim().replace(/\/+$/, "")
}

export function supabaseIssuer(url = supabaseUrl()): string {
  return url ? `${url}/auth/v1` : ""
}

export function supabaseJwksUrl(url = supabaseUrl()): string {
  return url ? `${url}/auth/v1/.well-known/jwks.json` : ""
}

export function supabaseAnonKey(
  raw: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): string {
  return (raw ?? "").trim()
}

/** Solo `"true"` (sin importar mayúsculas) deja `affiliateUrl` en el payload MCP. Default off. */
export function isMcpAffiliateLinksEnabled(
  raw: string | undefined = process.env.MCP_AFFILIATE_LINKS_ENABLED,
): boolean {
  return (raw ?? "").trim().toLowerCase() === "true"
}
