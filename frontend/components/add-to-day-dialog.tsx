"use client"

/**
 * Selector de día para consolidar un ítem de una fuente en «Mi viaje».
 * Modal (no popover) para que en viajes largos la lista de días siga siendo
 * alcanzable: scroll propio + filtro cuando hay muchos días.
 */
import { useEffect, useMemo, useState } from "react"
import { Check, Plus, Search } from "lucide-react"
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
import { itemTypeIcon, itemTypeLabel } from "@/lib/item-styles"
import type { ItemType, UserDay } from "@/types/itinerary"

/** A partir de aquí la lista se vuelve incómoda sin buscador. */
const SEARCH_FROM_DAYS = 8

/** Sustantivo con artículo para el copy de «Añadir al día». */
const ADD_TO_DAY_OBJECT: Record<ItemType, string> = {
  stay: "este alojamiento",
  activity: "esta actividad",
  food: "este restaurante",
  transport: "este desplazamiento",
}

export type AddToDayDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  days: UserDay[]
  tripStartDate?: string | null
  itemName?: string
  itemType?: ItemType
  itemAffiliateUrl?: string | null
  /** Sustituye el copy por defecto («colocar este alojamiento», etc.). */
  description?: string
  /** Números de día (1-based) donde ya está este ítem (o todos, en lote). */
  addedDayNumbers?: number[]
  onSelect: (dayId: string) => void
  /** Crea un día vacío al final de la ruta (mismo `addDay` que «Mi viaje»). */
  onAddDay?: () => void
}

export function AddToDayDialog({
  open,
  onOpenChange,
  days,
  tripStartDate = null,
  itemName,
  itemType,
  itemAffiliateUrl,
  description,
  addedDayNumbers = [],
  onSelect,
  onAddDay,
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

  const TypeIcon = itemType
    ? itemTypeIcon(itemType, { affiliateUrl: itemAffiliateUrl })
    : null
  const showSearch = days.length >= SEARCH_FROM_DAYS
  const showItemPreview = !!itemName && !!itemType && TypeIcon
  const descriptionText =
    description ??
    (itemType
      ? `Elige en qué día de tu viaje quieres colocar ${ADD_TO_DAY_OBJECT[itemType]}.`
      : "Elige en qué día de tu viaje quieres colocar estos ítems.")

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
              {descriptionText}
            </DialogDescription>
          </div>
          {showItemPreview ? (
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
                {itemType ? itemTypeLabel(itemType, { affiliateUrl: itemAffiliateUrl }) : null}
              </p>
            </div>
          </div>
          ) : null}
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
          <div className="flex flex-col items-center gap-3 px-5 py-8 max-sm:flex-1">
            <p className="text-center text-sm text-muted-foreground">
              Este viaje aún no tiene días.
            </p>
            {onAddDay ? <AddDayButton onClick={onAddDay} /> : null}
          </div>
        ) : visibleRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground max-sm:flex-1">
            Ningún día coincide con «{query.trim()}».
          </p>
        ) : (
          <ul className="max-h-[min(55vh,24rem)] overflow-y-auto p-2 max-sm:max-h-none max-sm:min-h-0 max-sm:flex-1 max-sm:space-y-1.5 max-sm:px-3 max-sm:pt-3 max-sm:pb-[env(safe-area-inset-bottom)]">
            {visibleRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(row.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent",
                    "max-sm:border max-sm:border-border max-sm:bg-card max-sm:shadow-sm max-sm:active:bg-accent",
                  )}
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
            {!needle && onAddDay ? (
              <li>
                <AddDayButton onClick={onAddDay} />
              </li>
            ) : null}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AddDayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors",
        "text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground",
        "max-sm:border max-sm:border-dashed max-sm:border-border max-sm:active:bg-accent",
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-background">
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="text-sm font-medium">Añadir día</span>
    </button>
  )
}
