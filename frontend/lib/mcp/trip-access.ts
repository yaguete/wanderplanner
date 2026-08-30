import type { SupabaseClient } from "@supabase/supabase-js"
import { mcpNoSession, mcpReadFailed, mcpTextError, mcpUnavailableTrip } from "./result"

export type ReadFailReason = "error" | "unauthorized"
export type TripLoadOk<T> = { ok: true; row: T }
export type TripLoadFail = { ok: false; reason: "not_found" | ReadFailReason }
export type TripLoad<T> = TripLoadOk<T> | TripLoadFail

export type SourceLoadOk<T> = { ok: true; rows: T[] }
export type SourceLoadFail = { ok: false; reason: ReadFailReason }
export type SourceLoad<T> = SourceLoadOk<T> | SourceLoadFail

/** PostgREST pone el HTTP en la respuesta, no dentro de `error`. 401 = token muerto; no reintentar. */
export function isUnauthorizedStatus(status: number | undefined): boolean {
  return status === 401
}

function readFailReason(status: number | undefined): ReadFailReason {
  return isUnauthorizedStatus(status) ? "unauthorized" : "error"
}

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
  const { data, error, status } = await supabase
    .from("trips")
    .select(columns)
    .eq("id", tripId)
    .maybeSingle()
  if (error) return { ok: false, reason: readFailReason(status) }
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
  const { data, error, status } = await supabase.from("sources").select(columns).in("id", unique)
  if (error) return { ok: false, reason: readFailReason(status) }
  return { ok: true, rows: (data ?? []) as T[] }
}

/** Enriquecimiento: si PostgREST falla, el llamante sigue con `[]`. */
export function sourceRowsOrEmpty<T>(loaded: SourceLoad<T>): T[] {
  return loaded.ok ? loaded.rows : []
}

export function readLoadFailure(result: { reason: ReadFailReason }) {
  return result.reason === "unauthorized" ? mcpNoSession() : mcpReadFailed()
}

export function tripLoadFailure(result: TripLoadFail) {
  if (result.reason === "not_found") return mcpUnavailableTrip()
  if (result.reason === "unauthorized") return mcpNoSession()
  return mcpReadFailed()
}

export const MCP_LIST_TRIPS_READ_FAILED = "No se pudieron leer los viajes. Inténtalo de nuevo."

export function listTripsLoadFailure(status: number | undefined) {
  return isUnauthorizedStatus(status)
    ? mcpNoSession()
    : mcpTextError(MCP_LIST_TRIPS_READ_FAILED)
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
