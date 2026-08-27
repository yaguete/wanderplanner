"use client"

/**
 * Diálogo de traslado interno (sin leg). Reutiliza TransportRouteForm.
 * Día editable; sin originPatch ni reanclaje.
 */
import { useId, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  emptyEndpoint,
  TransportRouteForm,
  type TransportRouteFormValue,
} from "@/components/transport-route-form"
import { formatDayPickerLabel } from "@/lib/day-heading"
import { dateISOForDayIndex, formatDayDateShort } from "@/lib/trip-dates"
import { seedTransportForm } from "@/lib/transport-routes"
import type { TransportRoute, UserDay, UserDayItem } from "@/types/itinerary"

export type TransportRouteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  days: UserDay[]
  /** Fecha de inicio del viaje; sin ella el selector no muestra el paréntesis. */
  startDate?: string | null
  /** Día preseleccionado (creación) o día actual del ítem (edición). */
  initialDayId?: string | null
  existingItem?: UserDayItem | null
  onSubmit: (data: {
    dayId: string
    itemId?: string
    route: Omit<TransportRoute, "leg"> & { from: TransportRoute["from"]; to: TransportRoute["to"] }
    detail: string | null
    vendor: string | null
  }) => void
}

export function TransportRouteDialog({
  open,
  onOpenChange,
  days,
  startDate = null,
  initialDayId = null,
  existingItem = null,
  onSubmit,
}: TransportRouteDialogProps) {
  const formId = useId()
  const dayFieldId = useId()
  const [canSubmit, setCanSubmit] = useState(false)

  const seed = useMemo(() => seedTransportForm(existingItem), [])
  const initial = useMemo(
    () => ({
      from: emptyEndpoint({ place: seed.from, pendingText: seed.pendingFromText }),
      to: emptyEndpoint({ place: seed.to, pendingText: seed.pendingToText }),
      mode: seed.mode,
      vendor: seed.vendor,
      detail: seed.detail,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const preferredDay =
    (initialDayId && days.some((d) => d.id === initialDayId) && initialDayId) ||
    days[0]?.id ||
    ""
  const [dayId, setDayId] = useState(preferredDay)

  const editing = Boolean(existingItem)
  const title = editing ? "Editar traslado" : "Añadir traslado"

  const handleFormSubmit = (value: TransportRouteFormValue) => {
    if (!dayId) return
    onSubmit({
      dayId,
      itemId: existingItem?.id,
      route: {
        from: value.from,
        to: value.to,
        mode: value.mode,
      },
      detail: value.detail,
      vendor: value.vendor,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullscreenOnMobile hideClose className="sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1.5 px-6 py-4 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
          <DialogDescription>
            Define origen, destino y medio de transporte si lo sabes.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 pb-10">
          <div className="space-y-2">
            <Label htmlFor={dayFieldId}>Día del traslado</Label>
            <Select value={dayId} onValueChange={setDayId}>
              <SelectTrigger id={dayFieldId}>
                <SelectValue placeholder="Elige un día" />
              </SelectTrigger>
              <SelectContent>
                {days.map((d, i) => (
                  <SelectItem key={d.id} value={d.id}>
                    {formatDayPickerLabel(
                      i,
                      formatDayDateShort(dateISOForDayIndex(startDate, i)),
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TransportRouteForm
            formId={formId}
            initial={initial}
            fromLabel="Origen"
            toLabel="Destino"
            onValidityChange={setCanSubmit}
            onSubmit={handleFormSubmit}
          />
        </div>

        <DialogFooter className="shrink-0 bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={!canSubmit || !dayId}>
            {editing ? "Guardar" : "Añadir al plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
