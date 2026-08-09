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
 */
export const TRIP_MOBILE_NAV_CLEARANCE =
  "calc(5.5rem + env(safe-area-inset-bottom, 0px))" as const

/** Clase Tailwind para padding-bottom de listas / composers en móvil. */
export const tripMobileNavClearanceClass =
  "max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"

const TAB_ITEM_CLASS =
  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10.5px] font-medium leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

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
   * Oculta el dock con una salida suave. Con el teclado virtual abierto se
   * oculta solo (variante `floating`): la suscripción vive aquí para no
   * re-renderizar la página entera en cada cambio del teclado.
   */
  hidden?: boolean
  /**
   * `floating`: tarjeta flotante independiente (Fuentes / Mi viaje).
   * `embedded`: solo la fila de pestañas, para incrustarla en otra tarjeta
   * (p. ej. el composer del asistente) y formar un único elemento flotante.
   */
  variant?: "floating" | "embedded"
  className?: string
}

/** Fila de pestañas: Inicio + secciones del viaje, a ancho completo. */
function NavTabs({
  active,
  onChange,
}: Pick<TripMobileNavProps, "active" | "onChange">) {
  const { requireAccount } = useRegistrationGate()

  return (
    <div className="grid grid-cols-4 gap-0.5 p-1">
      <Link
        href="/trips"
        onClick={(e) => {
          if (!requireAccount("home")) e.preventDefault()
        }}
        className={cn(TAB_ITEM_CLASS, "text-muted-foreground")}
      >
        <Compass className="h-[1.125rem] w-[1.125rem]" aria-hidden />
        <span>Inicio</span>
      </Link>

      {TABS.map(({ id, label, icon: Icon }) => {
        const selected = active === id
        return (
          <button
            key={id}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => onChange(id)}
            className={cn(
              TAB_ITEM_CLASS,
              selected ? "bg-muted text-primary" : "text-muted-foreground",
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
  )
}

export function TripMobileNav({
  active,
  onChange,
  hidden = false,
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

  const isHidden = hidden || keyboardOpen

  return (
    <nav
      aria-label="Navegación del viaje"
      aria-hidden={isHidden || undefined}
      className={cn(
        // Overlay: sin fondo propio; los toques fuera de la tarjeta atraviesan al contenido.
        "pointer-events-none absolute inset-x-0 bottom-0 z-40",
        "px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]",
        "transition-[opacity,transform] duration-200 ease-out",
        isHidden && "translate-y-[120%] opacity-0",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-auto rounded-2xl",
          "border border-border/60 bg-background/80 backdrop-blur-xl",
          "shadow-[0_10px_40px_-12px_rgba(0,0,0,0.28)]",
        )}
      >
        <NavTabs active={active} onChange={onChange} />
      </div>
    </nav>
  )
}
