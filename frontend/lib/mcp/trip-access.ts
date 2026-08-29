import type { SupabaseClient } from "@supabase/supabase-js"
import { mcpReadFailed, mcpUnavailableTrip } from "./result"

export type TripLoadOk<T> = { ok: true; row: T }
export type TripLoadFail = { ok: false; reason: "not_found" | "error" }
export type TripLoad<T> = TripLoadOk<T> | TripLoadFail

export type SourceLoadOk<T> = { ok: true; rows: T[] }
export type SourceLoad<T> = SourceLoadOk<T> | { ok: false; reason: "error" }

export function asStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
}

/**
 * SELECT por id con el JWT del usuario. Sin `eq("user_id")`: la RLS decide
 * (dueño o editor). `data: null` es viaje inexistente o inaccesible — el
 * llamante no debe distinguirlos.
 */
export async function loadAccessibleTrip<T>(
  supabase: SupabaseClient,
  tripId: string,
  columns: string,
): Promise<TripLoad<T>> {
  const { data, error } = await supabase.from("trips").select(columns).eq("id", tripId).maybeSingle()
  if (error) return { ok: false, reason: "error" }
  if (!data) return { ok: false, reason: "not_found" }
  return { ok: true, row: data as T }
}

export async function loadSourcesByIds<T>(
  supabase: SupabaseClient,
  ids: string[],
  columns: string,
): Promise<SourceLoad<T>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return { ok: true, rows: [] }
  const { data, error } = await supabase.from("sources").select(columns).in("id", unique)
  if (error) return { ok: false, reason: "error" }
  return { ok: true, rows: (data ?? []) as T[] }
}

/** Enriquecimiento: si PostgREST falla, el llamante sigue con `[]`. */
export function sourceRowsOrEmpty<T>(loaded: SourceLoad<T>): T[] {
  return loaded.ok ? loaded.rows : []
}

export function tripLoadFailure(result: TripLoadFail) {
  return result.reason === "not_found" ? mcpUnavailableTrip() : mcpReadFailed()
}

/** Ordena filas según `source_ids` del viaje; ids sin fila (RLS) se omiten. */
export function orderBySourceIds<T extends { id: string }>(
  sourceIds: string[],
  rows: readonly T[],
): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out: T[] = []
  const seen = new Set<string>()
  for (const id of sourceIds) {
    const row = byId.get(id)
    if (!row || seen.has(id)) continue
    seen.add(id)
    out.push(row)
  }
  return out
}
