/**
 * Destino post-login. Solo rutas internas relativas.
 * Rechaza `//evil.com` (protocol-relative) y cualquier cosa que no empiece por `/`.
 */
export function safeNext(raw: string | null | undefined, fallback = "/trips"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback
  return raw
}
