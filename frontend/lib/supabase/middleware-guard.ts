/**
 * Decisiones puras del middleware de sesión. Sin I/O: el `getUser()` a GoTrue
 * vive en `middleware.ts` y lleva presupuesto; si se cuelga, Vercel responde
 * `MIDDLEWARE_INVOCATION_TIMEOUT` (504) y no entra ni el login.
 */

export const PROTECTED_PREFIXES = ["/trips", "/account"] as const

/** Tope por debajo de los ~25 s de Edge. Si vence, se deja pasar la request. */
export const GET_USER_BUDGET_MS = 5_000

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Cookie de acceso de `@supabase/ssr` (y trozos `.0` / `.1` si el JWT no cabe).
 * Sin ella `getUser()` no tiene nada que refrescar: no hay que ir a Auth.
 */
export function hasSupabaseAuthCookie(
  cookies: readonly { name: string }[],
): boolean {
  return cookies.some((c) => c.name.includes("-auth-token"))
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
