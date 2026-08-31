"use client"

import { CostInput } from "@/components/cost-input"
import {
  BookingStatusToggle,
  CancellableChips,
  ReservationNeededChips,
} from "@/components/task-state-controls"
import type { ManualTaskDraft } from "@/lib/manual-item-task"
import type { ItemType, RouteMode } from "@/types/itinerary"
import { cancellableApplies, categoryFromItemType } from "@/lib/trip-tasks"

export function ManualItemTaskFields({
  type,
  routeMode,
  currency,
  draft,
  onChange,
  costAriaLabel = "Coste",
}: {
  type: ItemType
  routeMode?: RouteMode | null
  currency: string
  draft: ManualTaskDraft
  onChange: (next: ManualTaskDraft) => void
  costAriaLabel?: string
}) {
  const category = categoryFromItemType(type)
  const showCancellable = cancellableApplies(category, routeMode)
  const showReservation = type === "activity" || type === "food"

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
      <p className="text-xs font-medium text-foreground">Reserva y coste (opcional)</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BookingStatusToggle
          value={draft.status}
          onChange={(status) => onChange({ ...draft, status })}
        />
        <CostInput
          value={draft.cost}
          currency={currency}
          commit="blur"
          onChange={(cost) => onChange({ ...draft, cost })}
          ariaLabel={costAriaLabel}
        />
      </div>
      {showCancellable ? (
        <CancellableChips
          value={draft.cancellable}
          onChange={(cancellable) => onChange({ ...draft, cancellable })}
        />
      ) : null}
      {showReservation ? (
        <ReservationNeededChips
          value={draft.needsReservation}
          onChange={(needsReservation) => onChange({ ...draft, needsReservation })}
        />
      ) : null}
    </div>
  )
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
  return {
    cost: state.cost,
    status: state.status === "booked" || state.status === "paid" ? state.status : null,
    cancellable: state.cancellable,
    needsReservation: state.status === "notNeeded" ? false : null,
  }
}
