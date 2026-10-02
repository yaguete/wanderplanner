/**
 * Host dedicado del MCP (`mcp.wanderplanner.ai`) y decisiones puras de
 * enrutado / robots. Sin I/O.
 *
 * Lo importa `next.config.ts` (rewrite `beforeFiles`). No añadas imports:
 * nada de React, `next/headers`, `@/` ni nada del navegador. La cadena que
 * se compila en el config es este fichero → `../site`, y `site.ts` es una
 * constante suelta: mantenla así.
 *
 * El host NO se deriva de `MCP_RESOURCE_URL`: es una env y puede apuntar a
 * cualquier cosa; con un valor raro cerraría el producto o no cerraría el alias.
 */
import { SITE_URL } from "../site"

export const MCP_DEDICATED_HOST = "mcp.wanderplanner.ai"

const PRODUCT_HOSTNAME = new URL(SITE_URL).hostname
const PRODUCT_HOSTS = new Set([PRODUCT_HOSTNAME, `www.${PRODUCT_HOSTNAME}`])
const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource"

const MAIN_ROBOTS_DISALLOW = ["/trips", "/account", "/oauth", "/mcp"] as const

/** `gone`: el MCP se retiró del dominio del producto; vive solo en el host dedicado. */
export type McpHostDecision = "pass" | "redirect" | "gone"

export type RobotsForHost = {
  rules: {
    userAgent: string
    allow?: string
    disallow: string | string[]
  }
  sitemap?: string
}

/** Primer host de una lista, minúsculas, sin puerto. */
export function hostnameOf(raw: string | null | undefined): string {
  const first = (raw ?? "").split(",")[0]?.trim().toLowerCase() ?? ""
  return first.replace(/:\d+$/, "")
}

/**
 * Host público de la petición. En Vercel el de la URL interna no es de fiar:
 * `x-forwarded-host` primero, luego `host`. Nunca `nextUrl.hostname`.
 */
export function hostnameFromHeaders(headers: {
  get(name: string): string | null
}): string {
  return hostnameOf(headers.get("x-forwarded-host") ?? headers.get("host"))
}

export function isMcpDedicatedHost(hostname: string): boolean {
  return hostnameOf(hostname) === MCP_DEDICATED_HOST
}

export function isMcpHostAllowedPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/mcp") return true
  if (pathname === "/robots.txt") return true
  if (pathname === "/.well-known" || pathname.startsWith("/.well-known/")) {
    return true
  }
  return false
}

export function isProductHost(hostname: string): boolean {
  return PRODUCT_HOSTS.has(hostnameOf(hostname))
}

/**
 * `/mcp` y los metadatos RFC 9728 que lo anunciaban. Solo se retiran en el
 * dominio del producto: localhost y los previews de Vercel siguen sirviendo
 * `/mcp` para poder probarlo.
 */
export function isRetiredMcpPath(pathname: string): boolean {
  if (pathname === "/mcp" || pathname.startsWith("/mcp/")) return true
  return (
    pathname === PROTECTED_RESOURCE_PATH ||
    pathname.startsWith(`${PROTECTED_RESOURCE_PATH}/`)
  )
}

export function mcpHostGate(input: {
  hostname: string
  pathname: string
}): McpHostDecision {
  if (isMcpDedicatedHost(input.hostname)) {
    return isMcpHostAllowedPath(input.pathname) ? "pass" : "redirect"
  }
  if (isProductHost(input.hostname) && isRetiredMcpPath(input.pathname)) {
    return "gone"
  }
  return "pass"
}

export function mcpHostRedirectUrl(pathname: string, search = ""): string {
  return new URL(`${pathname}${search}`, SITE_URL).toString()
}

export function robotsForHostname(hostname: string): RobotsForHost {
  if (isMcpDedicatedHost(hostname)) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    }
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...MAIN_ROBOTS_DISALLOW],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
