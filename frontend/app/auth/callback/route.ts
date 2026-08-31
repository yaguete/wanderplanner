import { NextResponse, type NextRequest } from "next/server"
import { createClient, writeSessionPersistCookie } from "@/lib/supabase/server"
import { authCallbackErrorCode } from "@/lib/auth-errors"
import { failRedirect, resolvePersistMode } from "@/lib/auth-callback-helpers"
import { safeNext } from "@/lib/auth-next"

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
