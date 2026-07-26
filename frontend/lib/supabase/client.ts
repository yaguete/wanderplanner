"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

let browserClient: SupabaseClient | null = null

/** Cliente de navegador (singleton: una sola conexión y un solo listener de sesión). */
export function createClient(): SupabaseClient {
  if (browserClient) return browserClient
  browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return browserClient
}
