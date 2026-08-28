/**
 * Destino post-login. Solo rutas internas relativas.
 * Rechaza `//evil.com` (protocol-relative) y cualquier cosa que no empiece por `/`.
 */
export function safeNext(raw: string | null | undefined, fallback = "/trips"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback
  return raw
}

/**
 * Tras `signInWithPassword` / `signUp` las cookies `sb-…` se acaban de escribir
 * en `document.cookie`. `router.push` + `router.refresh` arma el fetch RSC **antes**
 * de que esas cookies entren en la petición: el middleware no ve sesión, 307 a
 * `/login`, y Turnstile se remonta (segundo captcha). Un document load sí las lleva.
 */
export function completeAuthNavigation(path: string): void {
  window.location.assign(safeNext(path))
}
