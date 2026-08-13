"use client"

import { BookOpen, Map, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TripDesktopPanel, TripPanelState } from "@/lib/trip-chrome-context"

const SEGMENTS: {
  id: TripDesktopPanel
  label: string
  icon: typeof BookOpen
}[] = [
  { id: "sources", label: "Fuentes", icon: BookOpen },
  { id: "plan", label: "Viaje", icon: Map },
  { id: "assistant", label: "Asistente", icon: Sparkles },
]

type TripPanelTogglesProps = {
  panels: TripPanelState
  onToggle: (panel: TripDesktopPanel) => void
  className?: string
}

export function TripPanelToggles({ panels, onToggle, className }: TripPanelTogglesProps) {
  const activeCount = (["sources", "plan", "assistant"] as const).filter((k) => panels[k]).length

  return (
    <div
      role="group"
      aria-label="Paneles visibles"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-muted p-1",
        className,
      )}
    >
      {SEGMENTS.map(({ id, label, icon: Icon }) => {
        const pressed = panels[id]
        const lockedOn = pressed && activeCount === 1
        return (
          <button
            key={id}
            type="button"
            aria-pressed={pressed}
            aria-label={
              lockedOn
                ? `${label} (al menos un panel)`
                : pressed
                  ? `Ocultar ${label}`
                  : `Mostrar ${label}`
            }
            title={lockedOn ? "Al menos un panel" : undefined}
            disabled={lockedOn}
            onClick={() => {
              if (!lockedOn) onToggle(id)
            }}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] transition-[color,background-color,box-shadow,transform] duration-150 ease-out",
              "active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              pressed
                ? "bg-background font-semibold text-foreground shadow-sm"
                : "font-medium text-muted-foreground hover:text-foreground",
              lockedOn && "cursor-default opacity-100",
            )}
          >
            <Icon
              className={cn("h-3.5 w-3.5 shrink-0", pressed ? "opacity-100" : "opacity-70")}
              aria-hidden
              strokeWidth={pressed ? 2.5 : 2}
            />
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
