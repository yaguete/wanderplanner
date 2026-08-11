"use client"

import { Bed, Car, Luggage, Route, Ticket } from "lucide-react"
import { SegmentedControl } from "@/components/segmented-control"
import type { TripTaskCategory } from "@/types/itinerary"

export type ItineraryViewMode =
  | "itinerary"
  | "activities"
  | "stay"
  | "transport"
  | "basics"

const items = [
  { id: "itinerary" as const, label: "Ruta", icon: Route },
  { id: "activities" as const, label: "Actividades", icon: Ticket },
  { id: "stay" as const, label: "Alojamientos", icon: Bed },
  { id: "transport" as const, label: "Transporte", icon: Car },
  { id: "basics" as const, label: "Básicos", icon: Luggage },
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

/** Copy del CTA «añadir» al final de la lista (no aplica a Ruta). */
export const VIEW_MODE_ADD_ACTION_LABEL: Record<
  Exclude<ItineraryViewMode, "itinerary">,
  string
> = {
  activities: "Añadir actividad",
  stay: "Añadir alojamiento",
  transport: "Añadir traslado",
  basics: "Añadir tarea",
}

/**
 * Pestañas del panel Mi viaje (píldora, como Lista/Mapa):
 * Ruta · Actividades · Alojamientos · Transporte · Básicos.
 * Fuentes usa PanelTabs (subrayado); aquí no.
 */
export function ItineraryViewModeTabs({
  value,
  onValueChange,
}: {
  value: ItineraryViewMode
  onValueChange: (mode: ItineraryViewMode) => void
}) {
  return (
    <SegmentedControl
      items={items}
      value={value}
      onValueChange={onValueChange}
      ariaLabel="Vista de Mi viaje"
      size="default"
    />
  )
}
