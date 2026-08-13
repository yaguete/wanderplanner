"use client"

/**
 * Wrapper de ida/vuelta sobre TransportRouteForm (T4B.3 §9.2).
 * Aporta suggestLegEndpoints, originPatch y copy de casa.
 * Al crear una ida sin retorno: atajo «Solo ida / Ida y vuelta» (no se persiste).
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
import {
  emptyEndpoint,
  TransportRouteForm,
  type TransportRouteFormValue,
} from "@/components/transport-route-form"
import { cn } from "@/lib/utils"
import { hasRouteLeg, suggestLegEndpoints, tripOriginFromCityAnchor } from "@/lib/route-legs"
import type {
  RouteLeg,
  TransportRoute,
  Trip,
  TripOrigin,
  UserDayItem,
} from "@/types/itinerary"

export type RouteLegDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  leg: RouteLeg
  trip: Pick<Trip, "id" | "origin" | "countries" | "name" | "days">
  existingItem?: UserDayItem | null
  onSubmit: (data: {
    leg: RouteLeg
    route: Omit<TransportRoute, "leg"> & { from: TransportRoute["from"]; to: TransportRoute["to"] }
    detail: string | null
    vendor: string | null
    origin: TripOrigin | null
    /** Al crear ida: también crea el retorno espejado. No se persiste. */
    createMirrorReturn?: boolean
  }) => void
}

export function RouteLegDialog({
  open,
  onOpenChange,
  leg,
  trip,
  existingItem = null,
  onSubmit,
}: RouteLegDialogProps) {
  const formId = useId()
  const [canSubmit, setCanSubmit] = useState(false)
  const [tripKind, setTripKind] = useState<"oneway" | "roundtrip">("roundtrip")

  const initial = useMemo(() => {
    if (existingItem?.route) {
      const r = existingItem.route
      return {
        from: emptyEndpoint({ place: r.from, pendingText: null }),
        to: emptyEndpoint({ place: r.to, pendingText: null }),
        mode: (r.mode ?? "undecided") as import("@/types/itinerary").RouteMode | "undecided",
        vendor: existingItem.vendor ?? "",
        detail: existingItem.detail ?? "",
      }
    }
    const suggestion = suggestLegEndpoints(trip, leg)
    return {
      from: emptyEndpoint({ place: suggestion.from, pendingText: null }),
      to: emptyEndpoint({ place: suggestion.to, pendingText: null }),
      mode: "undecided" as const,
      vendor: "",
      detail: "",
    }
    // Solo al montar (el padre desmonta al cerrar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isOutbound = leg === "outbound"
  const title = isOutbound ? "Viaje de ida" : "Viaje de vuelta"
  const editing = Boolean(existingItem?.route?.leg)
  const canOfferRoundtrip =
    isOutbound && !editing && !hasRouteLeg(trip.days, "return")

  const handleFormSubmit = (value: TransportRouteFormValue) => {
    // trip.origin = ancla de casa: ciudad elegida ANTES del hub, nunca el aeropuerto.
    // También desde vuelta (to = casa) si aún no hay origen (§8.6).
    const cityAnchor = isOutbound ? value.cityFrom : value.cityTo
    const originPatch: TripOrigin | null =
      trip.origin == null ? tripOriginFromCityAnchor(cityAnchor) : null

    onSubmit({
      leg,
      route: {
        from: value.from,
        to: value.to,
        mode: value.mode,
      },
      detail: value.detail,
      vendor: value.vendor,
      origin: originPatch,
      createMirrorReturn: canOfferRoundtrip && tripKind === "roundtrip",
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullscreenOnMobile hideClose className="sm:max-w-lg">
        <DialogHeader className="shrink-0 space-y-1.5 border-b border-border px-6 py-4 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {editing ? `Editar ${title.toLowerCase()}` : title}
          </DialogTitle>
          <DialogDescription>
            Elige el medio si ya lo sabes — o déjalo en «Aún no lo sé». Luego de
            dónde a dónde.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {canOfferRoundtrip ? (
            <div
              className="mb-4 flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label="Solo ida o ida y vuelta"
            >
              {(
                [
                  { value: "oneway", label: "Solo ida" },
                  { value: "roundtrip", label: "Ida y vuelta" },
                ] as const
              ).map((opt) => {
                const selected = tripKind === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTripKind(opt.value)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      selected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          ) : null}
          <TransportRouteForm
            formId={formId}
            initial={initial}
            fromLabel={isOutbound ? "Origen" : "Salida"}
            toLabel={isOutbound ? "Destino" : "Llegada"}
            toPlaceholder={
              isOutbound ? "Indica tu ciudad de destino" : "¿A qué ciudad llegas?"
            }
            onValidityChange={setCanSubmit}
            onSubmit={handleFormSubmit}
          />
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
