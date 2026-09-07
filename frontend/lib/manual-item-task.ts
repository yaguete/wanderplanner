/**
 * Borrador de tarea en el alta/edición de un ítem. El importe es local hasta
 * guardar: no se escribe `trip.tasks` por tecla (el ítem aún no existe y
 * `withPrunedTasks` lo borraría). Una sola escritura al submit, después del ítem,
 * con `taskKeyForItem` del ítem nuevo.
 *
 * Trampas:
 * - `notNeeded` («sin reserva») y el coste son independientes: un restaurante
 *   o una actividad sin reserva pueden llevar importe y cuentan en presupuesto.
 *   Reservado/Pagado sí gana — ahí ya hay reserva.
 * - Ida/vuelta en avión espejadas: `foldMirroredFlightReturnCost` borra la
 *   clave entera `leg:return` (no solo el coste). El diálogo de vuelta no
 *   pinta el bloque de tarea ni escribe `taskPatch`; estado y cancelabilidad
 *   se evaporarían igual.
 */
import type { RouteLeg, TripTaskState, TripTaskStatus } from "@/types/itinerary"

export type ManualTaskDraft = {
  cost: number | null
  /** `null` = sin tocar (no es `pending`). */
  status: "booked" | "paid" | null
  cancellable: boolean | null
  /** Solo activity/food. `null` = sin tocar. */
  needsReservation: boolean | null
}

export function emptyManualTaskDraft(): ManualTaskDraft {
  return {
    cost: null,
    status: null,
    cancellable: null,
    needsReservation: null,
  }
}

export function draftFromTaskState(
  state: {
    cost: number | null
    status: string
    cancellable: boolean | null
  } | null,
): ManualTaskDraft {
  if (!state) return emptyManualTaskDraft()
  const status =
    state.status === "booked" || state.status === "paid" ? state.status : null
  return {
    cost: state.cost,
    status,
    cancellable: state.cancellable,
    needsReservation:
      state.status === "notNeeded"
        ? false
        : state.status === "pending" || status !== null
          ? true
          : null,
  }
}

/** Ocultar el bloque entero de tarea (no solo el coste) en la vuelta espejada. */
export function omitReturnLegTask(params: {
  mirrored: boolean
  leg?: RouteLeg | null
}): boolean {
  return params.mirrored && params.leg === "return"
}

/**
 * Estado persistible del borrador. Reservado/Pagado gana. «Sin reserva» se
 * conserva aunque haya importe (el presupuesto lo cuenta igual).
 */
export function resolveManualDraftStatus(
  draft: ManualTaskDraft,
): TripTaskStatus | undefined {
  if (draft.status === "booked" || draft.status === "paid") return draft.status
  if (draft.needsReservation === false) return "notNeeded"
  if (draft.cost != null) return "pending"
  if (draft.needsReservation === true) return "pending"
  if (draft.cancellable != null) return "pending"
  return undefined
}

export type TaskPatchFromDraftOpts = {
  /** En edición: escribe `cost: null` / `cancellable: null` si el borrador los vació. */
  includeCleared?: boolean
}

/** `null` si no hay nada que persistir (alta sin tocar el bloque). */
export function taskPatchFromManualDraft(
  draft: ManualTaskDraft,
  opts?: TaskPatchFromDraftOpts,
): Partial<TripTaskState> | null {
  const status = resolveManualDraftStatus(draft)
  const patch: Partial<TripTaskState> = {}
  if (status) patch.status = status
  else if (opts?.includeCleared) patch.status = "pending"
  if (draft.cost != null) patch.cost = draft.cost
  else if (opts?.includeCleared) patch.cost = null
  if (status === "paid" && draft.cancellable != null) patch.cancellable = draft.cancellable
  else if (opts?.includeCleared) patch.cancellable = null

  if (Object.keys(patch).length === 0) return null
  return patch
}
