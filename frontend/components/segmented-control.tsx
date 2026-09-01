"use client"

import type { LucideIcon } from "lucide-react"
import { SlidingIndicator } from "@/hooks/sliding-indicator"
import { useSlidingIndicator } from "@/hooks/use-sliding-indicator"
import { cn } from "@/lib/utils"

export type SegmentedControlItem<T extends string> = {
  id: T
  label: string
  icon?: LucideIcon
}

type SegmentedControlProps<T extends string> = {
  items: readonly SegmentedControlItem<T>[]
  value: T
  onValueChange: (id: T) => void
  ariaLabel: string
  /** `compact`: Lista · Calendario · Mapa (modo de visualización). */
  size?: "default" | "compact"
  /** Selección en semibold/tinta; el resto, gris más suave. */
  emphasis?: boolean
  /**
   * El control se ajusta al texto y no lo trunca.
   * Úsalo cuando las etiquetas tienen que leerse enteras (p. ej. «En español»).
   */
  fit?: boolean
  className?: string
}

/**
 * Píldora segmented (Lista · Calendario · Mapa y similares).
 * Ancho según el **panel** (`@container` / `@md:`), no según la ventana.
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  size = "compact",
  emphasis = false,
  fit = false,
  className,
}: SegmentedControlProps<T>) {
  const compact = size === "compact"
  const { containerRef, box, ready } = useSlidingIndicator(
    value,
    items.map((item) => item.id).join("\0"),
  )

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative inline-flex items-center gap-0 rounded-lg bg-muted p-0.5",
        fit ? "w-fit" : "w-full @md:w-fit",
        compact ? "min-h-7" : "min-h-8",
        className,
      )}
      role="tablist"
      aria-label={ariaLabel}
    >
      <SlidingIndicator box={box} ready={ready} variant="pill" />
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
              "relative z-[1] inline-flex items-center justify-center rounded-md transition-colors duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              fit ? "flex-none" : "min-w-0 flex-1 @md:flex-none",
              compact
                ? "min-h-7 gap-1 px-2 py-1 text-xs @md:min-w-[4rem]"
                : "min-h-7 gap-1 px-1.5 text-[11px] @md:gap-1.5 @md:px-3 @md:text-xs",
              !emphasis && "font-medium",
              selected
                ? emphasis
                  ? "font-semibold text-foreground"
                  : "text-foreground"
                : emphasis
                  ? "font-medium text-muted-foreground/55 hover:text-muted-foreground"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon ? (
              <Icon className={cn("shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} aria-hidden />
            ) : null}
            <span
              className={cn(
                fit
                  ? "whitespace-nowrap"
                  : compact
                    ? "inline min-w-0 truncate"
                    : "hidden min-w-0 truncate @md:inline",
              )}
            >
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
