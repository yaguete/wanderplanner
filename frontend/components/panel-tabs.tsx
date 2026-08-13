"use client"

import type { LucideIcon } from "lucide-react"
import { SlidingIndicator } from "@/hooks/sliding-indicator"
import { useSlidingIndicator } from "@/hooks/use-sliding-indicator"
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
 * En paneles estrechos (< `@md` ≈448px) solo la etiqueta; a partir de `@md`, icono + label.
 */
export function PanelTabs<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  className,
}: PanelTabsProps<T>) {
  const { containerRef, box, ready } = useSlidingIndicator(
    value,
    items.map((item) => item.id).join("\0"),
  )

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-flex w-fit max-w-full items-end gap-3 @md:gap-4", className)}
      role="tablist"
      aria-label={ariaLabel}
    >
      <SlidingIndicator box={box} ready={ready} variant="underline" />
      {items.map(({ id, label, icon: Icon }) => {
        const selected = value === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-indicator-target=""
            data-indicator-active={selected ? "true" : undefined}
            aria-label={label}
            title={label}
            onClick={() => onValueChange(id)}
            className={cn(
              "relative z-[1] inline-flex min-h-8 shrink-0 items-center gap-1.5 pb-2 text-xs transition-colors duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              selected
                ? "font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon
              className="hidden h-3.5 w-3.5 shrink-0 @md:block"
              aria-hidden
              strokeWidth={selected ? 2.25 : 2}
            />
            <span className="truncate">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
