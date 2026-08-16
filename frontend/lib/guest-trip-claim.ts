/**
 * Claim de viajes de invitado → cuenta existente.
 *
 * El cliente no puede reasignar `user_id` (RLS). El flujo es:
 *   1. Aún anónimo: `prepare_guest_trip_claim()` → token en localStorage.
 *   2. Tras `signIn`: `claim_guest_trips(token)` en la hidratación de viajes.
 *
 * El token es de un solo uso, caduca en 30 min y solo lo canjea una sesión
 * no anónima. Quien pueda leer este localStorage ya tiene la sesión del
 * invitado; el token no amplía nada.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export const GUEST_CLAIM_STORAGE_KEY = "wp-guest-trip-claim"
/** Alineado con el TTL del RPC (`now() + interval '30 minutes'`). */
export const GUEST_CLAIM_TTL_MS = 30 * 60 * 1000

export type GuestClaimStash = { token: string; guestUserId: string; at: number }

export type PrepareClaimResult =
  | { ok: true }
  | { ok: false; error: string; missingRpc: boolean }

type ClaimRpcStatus =
  | "claimed"
  | "invalid"
  | "guest_upgraded"
  | "noop"
  | "caller_anonymous"

type ClaimRpcRow = {
  status?: unknown
  trip_ids?: unknown
}

const PREPARE_ERROR = "No hemos podido llevar tu viaje a esta cuenta. Inténtalo de nuevo."
const MISSING_RPC_ERROR =
  "No hemos podido llevar tu viaje a esta cuenta. Inténtalo de nuevo en unos minutos."

export function parseStash(raw: string | null): GuestClaimStash | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== "object") return null
    const rec = data as Record<string, unknown>
    if (typeof rec.token !== "string" || rec.token.trim().length === 0) return null
    if (typeof rec.guestUserId !== "string" || rec.guestUserId.trim().length === 0) {
      return null
    }
    if (typeof rec.at !== "number" || !Number.isFinite(rec.at)) return null
    return { token: rec.token, guestUserId: rec.guestUserId, at: rec.at }
  } catch {
    return null
  }
}

export function isStashUsable(
  stash: GuestClaimStash,
  nowMs: number,
  currentUserId: string,
): boolean {
  if (stash.guestUserId === currentUserId) return false
  if (nowMs - stash.at > GUEST_CLAIM_TTL_MS) return false
  if (stash.at > nowMs + 60_000) return false
  return true
}

export function readStash(): GuestClaimStash | null {
  if (typeof window === "undefined") return null
  try {
    return parseStash(window.localStorage.getItem(GUEST_CLAIM_STORAGE_KEY))
  } catch {
    return null
  }
}

export function stashClaim(stash: GuestClaimStash): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(GUEST_CLAIM_STORAGE_KEY, JSON.stringify(stash))
  } catch {
    // Safari privado / cuota: el login sigue, pero el viaje no viaja.
  }
}

export function clearStash(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(GUEST_CLAIM_STORAGE_KEY)
  } catch {
    // ignore
  }
}

function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === "PGRST202") return true
  return /could not find the function/i.test(error.message ?? "")
}

export async function prepareGuestTripClaim(
  supabase: SupabaseClient,
  guestUserId: string,
): Promise<PrepareClaimResult> {
  const { data, error } = await supabase.rpc("prepare_guest_trip_claim")
  if (error) {
    return {
      ok: false,
      error: isMissingRpc(error) ? MISSING_RPC_ERROR : PREPARE_ERROR,
      missingRpc: isMissingRpc(error),
    }
  }
  const token = typeof data === "string" ? data.trim() : ""
  if (!token) {
    return { ok: false, error: PREPARE_ERROR, missingRpc: false }
  }
  stashClaim({ token, guestUserId, at: Date.now() })
  return { ok: true }
}

function parseClaimRow(data: unknown): { status: ClaimRpcStatus; tripIds: string[] } | null {
  let payload: unknown = data
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload)
    } catch {
      return null
    }
  }
  if (!payload || typeof payload !== "object") return null
  const row = payload as ClaimRpcRow
  const status = row.status
  if (
    status !== "claimed" &&
    status !== "invalid" &&
    status !== "guest_upgraded" &&
    status !== "noop" &&
    status !== "caller_anonymous"
  ) {
    return null
  }
  const rawIds = row.trip_ids
  const tripIds = Array.isArray(rawIds)
    ? rawIds.filter((id): id is string => typeof id === "string")
    : []
  return { status, tripIds }
}

/**
 * Canjea el token si hay stash usable. Devuelve los ids reclamados, o `null`
 * si no había nada que canjear (sin stash, caducado, mismo usuario, o estado
 * terminal que no movió filas).
 */
export async function redeemGuestTripClaim(
  supabase: SupabaseClient,
  currentUserId: string,
): Promise<string[] | null> {
  const stash = readStash()
  if (!stash || !isStashUsable(stash, Date.now(), currentUserId)) {
    if (stash) clearStash()
    return null
  }

  const { data, error } = await supabase.rpc("claim_guest_trips", { token: stash.token })
  // Cualquier respuesta (éxito, invalid, red) deja el stash inservible salvo
  // error de red: en ese caso conservamos el token para reintentar al recargar.
  if (error) {
    if (isMissingRpc(error)) clearStash()
    return null
  }

  const parsed = parseClaimRow(data)
  clearStash()
  if (!parsed) return null
  if (parsed.status === "claimed") return parsed.tripIds
  return null
}
