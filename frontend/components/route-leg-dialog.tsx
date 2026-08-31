"use client"

/**
 * Wrapper de ida/vuelta sobre TransportRouteForm (T4B.3 §9.2).
 * Aporta suggestLegEndpoints, originPatch y copy de casa.
 * Al crear una ida sin retorno: atajo «Solo ida / Ida y vuelta» (no se persiste).
 */
import { useId, useMemo, useRef, useState } from "react"
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
import { ManualFlightSearch } from "@/components/manual-flight-search"
import {
  draftFromTaskState,
  ManualItemTaskFields,
} from "@/components/manual-item-task-fields"
import { cn } from "@/lib/utils"
import { isMirroredFlightRoundtrip } from "@/lib/flight-search"
import { isSyntheticSourceId } from "@/lib/item-provenance"
import {
  omitReturnLegTask,
  taskPatchFromManualDraft,
  type ManualTaskDraft,
} from "@/lib/manual-item-task"
import { hasRouteLeg, suggestLegEndpoints, tripOriginFromCityAnchor } from "@/lib/route-legs"
import type {
  RouteLeg,
  RouteMode,
  TransportRoute,
  Trip,
  TripOrigin,
  TripTaskState,
  UserDayItem,
} from "@/types/itinerary"

export type RouteLegDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  leg: RouteLeg
  trip: Pick<
    Trip,
    "id" | "origin" | "countries" | "name" | "days" | "startDate" | "numDays" | "numTravelers" | "currency"
  >
  existingItem?: UserDayItem | null
  existingTask?: TripTaskState | null
  onSubmit: (data: {
    leg: RouteLeg
    route: Omit<TransportRoute, "leg"> & { from: TransportRoute["from"]; to: TransportRoute["to"] }
    detail: string | null
    vendor: string | null
    origin: TripOrigin | null
    /** Al crear ida: también crea el retorno espejado. No se persiste. */
    createMirrorReturn?: boolean
    taskPatch?: Partial<TripTaskState> | null
  }) => void
}

export function RouteLegDialog({
  open,
  onOpenChange,
  leg,
  trip,
  existingItem = null,
  existingTask = null,
  onSubmit,
}: RouteLegDialogProps) {
  const formId = useId()
  const [canSubmit, setCanSubmit] = useState(false)
  const [tripKind, setTripKind] = useState<"oneway" | "roundtrip">("roundtrip")
  const [taskDraft, setTaskDraft] = useState<ManualTaskDraft>(() =>
    draftFromTaskState(existingTask),
  )
  const costRef = useRef<number | null>(taskDraft.cost)
  const [liveMode, setLiveMode] = useState<RouteMode | null>(
    existingItem?.route?.mode ?? null,
  )

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
  const showDiscovery = !existingItem || isSyntheticSourceId(existingItem.sourceId)
  const mirroredFlights = isMirroredFlightRoundtrip(trip.days)
  const hideReturnTask = omitReturnLegTask({ mirrored: mirroredFlights, leg })
  const roundtripFlightLabel =
    liveMode === "flight" &&
    (mirroredFlights || (canOfferRoundtrip && tripKind === "roundtrip"))
  const flightLeg: RouteLeg | undefined =
    canOfferRoundtrip && tripKind === "oneway" ? undefined : leg
  const dayIndex = isOutbound ? 0 : Math.max(0, trip.days.length - 1)

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
      taskPatch: hideReturnTask
        ? null
        : taskPatchFromManualDraft(
            { ...taskDraft, cost: costRef.current },
            existingTask ? { includeCleared: true } : undefined,
          ),
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {canOfferRoundtrip ? (
            <div
              className="flex flex-wrap gap-1.5"
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
            onLiveContext={({ mode }) => setLiveMode(mode)}
            onSubmit={handleFormSubmit}
            renderAfterDestination={
              showDiscovery
                ? ({ from, to, mode }) => (
                    <ManualFlightSearch
                      from={from}
                      to={to}
                      mode={mode}
                      trip={{
                        startDate: trip.startDate,
                        numDays: trip.numDays,
                        numTravelers: trip.numTravelers,
                      }}
                      dayIndex={dayIndex}
                      days={trip.days}
                      leg={flightLeg}
                    />
                  )
                : undefined
            }
          />

          {hideReturnTask ? (
            <p className="text-xs text-muted-foreground rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
              El billete de ida y vuelta se apunta en el tramo de ida.
            </p>
          ) : (
            <ManualItemTaskFields
              type="transport"
              routeMode={liveMode}
              currency={trip.currency}
              draft={taskDraft}
              onChange={(next) => {
                costRef.current = next.cost
                setTaskDraft(next)
              }}
              costAriaLabel={roundtripFlightLabel ? "Coste ida y vuelta" : "Coste"}
            />
          )}
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
