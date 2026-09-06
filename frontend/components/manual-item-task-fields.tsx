"use client"

import { CostInput } from "@/components/cost-input"
import {
  BookedOrNotChips,
  BookingStatusToggle,
  CancellableDropdown,
  DoneChip,
  ReservationNeededChips,
} from "@/components/task-state-controls"
import type { ManualTaskDraft } from "@/lib/manual-item-task"
import { transportReservePolicy } from "@/lib/transport-kind"
import type { ItemType, RouteMode, TransportRoute } from "@/types/itinerary"
import { cancellableControlVisible, categoryFromItemType } from "@/lib/trip-tasks"

export function ManualItemTaskFields({
  type,
  routeMode,
  route,
  currency,
  draft,
  onChange,
  costAriaLabel = "Coste",
}: {
  type: ItemType
  routeMode?: RouteMode | null
  route?: Pick<TransportRoute, "mode" | "carUse" | "leg"> | null
  currency: string
  draft: ManualTaskDraft
  onChange: (next: ManualTaskDraft) => void
  costAriaLabel?: string
}) {
  const category = categoryFromItemType(type)
  const probe = route ?? (routeMode != null ? { mode: routeMode } : null)
  const policy = type === "transport" ? transportReservePolicy(probe) : null
  const showDoneChip = policy?.formUsesDoneChip === true
  const showCancellable = cancellableControlVisible(category, probe, draft.status)
  const showReservation = type === "activity" || type === "food"

  if (showReservation) {
    return (
      <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
        <p className="text-xs font-medium text-foreground">Reserva (opcional)</p>
        <ReservationNeededChips
          value={draft.needsReservation}
          onChange={(needsReservation) =>
            onChange({
              ...draft,
              needsReservation,
              status:
                needsReservation === true
                  ? draft.status === "booked" || draft.status === "paid"
                    ? draft.status
                    : null
                  : null,
            })
          }
        />
        {draft.needsReservation === true ? (
          <BookedOrNotChips
            booked={draft.status === "booked" || draft.status === "paid"}
            onChange={(booked) =>
              onChange({
                ...draft,
                needsReservation: true,
                status: booked
                  ? draft.status === "paid"
                    ? "paid"
                    : "booked"
                  : null,
              })
            }
          />
        ) : null}
      </div>
    )
  }

  if (showDoneChip) {
    const done = draft.status === "booked" || draft.status === "paid"
    return (
      <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
        <p className="text-xs font-medium text-foreground">Coste estimado (opcional)</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <DoneChip
            active={done}
            onClick={() =>
              onChange({
                ...draft,
                status: done ? null : "paid",
                cancellable: null,
              })
            }
          />
          <CostInput
            value={draft.cost}
            currency={currency}
            commit="blur"
            onChange={(cost) => onChange({ ...draft, cost })}
            ariaLabel={costAriaLabel}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
      <p className="text-xs font-medium text-foreground">Reserva y coste (opcional)</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BookingStatusToggle
          value={draft.status}
          onChange={(status) =>
            onChange({
              ...draft,
              status,
              cancellable: status === "paid" ? draft.cancellable : null,
            })
          }
        />
        <CostInput
          value={draft.cost}
          currency={currency}
          commit="blur"
          onChange={(cost) => onChange({ ...draft, cost })}
          ariaLabel={costAriaLabel}
        />
        {showCancellable ? (
          <CancellableDropdown
            value={draft.cancellable}
            onChange={(cancellable) => onChange({ ...draft, cancellable })}
          />
        ) : null}
      </div>
    </div>
  )
}
