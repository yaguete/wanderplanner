/**
 * Decisiones puras del middleware de sesión. Sin I/O.
 *
 * No llamamos a `getUser()` en el Edge: un round-trip a GoTrue desde Vercel
 * acaba en `MIDDLEWARE_INVOCATION_TIMEOUT` (504) o en 1–5 s por cada
 * navegación a `/trips` y `/trips/[id]`. Con cookie, se deja pasar; el
 * cliente refresca. Sin cookie en ruta protegida, login.
 */

export const PROTECTED_PREFIXES = ["/trips", "/account"] as const

/** Histórico: presupuesto que usábamos en `getUser()`. Ya no hay I/O en Edge. */
export const GET_USER_BUDGET_MS = 5_000

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function middlewareGate(input: {
  isProtected: boolean
  hasToken: boolean
}): "pass" | "login" {
  if (!input.isProtected) return "pass"
  return input.hasToken ? "pass" : "login"
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
