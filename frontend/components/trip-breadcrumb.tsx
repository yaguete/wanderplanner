"use client"

import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Trip } from "@/types/itinerary"
import { cn } from "@/lib/utils"

type TripBreadcrumbProps = {
  trip: Trip
  planOpen: boolean
  onTogglePlan: () => void
  onEditTrip: () => void
  className?: string
}

export function TripBreadcrumb({
  trip,
  planOpen,
  onTogglePlan,
  onEditTrip,
  className,
}: TripBreadcrumbProps) {
  const sourceCount = trip.sourceIds.length

  return (
    <div
      className={cn(
        // Solo desktop: en móvil las acciones van como FABs (ver trip page).
        "hidden h-11 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:flex sm:gap-3 sm:px-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <button
          type="button"
          onClick={onEditTrip}
          className="inline-flex min-w-0 max-w-full items-center rounded-md text-left text-sm outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring -ml-1.5 px-1.5 py-1"
          aria-label="Editar viaje"
          title="Editar viaje"
        >
          <h1 className="truncate font-medium text-foreground">{trip.name}</h1>
        </button>
        {sourceCount > 0 ? (
          <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
            · {sourceCount} {sourceCount === 1 ? "fuente" : "fuentes"}
          </p>
        ) : null}
      </div>

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
