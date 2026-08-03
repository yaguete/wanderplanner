"use client"

import { Bed, Car, Luggage, Route, Ticket } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TripTaskCategory } from "@/types/itinerary"

export type ItineraryViewMode =
  | "itinerary"
  | "activities"
  | "stay"
  | "transport"
  | "basics"

const items: {
  id: ItineraryViewMode
  label: string
  icon: typeof Route
}[] = [
  { id: "itinerary", label: "Ruta", icon: Route },
  { id: "activities", label: "Actividades", icon: Ticket },
  { id: "stay", label: "Alojamientos", icon: Bed },
  { id: "transport", label: "Transporte", icon: Car },
  { id: "basics", label: "Básicos", icon: Luggage },
]

/** Mapeo pestaña → categorías de tarea que muestra. */
export const VIEW_MODE_TASK_CATEGORIES: Record<
  Exclude<ItineraryViewMode, "itinerary">,
  TripTaskCategory[]
> = {
  activities: ["activity", "food"],
  stay: ["accommodation"],
  transport: ["transport"],
  basics: ["basic", "other", "paperwork", "health"],
}

/** Categoría por defecto al «Añadir tarea» desde cada pestaña. */
export const VIEW_MODE_DEFAULT_TASK_CATEGORY: Record<
  Exclude<ItineraryViewMode, "itinerary">,
  TripTaskCategory
> = {
  activities: "activity",
  stay: "accommodation",
  transport: "transport",
  basics: "basic",
}

/**
 * Pestañas del panel Mi viaje (segmented control único):
 * Ruta · Actividades · Alojamientos · Transporte · Básicos.
 * En móvil (< sm) solo icono; en desktop icono + label.
 */
export function ItineraryViewModeTabs({
  value,
  onValueChange,
}: {
  value: ItineraryViewMode
  onValueChange: (mode: ItineraryViewMode) => void
}) {
  return (
    <div
      className="inline-flex min-h-8 w-full flex-wrap items-center gap-0 rounded-lg bg-muted p-0.5"
      role="tablist"
      aria-label="Vista de Mi viaje"
    >
      {items.map(({ id, label, icon: Icon }) => {
        const selected = value === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={label}
            title={label}
            onClick={() => onValueChange(id)}
            className={cn(
              "inline-flex min-h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5",
              "text-[11px] transition-colors sm:gap-1.5 sm:px-2 sm:text-xs",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-background font-medium text-foreground shadow-sm"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="hidden truncate sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
