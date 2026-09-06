"use client"

import { useEffect, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { CalendarDays, List, Map as MapIcon } from "lucide-react"
import { useVirtualKeyboard } from "@/hooks/use-virtual-keyboard"
import { cn } from "@/lib/utils"
import type { RouteViewMode } from "@/components/itinerary-calendar-view"

const TAB_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"

const ITEMS: {
  id: RouteViewMode
  label: string
  icon: typeof List
}[] = [
  { id: "list", label: "Lista", icon: List },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "map", label: "Mapa", icon: MapIcon },
]

/**
 * Dock compacto vertical (solo iconos) en la esquina inferior derecha,
 * encima del nav inferior: sustituye a Lista / Calendario / Mapa cuando el
 * cromo de Ruta está replegado en móvil.
 *
 * Overlay del viewport (portal a `document.body`): el listado no se aparta
 * con margen; pasa por debajo. El panel de Ruta es `@container`, y eso
 * captura `position: fixed` — sin portal el rail se ancla al flujo.
 */
export function RouteViewRail({
  value,
  onChange,
}: {
  value: RouteViewMode
  onChange: (id: RouteViewMode) => void
}) {
  const { open: keyboardOpen } = useVirtualKeyboard()
  const [mounted, setMounted] = useState(false)
  const pillIndex = ITEMS.findIndex((item) => item.id === value)
  const isHidden = keyboardOpen

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return createPortal(
    <nav
      aria-label="Vista de ruta"
      aria-hidden={isHidden || undefined}
      style={
        {
          right: "max(1rem, env(safe-area-inset-right, 0px))",
          // `--wp-nav-height` se pisa en `:root` al compactar el dock, para
          // que este portal (fuera del detalle) vea el mismo valor.
          bottom: "calc(var(--wp-nav-gap) + var(--wp-nav-height) + 0.5rem)",
        } as CSSProperties
      }
      className={cn(
        "pointer-events-none fixed z-40 md:hidden",
        "transition-[opacity,transform,bottom] duration-200 ease-out",
        isHidden && "translate-y-[120%] opacity-0",
      )}
    >
      <div
        className={cn(
          "wp-glass pointer-events-auto overflow-hidden rounded-full",
          isHidden && "pointer-events-none",
        )}
      >
        <div className="px-0.5 py-1.5">
          <div
            style={
              {
                ...(pillIndex >= 0 ? { "--wp-nav-index": pillIndex } : {}),
              } as CSSProperties
            }
            className="relative grid w-10 grid-rows-3 text-[hsl(var(--wp-nav-ink))]"
          >
            {pillIndex >= 0 ? (
              <div
                aria-hidden
                className="wp-nav-pill wp-nav-pill--vertical"
              />
            ) : null}
            {ITEMS.map(({ id, label, icon: Icon }) => {
              const selected = value === id
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={label}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => onChange(id)}
                  className={cn(
                    "relative z-10 flex h-9 w-10 items-center justify-center rounded-full p-0",
                    TAB_FOCUS,
                    selected
                      ? "font-semibold text-foreground"
                      : "font-light text-[hsl(var(--wp-nav-ink))]",
                  )}
                >
                  <Icon
                    className="h-4 w-4 shrink-0"
                    strokeWidth={selected ? 2.25 : 1.5}
                    aria-hidden
                  />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </nav>,
    document.body,
  )
}
