"use client"

import { Newspaper, Route, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export type TripMobileSection = "sources" | "plan" | "assistant"

/**
 * Espacio inferior para que el contenido scrolleable no quede bajo el dock.
 * El nav es overlay absoluto: el contenido pasa por detrás.
 */
export const TRIP_MOBILE_NAV_CLEARANCE =
  "calc(5.5rem + env(safe-area-inset-bottom, 0px))" as const

/** Clase Tailwind para padding-bottom de listas / composers en móvil. */
export const tripMobileNavClearanceClass =
  "max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"

const TABS: {
  id: TripMobileSection
  label: string
  icon: typeof Newspaper
}[] = [
  { id: "sources", label: "Fuentes", icon: Newspaper },
  { id: "plan", label: "Mi viaje", icon: Route },
  { id: "assistant", label: "Asistente", icon: Sparkles },
]

type TripMobileNavProps = {
  active: TripMobileSection
  onChange: (section: TripMobileSection) => void
  /** Oculta el dock (p. ej. teclado virtual abierto) con una salida suave. */
  hidden?: boolean
  className?: string
}

export function TripMobileNav({
  active,
  onChange,
  hidden = false,
  className,
}: TripMobileNavProps) {
  return (
    <nav
      aria-label="Secciones del viaje"
      aria-hidden={hidden || undefined}
      className={cn(
        // Overlay: sin fondo propio; los toques fuera de la píldora atraviesan al contenido.
        "pointer-events-none absolute inset-x-0 bottom-0 z-40",
        "px-8 pt-2 pb-[max(env(safe-area-inset-bottom),0.875rem)]",
        "transition-[opacity,transform] duration-200 ease-out",
        hidden && "translate-y-[120%] opacity-0",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-auto mx-auto flex w-full max-w-[20rem] items-stretch gap-0.5 rounded-full p-1",
          "border border-border/50 bg-background/70 backdrop-blur-xl",
          "shadow-[0_10px_40px_-12px_rgba(0,0,0,0.28)]",
        )}
        role="tablist"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const selected = active === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-current={selected ? "page" : undefined}
              onClick={() => onChange(id)}
              className={cn(
                "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5",
                "text-[10.5px] font-medium leading-none transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn("h-[1.125rem] w-[1.125rem]", selected && "stroke-[2.25]")}
                aria-hidden
              />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
