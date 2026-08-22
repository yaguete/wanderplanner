"use client"

import { BookOpen, Map, Sparkles } from "lucide-react"
import { BrandMark } from "@/components/brand-mark"
import { cn } from "@/lib/utils"
import type { TripDesktopPanel, TripPanelState } from "@/lib/trip-chrome-context"

const SEGMENTS: {
  id: TripDesktopPanel
  /** Etiqueta corta del header. */
  label: string
  /** Etiqueta de las tarjetas del canvas vacío. */
  emptyLabel: string
  hint: string
  icon: typeof BookOpen
}[] = [
  {
    id: "sources",
    label: "Fuentes",
    emptyLabel: "Tus Fuentes",
    hint: "Artículos e inspiración",
    icon: BookOpen,
  },
  {
    id: "plan",
    label: "Viaje",
    emptyLabel: "Tu Viaje",
    hint: "Ruta, mapa y tareas",
    icon: Map,
  },
  {
    id: "assistant",
    label: "Asistente",
    emptyLabel: "Asistente",
    hint: "Pregunta y planifica",
    icon: Sparkles,
  },
]

type TripPanelTogglesProps = {
  panels: TripPanelState
  onToggle: (panel: TripDesktopPanel) => void
  className?: string
}

export function TripPanelToggles({ panels, onToggle, className }: TripPanelTogglesProps) {
  return (
    <div
      role="group"
      aria-label="Paneles visibles"
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      {SEGMENTS.map(({ id, label, icon: Icon }) => {
        const pressed = panels[id]
        return (
          <button
            key={id}
            type="button"
            aria-pressed={pressed}
            aria-label={pressed ? `Ocultar ${label}` : `Mostrar ${label}`}
            onClick={() => onToggle(id)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium text-foreground",
              "transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out",
              "active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              // Independientes, no radio: el panel visible se hunde (gris,
              // plano); el oculto se eleva (blanco, borde, sombra) para que
              // se lea como un botón que lo vuelve a abrir.
              pressed
                ? "border-transparent bg-foreground/[0.08] shadow-none"
                : "border-border bg-background shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:border-foreground/20",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2} />
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Canvas vacío en desktop: ningún panel activo. */
export function TripPanelsEmpty({
  onSelect,
  destination,
}: {
  onSelect: (panel: TripDesktopPanel) => void
  destination?: string | null
}) {
  const title = destination
    ? `Hagamos realidad este viaje a ${destination}`
    : "Hagamos realidad este viaje"

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
      <BrandMark className="mb-5 h-14 w-auto" />
      <p className="max-w-sm text-center text-sm font-medium text-foreground">{title}</p>
      
      <div
        className="mt-6 flex flex-wrap items-stretch justify-center gap-2.5"
        role="group"
        aria-label="Abrir un panel"
      >
        {SEGMENTS.map(({ id, emptyLabel, hint, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-label={`Mostrar ${emptyLabel}`}
            className={cn(
              "flex w-[8.75rem] flex-col items-center rounded-lg bg-background px-3 pb-4 pt-4 text-center",
              "shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[box-shadow,transform] duration-150 ease-out",
              "hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]",
              "active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
          >
            <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" aria-hidden strokeWidth={2} />
            </span>
            <span className="text-sm font-medium text-foreground">{emptyLabel}</span>
            <span className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
