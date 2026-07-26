/**
 * Perfil de viajero y referencias favoritas (`profiles`, `favorite_references`).
 * El perfil alimenta el briefing del asistente; `domain` de las referencias se usa como
 * `include_domains` de Tavily para priorizar los blogs del usuario.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export type TravelerProfile = {
  id: string
  displayName: string | null
  travelerTypes: string[]
  travelerNotes: string | null
  signupReferrer: string | null
}

export type FavoriteReference = {
  id: string
  label: string
  url: string | null
  domain: string | null
}

/** Entrada de referencia antes de guardarse (sin id). */
export type FavoriteReferenceInput = {
  label: string
  url: string | null
}

type ProfileRow = {
  id: string
  display_name: string | null
  traveler_types: string[] | null
  traveler_notes: string | null
  signup_referrer: string | null
}

type FavoriteRow = {
  id: string
  label: string
  url: string | null
  domain: string | null
}

/** Host sin `www.`, en minúsculas; null si no es una URL utilizable. */
export function domainFromUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim()
  if (!value) return null
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    const host = new URL(withScheme).hostname.replace(/^www\./i, "").toLowerCase()
    return host || null
  } catch {
    return null
  }
}

function toProfile(row: ProfileRow): TravelerProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    travelerTypes: row.traveler_types ?? [],
    travelerNotes: row.traveler_notes,
    signupReferrer: row.signup_referrer,
  }
}

export async function loadProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<TravelerProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, traveler_types, traveler_notes, signup_referrer")
    .eq("id", userId)
    .maybeSingle<ProfileRow>()

  if (error) throw error
  return data ? toProfile(data) : null
}

export async function loadFavoriteReferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<FavoriteReference[]> {
  const { data, error } = await supabase
    .from("favorite_references")
    .select("id, label, url, domain")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  if (error) throw error
  return (data ?? []) as FavoriteRow[]
}

export async function saveProfile(
  supabase: SupabaseClient,
  userId: string,
  data: {
    displayName: string | null
    travelerTypes: string[]
    travelerNotes: string | null
    signupReferrer?: string | null
  },
): Promise<TravelerProfile> {
  const payload: Record<string, unknown> = {
    id: userId,
    display_name: data.displayName?.trim() || null,
    traveler_types: data.travelerTypes,
    traveler_notes: data.travelerNotes?.trim() || null,
  }
  if (data.signupReferrer !== undefined) {
    payload.signup_referrer = data.signupReferrer?.trim() || null
  }

  const { data: row, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select("id, display_name, traveler_types, traveler_notes, signup_referrer")
    .single<ProfileRow>()

  if (error) throw error
  return toProfile(row)
}

/** Sustituye la lista completa: es corta y así evitamos diffing por fila. */
export async function replaceFavoriteReferences(
  supabase: SupabaseClient,
  userId: string,
  refs: FavoriteReferenceInput[],
): Promise<FavoriteReference[]> {
  const clean = refs
    .map((r) => ({ label: r.label.trim(), url: r.url?.trim() || null }))
    .filter((r) => r.label || r.url)

  const { error: deleteError } = await supabase
    .from("favorite_references")
    .delete()
    .eq("user_id", userId)
  if (deleteError) throw deleteError

  if (clean.length === 0) return []

  const { data, error } = await supabase
    .from("favorite_references")
    .insert(
      clean.map((r) => ({
        user_id: userId,
        label: r.label || (domainFromUrl(r.url) ?? "Referencia"),
        url: r.url,
        domain: domainFromUrl(r.url),
      })),
    )
    .select("id, label, url, domain")

  if (error) throw error
  return (data ?? []) as FavoriteRow[]
}
