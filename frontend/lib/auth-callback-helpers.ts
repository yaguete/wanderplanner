import "server-only"

import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  parsePersistMode,
  persistModeFromRememberParam,
  SESSION_PERSIST_COOKIE,
  type PersistMode,
} from "@/lib/auth-session-persist"

/**
 * Fallo de `/auth/callback` (OAuth / PKCE) y `/auth/confirm` (TokenHash).
 * Recuperación → `/forgot-password?error=link`. El resto → `/login?error=…`.
 */
export function failRedirect(origin: string, recovery: boolean, code: string): NextResponse {
  const path = recovery ? "/forgot-password" : "/login"
  const error = recovery ? "link" : code
  return NextResponse.redirect(`${origin}${path}?error=${encodeURIComponent(error)}`)
}

/**
 * `remember=0|1` gana. Si no, la cookie `wp-session-persist`, o `always`.
 * Obligatorio pasarlo a `createClient` *antes* de `exchangeCodeForSession` /
 * `verifyOtp`: esas llamadas escriben las `sb-…` en el momento.
 */
export async function resolvePersistMode(rememberParam: string | null): Promise<PersistMode> {
  const fromQuery = persistModeFromRememberParam(rememberParam)
  if (fromQuery) return fromQuery
  const cookieStore = await cookies()
  return parsePersistMode(cookieStore.get(SESSION_PERSIST_COOKIE)?.value)
}
