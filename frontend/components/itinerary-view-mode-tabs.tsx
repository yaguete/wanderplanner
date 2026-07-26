"use client"

import { Bed, Car, List, Luggage } from "lucide-react"
import { cn } from "@/lib/utils"

export type ItineraryViewMode = "itinerary" | "stay" | "transport" | "basics"

const items: {
  id: ItineraryViewMode
  label: string
  short: string
  icon: typeof List
}[] = [
  { id: "itinerary", label: "Ruta", short: "Ruta", icon: List },
  { id: "stay", label: "Alojamientos", short: "Aloj.", icon: Bed },
  { id: "transport", label: "Transporte", short: "Transp.", icon: Car },
  { id: "basics", label: "Básicos", short: "Básicos", icon: Luggage },
]

export function ItineraryViewModeTabs({
  value,
  onValueChange,
}: {
  value: ItineraryViewMode
  onValueChange: (mode: ItineraryViewMode) => void
}) {
  return (
    <div
      className="flex w-full gap-0.5 rounded-lg bg-muted p-0.5"
      role="tablist"
      aria-label="Vista de Mi viaje"
    >
      {items.map(({ id, label, short, icon: Icon }) => {
        const selected = value === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onValueChange(id)}
            className={cn(
              "inline-flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors sm:gap-1.5 sm:px-2 sm:text-xs",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate sm:hidden">{short}</span>
            <span className="hidden truncate sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
