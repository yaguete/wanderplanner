/**
 * Cabecera `Authorization` para las llamadas al backend FastAPI, que verifica el JWT de
 * Supabase (`backend/auth.py`). Sin sesión devuelve un objeto vacío: en local el backend
 * puede correr con `REQUIRE_AUTH=false`.
 */
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"

export async function authHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) return {}
  try {
    const { data } = await createClient().auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}
