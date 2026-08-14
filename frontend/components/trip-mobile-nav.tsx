"use client"

import Link from "next/link"
import { Compass, Newspaper, Route, Sparkles } from "lucide-react"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { useVirtualKeyboard } from "@/hooks/use-virtual-keyboard"
import { cn } from "@/lib/utils"

export type TripMobileSection = "sources" | "plan" | "assistant"

/**
 * Espacio inferior para que el contenido scrolleable no quede bajo el dock.
 * El nav es overlay absoluto: el contenido pasa por detrás.
 * Definido en `globals.css` (`--wp-nav-*`): el hueco del dock y el que reserva
 * el contenido tienen que moverse juntos.
 */
export const TRIP_MOBILE_NAV_CLEARANCE = "var(--wp-nav-clearance)" as const

/** Clase Tailwind para padding-bottom de listas / composers en móvil. */
export const tripMobileNavClearanceClass = "max-md:pb-[var(--wp-nav-clearance)]"

const TAB_ITEM_CLASS =
  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10.5px] font-medium leading-none transition-[color,background-color,min-height,width,padding,border-radius,gap] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

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
  /**
   * Repliegue al hacer scroll (Fuentes / Mi viaje): iconos solos, más juntos.
   * El teclado virtual sigue ocultando el dock por completo (variante `floating`).
   */
  compact?: boolean
  /**
   * `floating`: tarjeta flotante independiente (Fuentes / Mi viaje).
   * `embedded`: solo la fila de pestañas, para incrustarla en otra tarjeta
   * (p. ej. el composer del asistente) y formar un único elemento flotante.
   */
  variant?: "floating" | "embedded"
  className?: string
}

/** Fila de pestañas: Inicio + secciones del viaje. */
function NavTabs({
  active,
  onChange,
  compact = false,
}: Pick<TripMobileNavProps, "active" | "onChange" | "compact">) {
  const { requireAccount } = useRegistrationGate()

  const itemClass = compact
    ? "flex size-9 items-center justify-center rounded-full p-0 text-[10.5px] font-medium leading-none transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    : TAB_ITEM_CLASS

  return (
    <div
      className={cn(
        "grid grid-cols-4",
        compact ? "w-max gap-0 p-0.5" : "gap-0.5 p-1",
      )}
    >
      <Link
        href="/trips"
        aria-label="Inicio"
        onClick={(e) => {
          if (!requireAccount("home")) e.preventDefault()
        }}
        className={cn(itemClass, "text-muted-foreground")}
      >
        <Compass
          className={cn(
            "shrink-0 transition-[width,height] duration-200",
            compact ? "h-4 w-4" : "h-[1.125rem] w-[1.125rem]",
          )}
          aria-hidden
        />
        {compact ? null : <span>Inicio</span>}
      </Link>

      {TABS.map(({ id, label, icon: Icon }) => {
        const selected = active === id
        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-current={selected ? "page" : undefined}
            onClick={() => onChange(id)}
            className={cn(
              itemClass,
              selected ? "bg-muted text-primary" : "text-muted-foreground",
            )}
          >
            <Icon
              className={cn(
                "shrink-0 transition-[width,height] duration-200",
                compact ? "h-4 w-4" : "h-[1.125rem] w-[1.125rem]",
                selected && "stroke-[2.25]",
              )}
              aria-hidden
            />
            {compact ? null : <span>{label}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function TripMobileNav({
  active,
  onChange,
  compact = false,
  variant = "floating",
  className,
}: TripMobileNavProps) {
  const { open: keyboardOpen } = useVirtualKeyboard()

  if (variant === "embedded") {
    return (
      <nav aria-label="Navegación del viaje" className={className}>
        <NavTabs active={active} onChange={onChange} />
      </nav>
    )
  }

  const isHidden = keyboardOpen

  return (
    <nav
      aria-label="Navegación del viaje"
      aria-hidden={isHidden || undefined}
      className={cn(
        // Overlay: sin fondo propio; los toques fuera de la tarjeta atraviesan al contenido.
        "pointer-events-none absolute inset-x-0 bottom-0 z-40",
        "px-3 pt-2 pb-[var(--wp-nav-gap)]",
        "transition-[opacity,transform] duration-200 ease-out",
        isHidden && "translate-y-[120%] opacity-0",
        className,
      )}
    >
      <div
        className={cn(
          // Opaco: si no, el blur deja ver el panel de debajo y el `bg-muted`
          // del tab activo parece otro gris según Fuentes / Mi viaje / Asistente.
          "pointer-events-auto overflow-hidden border border-border/60 bg-background",
          "shadow-[0_10px_40px_-12px_rgba(0,0,0,0.28)]",
          "transition-[border-radius,width,margin] duration-200 ease-out",
          compact ? "mx-auto w-max rounded-full" : "w-full rounded-2xl",
          isHidden && "pointer-events-none",
        )}
      >
        <NavTabs active={active} onChange={onChange} compact={compact} />
      </div>
    </nav>
  )
}
