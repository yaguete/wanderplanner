import { NextResponse, type NextRequest } from "next/server"
import { createClient, writeSessionPersistCookie } from "@/lib/supabase/server"
import { authCallbackErrorCode } from "@/lib/auth-errors"
import {
  parsePersistMode,
  persistModeFromRememberParam,
  SESSION_PERSIST_COOKIE,
  type PersistMode,
} from "@/lib/auth-session-persist"
import { cookies } from "next/headers"

/** Solo rutas internas. Rechaza `//evil.com` y cualquier cosa que no empiece por `/`. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/trips"
  return raw
}

function failRedirect(origin: string, recovery: boolean, code: string): NextResponse {
  const path = recovery ? "/forgot-password" : "/login"
  const error = recovery ? "link" : code
  return NextResponse.redirect(`${origin}${path}?error=${encodeURIComponent(error)}`)
}

async function resolvePersistMode(rememberParam: string | null): Promise<PersistMode> {
  const fromQuery = persistModeFromRememberParam(rememberParam)
  if (fromQuery) return fromQuery
  const cookieStore = await cookies()
  return parsePersistMode(cookieStore.get(SESSION_PERSIST_COOKIE)?.value)
}

/** Intercambia el código de confirmación, recuperación u OAuth por una sesión con cookies. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const next = safeNext(searchParams.get("next"))
  const recovery = next === "/reset-password"
  const oauthError = searchParams.get("error")

  if (oauthError && !code) {
    const mapped = authCallbackErrorCode(oauthError, searchParams.get("error_description"))
    return failRedirect(origin, recovery, mapped)
  }

  if (code) {
    const persistMode = await resolvePersistMode(searchParams.get("remember"))
    const supabase = await createClient(persistMode)
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await writeSessionPersistCookie(persistMode)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return failRedirect(origin, recovery, "auth")
}
