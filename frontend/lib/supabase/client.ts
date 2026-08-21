"use client"

import { parse, serialize } from "cookie"
import { createBrowserClient } from "@supabase/ssr"
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

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

export function writeSessionPersistMode(mode: PersistMode): void {
  if (typeof document === "undefined") return
  document.cookie = serialize(SESSION_PERSIST_COOKIE, mode, persistCookieOptions())
}

export function clearSessionPersistMode(): void {
  if (typeof document === "undefined") return
  document.cookie = serialize(SESSION_PERSIST_COOKIE, "", {
    ...persistCookieOptions(),
    maxAge: 0,
  })
}

function persistModeFromDocument(): PersistMode {
  return parsePersistMode(parse(document.cookie)[SESSION_PERSIST_COOKIE])
}

let browserClient: SupabaseClient | null = null

/** Cliente de navegador (singleton: una sola conexión y un solo listener de sesión). */
export function createClient(): SupabaseClient {
  if (browserClient) return browserClient
  browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return Object.entries(parse(document.cookie)).flatMap(([name, value]) =>
          typeof value === "string" ? [{ name, value }] : [],
        )
      },
      setAll(cookiesToSet) {
        const mode = persistModeFromDocument()
        for (const { name, value, options } of cookiesToSet) {
          document.cookie = serialize(name, value, applyPersistMode(mode, options ?? {}))
        }
      },
    },
  })
  return browserClient
}
