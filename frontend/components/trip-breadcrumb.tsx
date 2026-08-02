"use client"

import { PanelRightClose, PanelRightOpen, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { countriesPlainList } from "@/lib/countries"
import { formatTripDates } from "@/lib/trip-dates"
import type { Trip } from "@/types/itinerary"
import { cn } from "@/lib/utils"

type TripBreadcrumbProps = {
  trip: Trip
  planOpen: boolean
  onTogglePlan: () => void
  addSourceOpen?: boolean
  onToggleAddSource?: () => void
  addSourceDisabled?: boolean
  className?: string
}

export function TripBreadcrumb({
  trip,
  planOpen,
  onTogglePlan,
  addSourceOpen = false,
  onToggleAddSource,
  addSourceDisabled = false,
  className,
}: TripBreadcrumbProps) {
  const itemCount = trip.days.reduce((sum, d) => sum + d.items.length, 0)
  const dates = formatTripDates(trip.startDate, trip.endDate)
  const place = trip.countries.length ? countriesPlainList(trip.countries) : null

  return (
    <div
      className={cn(
        // Solo desktop: en móvil las acciones van como FABs (ver trip page).
        "hidden h-11 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:flex sm:gap-3 sm:px-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
        <h1 className="truncate font-medium text-foreground">{trip.name}</h1>
        {(dates || place) && (
          <>
            <span className="hidden text-muted-foreground/50 sm:inline" aria-hidden>
              ·
            </span>
            <span className="hidden truncate text-xs text-muted-foreground tabular-nums sm:inline">
              {dates ?? place}
              {dates && place ? ` · ${place}` : null}
            </span>
          </>
        )}
      </div>

      <p className="hidden shrink-0 text-xs text-muted-foreground tabular-nums md:inline">
        {trip.sourceIds.length} {trip.sourceIds.length === 1 ? "fuente" : "fuentes"}
        {" · "}
        {trip.days.length} {trip.days.length === 1 ? "día" : "días"}
        {" · "}
        {itemCount} {itemCount === 1 ? "ítem" : "ítems"}
      </p>

      {onToggleAddSource ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
          disabled={addSourceDisabled}
          onClick={onToggleAddSource}
          aria-pressed={addSourceOpen}
          aria-label={addSourceOpen ? "Cancelar añadir fuente" : "Añadir fuente"}
        >
          {addSourceOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{addSourceOpen ? "Cancelar" : "Añadir fuente"}</span>
        </Button>
      ) : null}

      <Button
        type="button"
        variant={planOpen ? "secondary" : "default"}
        size="sm"
        className={cn(
          "h-8 shrink-0 gap-1.5 px-2.5 text-xs",
          planOpen
            ? "bg-muted text-foreground hover:bg-muted/80"
            : "shadow-sm shadow-primary/20",
        )}
        onClick={onTogglePlan}
        aria-pressed={planOpen}
        aria-controls="trip-plan-panel"
        aria-label={planOpen ? "Ocultar Mi viaje" : "Abrir Mi viaje"}
      >
        {planOpen ? (
          <PanelRightClose className="h-3.5 w-3.5" />
        ) : (
          <PanelRightOpen className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">Mi viaje</span>
      </Button>
    </div>
  )
}
