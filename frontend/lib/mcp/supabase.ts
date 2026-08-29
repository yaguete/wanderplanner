import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { supabaseAnonKey, supabaseUrl } from "./config"

/** Cliente PostgREST con el access token del usuario. Sin persistencia, sin service_role. */
export function createUserSupabase(accessToken: string): SupabaseClient {
  const url = supabaseUrl()
  const anon = supabaseAnonKey()
  if (!url || !anon) {
    throw new Error("Supabase no está configurado")
  }
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
