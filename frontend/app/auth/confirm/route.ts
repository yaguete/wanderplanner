import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createClient, writeSessionPersistCookie } from "@/lib/supabase/server"
import { failRedirect, resolvePersistMode } from "@/lib/auth-callback-helpers"
import {
  emailConfirmIsRecovery,
  emailConfirmNext,
  parseEmailConfirmType,
} from "@/lib/auth-email-confirm"

/**
 * Canje del enlace de confirmación / cambio de email / recuperación.
 *
 * `token_hash` + `verifyOtp` en servidor: no hay code verifier, vale en
 * cualquier navegador. No es magic link: `type=magiclink` se rechaza.
 * Google SSO sigue en `/auth/callback` (`exchangeCodeForSession`).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get("token_hash")
  const type = parseEmailConfirmType(searchParams.get("type"))
  const next = emailConfirmNext(type ?? "signup", searchParams.get("next"))
  const recovery = emailConfirmIsRecovery(type, next)

  if (!tokenHash || !type) {
    return failRedirect(origin, recovery, "link")
  }

  const persistMode = await resolvePersistMode(searchParams.get("remember"))
  const supabase = await createClient(persistMode)
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (!error) {
    await writeSessionPersistCookie(persistMode)
    return NextResponse.redirect(`${origin}${next}`)
  }

  return failRedirect(origin, recovery, "link")
}
