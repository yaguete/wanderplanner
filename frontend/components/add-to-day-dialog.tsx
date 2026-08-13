"use client"

/**
 * Selector de día para consolidar un ítem de una fuente en «Mi viaje».
 * Modal (no popover) para que en viajes largos la lista de días siga siendo
 * alcanzable: scroll propio + filtro cuando hay muchos días.
 */
import { useEffect, useMemo, useState } from "react"
import { Check, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { getDayUserDescription } from "@/lib/day-heading"
import { dateISOForDayIndex, formatDayDate } from "@/lib/trip-dates"
import { ITEM_LABELS, ITEM_TYPE_ICONS } from "@/lib/item-styles"
import type { ItemType, UserDay } from "@/types/itinerary"

/** A partir de aquí la lista se vuelve incómoda sin buscador. */
const SEARCH_FROM_DAYS = 8

export type AddToDayDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  days: UserDay[]
  tripStartDate?: string | null
  itemName: string
  itemType: ItemType
  /** Números de día (1-based) donde ya está este ítem. */
  addedDayNumbers?: number[]
  onSelect: (dayId: string) => void
}

export function AddToDayDialog({
  open,
  onOpenChange,
  days,
  tripStartDate = null,
  itemName,
  itemType,
  addedDayNumbers = [],
  onSelect,
}: AddToDayDialogProps) {
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (open) setQuery("")
  }, [open])

  const rows = useMemo(() => {
    const added = new Set(addedDayNumbers)
    return days.map((day, index) => {
      const dateLabel = formatDayDate(dateISOForDayIndex(tripStartDate, index))
      return {
        id: day.id,
        number: index + 1,
        description: getDayUserDescription(day.label).trim(),
        dateLabel,
        itemCount: day.items.length,
        alreadyHere: added.has(index + 1),
      }
    })
  }, [days, tripStartDate, addedDayNumbers])

  const needle = query.trim().toLowerCase()
  const visibleRows = needle
    ? rows.filter(
        (row) =>
          String(row.number).startsWith(needle) ||
          row.description.toLowerCase().includes(needle) ||
          (row.dateLabel?.toLowerCase().includes(needle) ?? false),
      )
    : rows

  const TypeIcon = ITEM_TYPE_ICONS[itemType]
  const showSearch = days.length >= SEARCH_FROM_DAYS

  const handleSelect = (dayId: string) => {
    onSelect(dayId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullscreenOnMobile
        className={cn(
          "overflow-hidden p-0 sm:max-w-md",
          // Cierre encima del notch cuando la modal es full-bleed
          "[&>button]:max-sm:top-[max(0.75rem,env(safe-area-inset-top))]",
        )}
      >
        <DialogHeader className="shrink-0 space-y-3 border-b border-border px-5 pb-4 pt-5 text-left max-sm:pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="pr-16">
            <DialogTitle className="text-base font-semibold tracking-tight">
              Añadir al día
            </DialogTitle>
            <DialogDescription className="mt-1">
              Elige en qué día de tu viaje quieres colocar este ítem.
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3 py-2">
            <span
              className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground"
              aria-hidden
            >
              <TypeIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="line-clamp-1 text-sm font-semibold leading-snug text-foreground">
                {itemName}
              </p>
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                {ITEM_LABELS[itemType]}
              </p>
            </div>
          </div>
          {showSearch ? (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar día por número, fecha o descripción"
                className="h-9 pl-8 text-base md:text-sm"
                aria-label="Buscar día"
              />
            </div>
          ) : null}
        </DialogHeader>

        {days.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground max-sm:flex-1">
            Este viaje aún no tiene días. Añade un día en «Mi viaje» para empezar.
          </p>
        ) : visibleRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground max-sm:flex-1">
            Ningún día coincide con «{query.trim()}».
          </p>
        ) : (
          <ul className="max-h-[min(55vh,24rem)] overflow-y-auto p-2 max-sm:max-h-none max-sm:min-h-0 max-sm:flex-1 max-sm:pb-[env(safe-area-inset-bottom)]">
            {visibleRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(row.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold tabular-nums text-foreground">
                    {row.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-sm font-medium text-foreground">
                        Día {row.number}
                      </span>
                      {row.dateLabel ? (
                        <span className="text-xs text-muted-foreground">{row.dateLabel}</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
                      {row.description ||
                        (row.itemCount === 0
                          ? "Sin planes todavía"
                          : `${row.itemCount} ${row.itemCount === 1 ? "ítem" : "ítems"}`)}
                    </span>
                  </span>
                  {row.alreadyHere ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                      Ya está
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
