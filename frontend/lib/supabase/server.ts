import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  SESSION_PERSIST_COOKIE,
  applyPersistMode,
  parsePersistMode,
  persistCookieOptions,
  type PersistMode,
} from "@/lib/auth-session-persist"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

/**
 * `persistMode` pisa el marcador de la request. Obligatorio en `/auth/callback`
 * y `/auth/confirm`: `exchangeCodeForSession` / `verifyOtp` escriben las
 * cookies durante la llamada.
 */
export async function createClient(persistMode?: PersistMode): Promise<SupabaseClient> {
  const cookieStore = await cookies()
  const mode = persistMode ?? parsePersistMode(cookieStore.get(SESSION_PERSIST_COOKIE)?.value)

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, applyPersistMode(mode, options ?? {}))
          }
        } catch {
          // Server Component: el refresco de sesión lo hace el middleware.
        }
      },
    },
  })
}

/** Escribe el marcador `wp-session-persist` en la respuesta del Route Handler. */
export async function writeSessionPersistCookie(mode: PersistMode): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_PERSIST_COOKIE, mode, persistCookieOptions())
}
