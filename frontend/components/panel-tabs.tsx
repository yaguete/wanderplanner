"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type PanelTabItem<T extends string> = {
  id: T
  label: string
  icon: LucideIcon
}

type PanelTabsProps<T extends string> = {
  items: readonly PanelTabItem<T>[]
  value: T
  onValueChange: (id: T) => void
  ariaLabel: string
  className?: string
}

/**
 * Pestañas de navegación de contenido (Fuentes / Mi viaje):
 * icono + etiqueta, indicador subrayado de 2px con extremos redondeados.
 * Las etiquetas se ocultan según el ancho del **panel** (`@md`, 448px), no de la ventana.
 */
export function PanelTabs<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  className,
}: PanelTabsProps<T>) {
  return (
    <div
      className={cn("inline-flex w-fit max-w-full items-end gap-3 @md:gap-4", className)}
      role="tablist"
      aria-label={ariaLabel}
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
              "relative inline-flex min-h-8 shrink-0 items-center gap-1.5 pb-2 text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              selected
                ? "font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={selected ? 2.25 : 2} />
            <span className="hidden truncate @md:inline">{label}</span>
            {selected ? (
              <span
                className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary"
                aria-hidden
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
