"use client"

/**
 * Diálogo de traslado interno o alquiler (sin leg).
 * El cuerpo progresivo vive en InternalTransportForm.
 */
import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { InternalTransportForm } from "@/components/internal-transport-form"
import { isCarRentalItem } from "@/lib/transport-kind"
import type { UpsertTransportRoutePayload } from "@/lib/transport-routes"
import type { TripTaskState, UserDay, UserDayItem } from "@/types/itinerary"

export type TransportRouteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  days: UserDay[]
  startDate?: string | null
  numTravelers?: number | null
  currency?: string
  existingTask?: TripTaskState | null
  initialDayId?: string | null
  existingItem?: UserDayItem | null
  onSubmit: (
    data: UpsertTransportRoutePayload,
  ) => { ok: true } | { ok: false; error?: string } | void
}

export function TransportRouteDialog({
  open,
  onOpenChange,
  days,
  startDate = null,
  numTravelers = null,
  currency = "EUR",
  existingTask = null,
  initialDayId = null,
  existingItem = null,
  onSubmit,
}: TransportRouteDialogProps) {
  const formId = useId()
  const [canSubmit, setCanSubmit] = useState(false)

  const editing = Boolean(existingItem)
  const rental = Boolean(existingItem && isCarRentalItem(existingItem))
  const title = editing
    ? rental
      ? "Editar alquiler de coche"
      : "Editar traslado"
    : "Añadir transporte o traslado"
  const description = editing
    ? rental
      ? "Cambia la ciudad, los días de recogida y devolución o la compañía."
      : "Cambia origen, destino o medio de transporte."
    : "Elige cómo, cuándo y desde dónde viajas."

  const handleSubmit = (data: UpsertTransportRoutePayload) => {
    const result = onSubmit(data)
    if (result && result.ok === false) return result
    onOpenChange(false)
    return result ?? { ok: true as const }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullscreenOnMobile hideClose className="sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1.5 px-6 py-4 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 pb-10">
          <InternalTransportForm
            formId={formId}
            days={days}
            startDate={startDate}
            initialDayId={initialDayId}
            existingItem={existingItem}
            existingTask={existingTask}
            currency={currency}
            numTravelers={numTravelers}
            allowRental
            onValidityChange={setCanSubmit}
            onSubmit={handleSubmit}
          />
        </div>

        <DialogFooter className="shrink-0 bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={!canSubmit}>
            {editing ? "Guardar" : "Añadir al plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
