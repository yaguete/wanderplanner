"use client"

import type { CSSProperties } from "react"
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

const TAB_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"

const TAB_ITEM_CLASS =
  "relative z-10 flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10.5px] leading-none transition-[color,font-weight,min-height,width,padding,border-radius,gap] duration-200 ease-out " +
  TAB_FOCUS

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
   * Repliegue al hacer scroll hacia abajo (Fuentes / Mi viaje): iconos solos,
   * más juntos. Al subir, vuelve el tamaño grande; el chevron de la cabecera
   * no lo toca. El teclado virtual sigue ocultando el dock por completo
   * (variante `floating`).
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
  const tabIndex = TABS.findIndex((t) => t.id === active)
  const pillIndex = tabIndex >= 0 ? 1 + tabIndex : null

  const itemClass = compact
    ? cn(
        "relative z-10 flex h-9 w-10 items-center justify-center rounded-full p-0 text-[10.5px] leading-none transition-[color,font-weight] duration-200 ease-out",
        TAB_FOCUS,
      )
    : TAB_ITEM_CLASS

  return (
    <div className={cn(compact ? "px-1.5 py-0.5" : "px-1.5 py-1")}>
      <div
        style={
          {
            ...(pillIndex != null ? { "--wp-nav-index": pillIndex } : {}),
          } as CSSProperties
        }
        className={cn(
          "relative grid grid-cols-4 text-[hsl(var(--wp-nav-ink))]",
          compact && "w-max",
        )}
      >
        {pillIndex != null ? (
          <div
            aria-hidden
            className={cn("wp-nav-pill", compact && "wp-nav-pill--compact")}
          />
        ) : null}

        <Link
          href="/trips"
          aria-label="Inicio"
          onClick={(e) => {
            if (!requireAccount("home")) e.preventDefault()
          }}
          className={cn(itemClass, "font-light text-[hsl(var(--wp-nav-ink))]")}
        >
          <Compass
            className={cn(
              "shrink-0 transition-[width,height,stroke-width] duration-200",
              compact ? "h-4 w-4" : "h-[1.125rem] w-[1.125rem]",
            )}
            strokeWidth={1.5}
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
                selected
                  ? "font-semibold text-foreground"
                  : "font-light text-[hsl(var(--wp-nav-ink))]",
              )}
            >
              <Icon
                className={cn(
                  "shrink-0 transition-[width,height,stroke-width] duration-200",
                  compact ? "h-4 w-4" : "h-[1.125rem] w-[1.125rem]",
                )}
                strokeWidth={selected ? 2.25 : 1.5}
                aria-hidden
              />
              {compact ? null : <span>{label}</span>}
            </button>
          )
        })}
      </div>
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
        // `fixed`, no `absolute`: el documento es el scroller en móvil, así que
        // "abajo" tiene que ser el borde del viewport, no el final del documento.
        // El cristal va en el <div> hijo: Safari 26 muestrea este <nav> para
        // teñir su barra inferior y un fondo aquí se filtraría al chrome nativo.
        "pointer-events-none fixed inset-x-0 bottom-0 z-40",
        "px-4 pt-2 pb-[var(--wp-nav-gap)]",
        "transition-[opacity,transform] duration-200 ease-out",
        isHidden && "translate-y-[120%] opacity-0",
        className,
      )}
    >
      <div
        className={cn(
          // Tab activo: cápsula `.wp-nav-pill` opaca (0.92), no `bg-muted`,
          // para que el blur no se tiña con Fuentes / Mi viaje / Asistente.
          "wp-glass pointer-events-auto overflow-hidden",
          "transition-[width,margin,border-radius] duration-200 ease-out",
          compact ? "mx-auto w-max rounded-full" : "w-full rounded-2xl",
          isHidden && "pointer-events-none",
        )}
      >
        <NavTabs active={active} onChange={onChange} compact={compact} />
      </div>
    </nav>
  )
}
