/**
 * Google OAuth: flag de despliegue, redirect, alta reciente para el funnel.
 * El claim de invitado lo prepara el caller; aquí no hay `signOut`.
 */
import type { User } from "@supabase/supabase-js"
import { createClient, isSupabaseConfigured, writeSessionPersistMode } from "@/lib/supabase/client"
import { persistModeFromRemember } from "@/lib/auth-session-persist"
import { authErrorMessage } from "@/lib/auth-errors"
import { clearStash, prepareGuestTripClaim } from "@/lib/guest-trip-claim"

const OAUTH_FUNNEL_KEY = "wp-oauth-funnel-check"
const NEW_ACCOUNT_WINDOW_MS = 120_000

function envFlag(raw: string | undefined, fallback: boolean): boolean {
  const value = (raw ?? "").trim().toLowerCase()
  if (!value) return fallback
  return value !== "false" && value !== "0" && value !== "off" && value !== "no"
}

/** Default off: el botón no se enseña hasta encender el provider en el dashboard. */
export function isGoogleAuthEnabled(): boolean {
  return envFlag(process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED, false)
}

export function isRecentlyCreatedUser(
  user: { created_at?: string | null },
  now = Date.now(),
): boolean {
  const created = Date.parse(user.created_at ?? "")
  if (!Number.isFinite(created)) return false
  return now - created < NEW_ACCOUNT_WINDOW_MS
}

export function hasPasswordIdentity(user: User | null | undefined): boolean {
  if (!user) return false
  const identities = user.identities
  if (Array.isArray(identities) && identities.length > 0) {
    return identities.some((identity) => identity.provider === "email")
  }
  const providers = user.app_metadata?.providers
  if (Array.isArray(providers) && providers.length > 0) {
    return providers.includes("email")
  }
  return true
}

export function markOAuthFunnelCheck(): void {
  if (typeof sessionStorage === "undefined") return
  sessionStorage.setItem(OAUTH_FUNNEL_KEY, "1")
}

export function takeOAuthFunnelCheck(): boolean {
  if (typeof sessionStorage === "undefined") return false
  const pending = sessionStorage.getItem(OAUTH_FUNNEL_KEY) === "1"
  if (pending) sessionStorage.removeItem(OAUTH_FUNNEL_KEY)
  return pending
}

export function googleOAuthRedirectTo(origin: string, next: string, remember: boolean): string {
  const params = new URLSearchParams()
  params.set("next", next.startsWith("/") && !next.startsWith("//") ? next : "/trips")
  params.set("remember", remember ? "1" : "0")
  return `${origin}/auth/callback?${params.toString()}`
}

export type GoogleOAuthResult = { ok: true } | { ok: false; error: string }

/**
 * Prepara claim si toca (sin `signOut`), escribe remember-me y redirige a Google.
 * Si el usuario cancela, la sesión de invitado sigue viva.
 */
export async function startGoogleOAuth(input: {
  next: string
  rememberMe: boolean
  claimUserId?: string | null
}): Promise<GoogleOAuthResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase no está configurado." }
  }
  const supabase = createClient()
  writeSessionPersistMode(persistModeFromRemember(input.rememberMe))

  if (input.claimUserId) {
    const prepared = await prepareGuestTripClaim(supabase, input.claimUserId)
    if (!prepared.ok) return { ok: false, error: prepared.error }
  } else {
    clearStash()
  }

  markOAuthFunnelCheck()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: googleOAuthRedirectTo(window.location.origin, input.next, input.rememberMe),
      queryParams: { prompt: "select_account" },
    },
  })
  if (error) {
    clearStash()
    return { ok: false, error: authErrorMessage(error) }
  }
  return { ok: true }
}

