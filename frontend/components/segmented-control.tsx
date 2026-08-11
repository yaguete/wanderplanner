"use client"

import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type SegmentedControlItem<T extends string> = {
  id: T
  label: string
  icon: LucideIcon
}

type SegmentedControlProps<T extends string> = {
  items: readonly SegmentedControlItem<T>[]
  value: T
  onValueChange: (id: T) => void
  ariaLabel: string
  /** `compact`: Lista/Mapa (modo de visualización). */
  size?: "default" | "compact"
  className?: string
}

/**
 * Píldora segmented (Lista/Mapa y similares).
 * Ancho según el **panel** (`@container` / `@md:`), no según la ventana.
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  size = "compact",
  className,
}: SegmentedControlProps<T>) {
  const compact = size === "compact"

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0 rounded-lg bg-muted p-0.5",
        "w-full @md:w-fit",
        compact ? "min-h-7" : "min-h-8",
        className,
      )}
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
              "inline-flex min-w-0 items-center justify-center rounded-md transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "flex-1 @md:flex-none",
              compact
                ? "min-h-7 gap-1 px-2 py-1 text-xs font-medium @md:min-w-[4rem]"
                : "min-h-7 gap-1 px-1.5 text-[11px] font-medium @md:gap-1.5 @md:px-3 @md:text-xs",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} aria-hidden />
            <span className={cn(compact ? "inline" : "hidden truncate @md:inline")}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
