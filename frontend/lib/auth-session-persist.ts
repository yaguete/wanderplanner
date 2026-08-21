/**
 * Remember-me: las cookies `sb-…` de Supabase se escriben persistentes (~400 días)
 * o de sesión (sin Max-Age). El marcador `wp-session-persist` lo decide.
 *
 * `@supabase/ssr` pisa `cookieOptions.maxAge` con el default; el único punto de
 * intercepción es nuestro `setAll`. Quitar `maxAge` a ciegas convierte los
 * borrados (`maxAge: 0`) en cookies de sesión vacías y `signOut` deja de cerrar.
 */

export const SESSION_PERSIST_COOKIE = "wp-session-persist"
export const SESSION_PERSIST_MAX_AGE = 400 * 24 * 60 * 60

export type PersistMode = "always" | "session"

/** Ausente o basura → "always": nadie pierde su sesión con el deploy. */
export function parsePersistMode(raw: string | null | undefined): PersistMode {
  return raw === "session" ? "session" : "always"
}

export function persistModeFromRemember(remember: boolean): PersistMode {
  return remember ? "always" : "session"
}

/**
 * `remember=0` → session, `remember=1` → always.
 * Ausente (confirmación de email, recuperación) → null: el caller usa la cookie
 * que ya hubiera, o `always` si no hay.
 */
export function persistModeFromRememberParam(
  raw: string | null | undefined,
): PersistMode | null {
  if (raw === "0") return "session"
  if (raw === "1") return "always"
  return null
}

/**
 * Quita maxAge/expires solo en escrituras reales (maxAge > 0 o ausente).
 * Los borrados (`maxAge: 0`) pasan intactos.
 */
export function applyPersistMode<T extends object>(
  mode: PersistMode,
  options: T,
): T {
  if (mode === "always") return options
  const maxAge = (options as { maxAge?: number }).maxAge
  if (typeof maxAge === "number" && maxAge <= 0) return options
  const next = { ...options } as T & { maxAge?: number; expires?: Date }
  delete next.maxAge
  delete next.expires
  return next
}

/** Opciones con las que se escribe el propio marcador (400 días, lax, path /). */
export function persistCookieOptions(): {
  maxAge: number
  sameSite: "lax"
  path: "/"
} {
  return {
    maxAge: SESSION_PERSIST_MAX_AGE,
    sameSite: "lax",
    path: "/",
  }
}
