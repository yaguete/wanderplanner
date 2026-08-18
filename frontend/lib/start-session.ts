/**
 * Decisión pura de `/start`: qué hacer con el viaje del CTA según identidad y
 * los viajes que ya tiene esa persona. Sin I/O; la página y `trips-repo` ejecutan.
 */
import type { Trip } from "@/types/itinerary"
import { isReusableDraftTrip } from "@/lib/partner-trip"
import { dayHasNonLegContent } from "@/lib/route-legs"

export type StartCandidateTrip = {
  id: string
  name: string
  archived: boolean
  /** null en viajes creados a mano; solo `/start` lo escribe. */
  referrer: string | null
  /** `sourceMatchKey` del artículo que originó el viaje (columna `seed_source_key`). */
  seedSourceKey: string | null
  /** ¿La persona ha invertido algo aquí? (ver `tripHasUserWork`) */
  hasUserWork: boolean
  /** `isReusableDraftTrip` ya calculado sobre el viaje completo. */
  isReusableDraft: boolean
}

export type StartDecision =
  | { kind: "open"; tripId: string }
  | { kind: "reuse"; tripId: string }
  | { kind: "create" }
  | { kind: "replace"; createAndDeleteTripIds: string[] }
  | { kind: "confirm-replace"; keepTripId: string }

export type StartCandidateInput = Pick<
  Trip,
  | "id"
  | "name"
  | "archived"
  | "referrer"
  | "sourceIds"
  | "startDate"
  | "days"
  | "basics"
  | "extraTasks"
  | "tasks"
  | "expectations"
  | "numTravelers"
> & { seedSourceKey?: string | null }

/**
 * Trabajo real de la persona, no lo que hizo el CTA (adoptar días/fechas de la guía).
 * Misma familia que `isReusableDraftTrip` / `canAdoptGuideSchedule`.
 */
export function tripHasUserWork(
  trip: Pick<
    Trip,
    "days" | "basics" | "extraTasks" | "tasks" | "expectations" | "numTravelers"
  >,
): boolean {
  if (trip.days.some(dayHasNonLegContent)) return true
  if (trip.basics.length > 0) return true
  if (trip.extraTasks.length > 0) return true
  if (Object.keys(trip.tasks).length > 0) return true
  if (trip.expectations?.trim()) return true
  if (trip.numTravelers != null) return true
  return false
}

export function toStartCandidate(trip: StartCandidateInput): StartCandidateTrip {
  const archived = Boolean(trip.archived)
  return {
    id: trip.id,
    name: trip.name,
    archived,
    referrer: trip.referrer ?? null,
    seedSourceKey: trip.seedSourceKey ?? null,
    hasUserWork: tripHasUserWork(trip),
    isReusableDraft: isReusableDraftTrip({
      archived,
      sourceIds: trip.sourceIds,
      startDate: trip.startDate,
      days: trip.days,
    }),
  }
}

export function decideStart(input: {
  isGuest: boolean
  /** `sourceMatchKey(sourceUrl)`; null si `/start` llegó sin `?source=` válido. */
  sourceKey: string | null
  /** Más reciente primero (como el `order created_at desc` de la consulta). */
  trips: StartCandidateTrip[]
}): StartDecision {
  const active = input.trips.filter((t) => !t.archived)

  if (input.sourceKey) {
    const match = active.find((t) => t.seedSourceKey === input.sourceKey)
    if (match) return { kind: "open", tripId: match.id }
  }

  if (input.isGuest) {
    if (active.length === 0) return { kind: "create" }
    // Sin artículo usable no es un «Nuevo viaje» por la puerta de atrás.
    if (!input.sourceKey) return { kind: "open", tripId: active[0].id }
    const withWork = active.find((t) => t.hasUserWork)
    if (withWork) return { kind: "confirm-replace", keepTripId: withWork.id }
    return { kind: "replace", createAndDeleteTripIds: active.map((t) => t.id) }
  }

  const reusable = active.find((t) => t.isReusableDraft && t.referrer != null)
  if (reusable) return { kind: "reuse", tripId: reusable.id }
  return { kind: "create" }
}

/** Error de Auth que sí autoriza tirar una cookie anónima muerta. Una cuenta no entra aquí. */
export function isDefinitivelyDeadAnonymousSession(
  error: { status?: number; code?: string } | null,
  user: { id?: string } | null,
): boolean {
  if (user?.id) return false
  if (!error) return true
  if (error.status === 401 || error.status === 403) return true
  if (error.code === "user_not_found") return true
  return false
}
