/**
 * Helpers del CTA de blogs partners (`/start?source=&ref=&days=`).
 * Compartidos entre `app/start/page.tsx` (borrador) y `trip-context` (adopción al añadir fuente).
 */
import type { Trip } from "@/types/itinerary"
import { dayHasNonLegContent } from "@/lib/route-legs"

export const MAX_AUTO_DAYS = 60

/** `ref` de los chips de la landing. Reservado: no es un slug de partner. */
export const LANDING_REF = "wp-landing"

/** Slugs que `/partners` no debe emitir: contaminarían atribución o el namespace interno. */
export const RESERVED_REF_SLUGS = new Set(["landing", "wp-landing", "start", "admin"])

export function isReservedRefSlug(slug: string): boolean {
  return RESERVED_REF_SLUGS.has(slug.trim().toLowerCase())
}

/**
 * Borrador reutilizable: sin fuentes, sin fechas, un solo día vacío.
 * Reusar evita viajes huérfanos y rodear al RegistrationGate desde el hero.
 */
export function isReusableDraftTrip(trip: Pick<Trip, "archived" | "sourceIds" | "startDate" | "days">): boolean {
  if (trip.archived) return false
  if (trip.sourceIds.length > 0) return false
  if (trip.startDate) return false
  if (trip.days.length > 1) return false
  return trip.days.every((d) => !dayHasNonLegContent(d))
}

/**
 * Un partner real pisa el referrer; `wp-landing` no pisa uno de partner.
 */
export function mergeDraftReferrer(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const next = incoming?.trim() || null
  const prev = existing?.trim() || null
  if (next && !isReservedRefSlug(next)) return next
  return prev ?? next
}

function pendingSourceKey(tripId: string): string {
  return `wp-pending-source:${tripId}`
}

/** Por si el middleware se come `?source=` al redirigir a /login. */
export function stashPendingSource(tripId: string, url: string): void {
  if (typeof window === "undefined") return
  const trimmed = url.trim()
  if (!tripId || !trimmed) return
  try {
    sessionStorage.setItem(pendingSourceKey(tripId), trimmed)
  } catch {
    /* private mode */
  }
}

export function takePendingSource(tripId: string): string | null {
  if (typeof window === "undefined") return null
  try {
    const key = pendingSourceKey(tripId)
    const value = sessionStorage.getItem(key)?.trim() || null
    if (value) sessionStorage.removeItem(key)
    return value
  } catch {
    return null
  }
}

/**
 * Nombre del borrador que crea `/start`; `trip-context` lo usa para saber si el usuario ya renombró.
 * Hace `.trim()` internamente: el intento automático de `/trips/[tripId]` pasa la URL de la query
 * tal cual (sin trim), mientras que un reintento manual desde `AddSourceDialog` sí la trimea: si no
 * se normaliza aquí, una URL con espacios sobrantes rompería la comparación de igualdad de nombres.
 */
export function draftTripNameFor(sourceUrl: string): string {
  const raw = sourceUrl.trim()
  if (!raw) return "Mi viaje"
  try {
    const host = new URL(raw).hostname.replace(/^www\./i, "")
    if (!host) return "Mi viaje"
    if (
      host === "instagram.com" ||
      host.endsWith(".instagram.com") ||
      host === "instagr.am"
    ) {
      return "Viaje nuevo"
    }
    return `Viaje desde ${host}`
  } catch {
    return "Mi viaje"
  }
}

/**
 * `&ref=` del CTA. Solo el primer token `[a-z0-9-]+`.
 *
 * Si un editor se come la comilla del `href`, el valor llega como
 * `lacosmopolilla target=` o `lacosmopolilla rel=`; no lo persistimos tal cual.
 */
export function parseRefParam(raw: string | null): string | null {
  if (raw == null) return null
  const first = raw.trim().split(/[\s"'<>]/)[0] ?? ""
  const slug = first
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return slug || null
}

/**
 * `&days=N` del CTA: entero 1..MAX_AUTO_DAYS; cualquier otra cosa se descarta en silencio.
 */
export function parseDaysParam(raw: string | null): number | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n < 1 || n > MAX_AUTO_DAYS) return null
  return n
}
