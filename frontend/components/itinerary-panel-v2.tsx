"use client"

/**
 * Panel del itinerario: `ItineraryViewMode` (itinerario, alojamiento, transporte, básicos), en modo
 * itinerario además `listMode` lista/mapa (`ItineraryMapView`). Edición de días, reordenación con
 * `moveItemBetweenDays` y filas con enlace de afiliado en `ItineraryItemRow` / `BasicItineraryRow`.
 */
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react"
import { Car, Check, ChevronDown, ChevronUp, List, Map as MapIcon, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { formatDayHeadingLine, getDayUserDescription } from "@/lib/day-heading"
import { countriesPlainList } from "@/lib/countries"
import { dateISOForDayIndex, formatDayDate, formatTripMonthYear } from "@/lib/trip-dates"
import { useTrips } from "@/lib/trip-context"
import { BASIC_LABELS, ITEM_COLORS } from "@/lib/item-styles"
import type { BasicCategory, UserDayItem } from "@/types/itinerary"
import { ItineraryViewModeTabs, type ItineraryViewMode } from "@/components/itinerary-view-mode-tabs"
import { ItineraryMapView, type ItineraryMapPoint } from "@/components/itinerary-map-view"
import { EmptyState } from "@/components/empty-state"
import { TravelItemCard } from "@/components/travel-item-card"

function normalizeDayLabel(raw: string): string {
  return raw.replace(/\s+[—–]\s+/g, " - ")
}

function panelHeadingForMode(mode: ItineraryViewMode): string {
  switch (mode) {
    case "itinerary":
      return "Mi viaje"
    case "stay":
      return "Alojamientos"
    case "transport":
      return "Transporte"
    case "basics":
      return "Básicos"
  }
}

export default function ItineraryPanel({
  tripId,
  onClose,
}: {
  tripId: string
  onClose?: () => void
}) {
  const {
    getTrip,
    getTripSources,
    addDay,
    removeItemFromDay,
    removeSelectedDays,
    removeBasicFromTrip,
    moveItemBetweenDays,
  } = useTrips()
  const trip = getTrip(tripId)
  const dateSub = useMemo(() => (trip ? formatTripMonthYear(trip.startDate) : null), [trip])
  const itemCount = useMemo(
    () => (trip ? trip.days.reduce((sum, d) => sum + d.items.length, 0) : 0),
    [trip],
  )
  const tripSources = getTripSources(tripId)
  // Fallback de la `region` por ítem: si el ítem no trae una pista propia, se usa el `area` del artículo.
  const sourceAreaById = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const s of tripSources) m.set(s.id, s.area ?? null)
    return m
  }, [tripSources])
  const resolveRegion = useCallback(
    (item: { region?: string | null; sourceId: string }): string | null => {
      const own = item.region?.trim()
      if (own) return own
      const fb = sourceAreaById.get(item.sourceId)?.trim()
      return fb && fb.length > 0 ? fb : null
    },
    [sourceAreaById],
  )
  const [selectedDayIds, setSelectedDayIds] = useState<Set<string>>(() => new Set())
  const [viewMode, setViewMode] = useState<ItineraryViewMode>("itinerary")
  const [listMode, setListMode] = useState<"list" | "map">("list")

  useEffect(() => {
    if (!trip) return
    setSelectedDayIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        if (trip.days.some((d) => d.id === id)) next.add(id)
      }
      return next
    })
  }, [trip])

  if (!trip) return null

  const hasDaySelection = selectedDayIds.size > 0

  const stayByDay = useMemo(() => {
    return trip.days
      .map((day, dayIndex) => ({
        day,
        dayIndex,
        stays: day.items.filter((i) => i.type === "stay"),
      }))
      .filter((g) => g.stays.length > 0)
  }, [trip.days])

  const basicCategoryOrder: BasicCategory[] = useMemo(
    () => ["insurance", "sim", "carRental", "flight", "other"],
    [],
  )

  // Mismo orden que en la lista: días en secuencia, y dentro de cada día el orden de `items`; solo `stay` y `activity` en el mapa.
  const mapPoints: ItineraryMapPoint[] = useMemo(() => {
    const out: ItineraryMapPoint[] = []
    for (let i = 0; i < trip.days.length; i++) {
      const d = trip.days[i]!
      for (const it of d.items) {
        if (it.type === "stay" || it.type === "activity") {
          out.push({
            id: it.id,
            name: it.name,
            type: it.type,
            dayNumber: i + 1,
            region: resolveRegion(it),
          })
        }
      }
    }
    return out
  }, [trip.days, resolveRegion])

  // Índice de posición global (por día) para reglas de flechas arriba/abajo; debe coincidir con `moveItemOneStep`.
  const itemLocationById = useMemo(() => {
    const map = new Map<string, { dayId: string; dayIndex: number; itemIndex: number }>()
    trip.days.forEach((day, dayIndex) => {
      day.items.forEach((item, itemIndex) => {
        map.set(item.id, { dayId: day.id, dayIndex, itemIndex })
      })
    })
    return map
  }, [trip.days])

  const canMoveUp = useCallback(
    (itemId: string) => {
      const loc = itemLocationById.get(itemId)
      if (!loc) return false
      return loc.itemIndex > 0 || loc.dayIndex > 0
    },
    [itemLocationById],
  )

  const canMoveDown = useCallback(
    (itemId: string) => {
      const loc = itemLocationById.get(itemId)
      if (!loc) return false
      const day = trip.days[loc.dayIndex]
      const hasNextInSameDay = !!day && loc.itemIndex < day.items.length - 1
      const hasNextDay = loc.dayIndex < trip.days.length - 1
      return hasNextInSameDay || hasNextDay
    },
    [itemLocationById, trip.days],
  )

  const moveItemOneStep = useCallback(
    (itemId: string, direction: "up" | "down") => {
      const current = itemLocationById.get(itemId)
      if (!current) return
      const currentDay = trip.days[current.dayIndex]
      if (!currentDay) return

      let toDayId = current.dayId
      let toIndex = current.itemIndex

      if (direction === "up") {
        if (current.itemIndex > 0) {
          toIndex = current.itemIndex - 1
        } else {
          const prevDay = trip.days[current.dayIndex - 1]
          if (!prevDay) return
          toDayId = prevDay.id
          toIndex = prevDay.items.length
        }
      } else {
        if (current.itemIndex < currentDay.items.length - 1) {
          toIndex = current.itemIndex + 1
        } else {
          // Pasar al día siguiente aunque esté vacío (índice 0) para no saltar días sin ítems.
          const nextDay = trip.days[current.dayIndex + 1]
          if (!nextDay) return
          toDayId = nextDay.id
          toIndex = 0
        }
      }

      moveItemBetweenDays(tripId, {
        fromDayId: current.dayId,
        toDayId,
        itemId,
        toIndex,
      })
    },
    [itemLocationById, moveItemBetweenDays, trip.days, tripId],
  )

  const setDaySelected = (dayId: string, checked: boolean) => {
    setSelectedDayIds((prev) => {
      const n = new Set(prev)
      if (checked) n.add(dayId)
      else n.delete(dayId)
      return n
    })
  }

  const handleDayListAction = () => {
    if (hasDaySelection) {
      removeSelectedDays(tripId, Array.from(selectedDayIds))
      setSelectedDayIds(new Set())
    } else {
      addDay(tripId)
    }
  }

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden bg-background">
      <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                {panelHeadingForMode(viewMode)}
              </h2>
              {dateSub ? (
                <p className="text-xs text-muted-foreground tabular-nums">{dateSub}</p>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {itemCount} {itemCount === 1 ? "ítem" : "ítems"} · {trip.days.length}{" "}
              {trip.days.length === 1 ? "día" : "días"}
            </p>
          </div>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onClose}
              aria-label="Cerrar Mi viaje"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <ItineraryViewModeTabs value={viewMode} onValueChange={setViewMode} />
      </div>

      {viewMode === "itinerary" ? (
        <>
          <div className="flex shrink-0 items-center gap-3 px-4 py-2.5">
            <div
              className="inline-flex items-center gap-0 rounded-lg bg-muted p-0.5"
              role="tablist"
              aria-label="Vista de ruta"
            >
              <button
                type="button"
                role="tab"
                aria-selected={listMode === "list"}
                onClick={() => setListMode("list")}
                className={cn(
                  "inline-flex min-h-7 min-w-[4rem] items-center justify-center gap-1 rounded-md px-2 py-1",
                  "text-xs font-medium transition-colors",
                  listMode === "list"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List className="h-3 w-3 shrink-0" />
                Lista
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listMode === "map"}
                onClick={() => setListMode("map")}
                className={cn(
                  "inline-flex min-h-7 min-w-[4rem] items-center justify-center gap-1 rounded-md px-2 py-1",
                  "text-xs font-medium transition-colors",
                  listMode === "map"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <MapIcon className="h-3 w-3 shrink-0" />
                Mapa
              </button>
            </div>
            {listMode === "list" ? (
              <button
                type="button"
                onClick={handleDayListAction}
                className={cn(
                  "inline-flex min-h-8 shrink-0 items-center gap-1 text-xs font-medium transition-colors",
                  hasDaySelection
                    ? "text-destructive hover:text-destructive/90"
                    : "text-foreground hover:text-muted-foreground",
                )}
                aria-label={hasDaySelection ? "Eliminar día" : "Añadir día"}
              >
                {hasDaySelection ? (
                  <>
                    <X className="h-3.5 w-3.5 shrink-0" />
                    Eliminar día
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    Añadir día
                  </>
                )}
              </button>
            ) : null}
          </div>

          {listMode === "list" ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2">
              {trip.days.map((day, dayIndex) => (
                <DaySection
                  key={day.id}
                  tripId={tripId}
                  dayId={day.id}
                  dayIndex={dayIndex}
                  dayCount={trip.days.length}
                  dayDescription={getDayUserDescription(day.label)}
                  dayDateLabel={
                    formatDayDate(dateISOForDayIndex(trip.startDate, dayIndex))
                  }
                  items={day.items}
                  resolveRegion={resolveRegion}
                  isDaySelected={selectedDayIds.has(day.id)}
                  onDaySelectChange={(checked) => setDaySelected(day.id, checked)}
                  onRemoveItem={(itemId) => removeItemFromDay(tripId, day.id, itemId)}
                  canMoveItemUp={canMoveUp}
                  canMoveItemDown={canMoveDown}
                  onMoveItemUp={(itemId) => moveItemOneStep(itemId, "up")}
                  onMoveItemDown={(itemId) => moveItemOneStep(itemId, "down")}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-1">
              <ItineraryMapView
                tripId={tripId}
                points={mapPoints}
                countryCodes={trip.countries}
                destination={trip.countries.length ? countriesPlainList(trip.countries) : trip.name}
              />
            </div>
          )}
        </>
      ) : viewMode === "transport" ? (
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-2">
          <EmptyState
            icon={Car}
            title="Vista de transporte en preparación"
            description="Aquí reuniremos vuelos, trenes y traslados de tus fuentes y de la ruta consolidada."
          />
        </div>
      ) : viewMode === "stay" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
          {stayByDay.length === 0 ? (
            <EmptyState
              icon={Plus}
              title="Sin alojamientos todavía"
              description="Añade estancias desde la ruta destilada de tus fuentes."
              className="py-10"
            />
          ) : (
            <div className="flex flex-col">
              {stayByDay.map(({ day, dayIndex, stays }, sectionIndex) => (
                <div
                  key={day.id}
                  className={cn(
                    "flex flex-col gap-2",
                    sectionIndex > 0 && "mt-0 border-t border-border/50 pt-6",
                  )}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {formatDayHeadingLine(
                      dayIndex,
                      getDayUserDescription(day.label),
                      formatDayDate(dateISOForDayIndex(trip.startDate, dayIndex)),
                    )}
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-3 p-0">
                    {stays.map((item) => (
                      <li key={item.id} className="m-0 p-0">
                        <TravelItemCard
                          variant="planned"
                          title={item.name}
                          type={item.type}
                          sourceAuthor={item.sourceAuthor}
                          regionLabel={resolveRegion(item)}
                          href={item.affiliateUrl}
                          onRemove={() => removeItemFromDay(tripId, day.id, item.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
          {trip.basics.length === 0 ? (
            <EmptyState
              icon={Plus}
              title="Sin básicos todavía"
              description="Añade ofertas desde la pestaña Descuentos de tus fuentes."
              className="py-10"
            />
          ) : (
            <div className="flex flex-col">
              {basicCategoryOrder
                .map((cat) => ({ cat, list: trip.basics.filter((b) => b.category === cat) }))
                .filter((s) => s.list.length > 0)
                .map(({ cat, list }, sectionIndex) => (
                  <div
                    key={cat}
                    className={cn(
                      "flex flex-col gap-3",
                      sectionIndex > 0 && "mt-0 border-t border-border/50 pt-6",
                    )}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {BASIC_LABELS[cat]}
                    </p>
                    <ul className="m-0 flex list-none flex-col gap-3 p-0">
                      {list.map((b) => (
                        <li key={b.id} className="m-0 p-0">
                          <TravelItemCard
                            variant="basic-planned"
                            title={b.name}
                            category={b.category}
                            sourceAuthor={b.sourceAuthor}
                            vendor={b.vendor}
                            href={b.affiliateUrl}
                            onRemove={() => removeBasicFromTrip(tripId, b.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DayItineraryTimeline({
  items,
  resolveRegion,
  onRemoveItem,
  canMoveItemUp,
  canMoveItemDown,
  onMoveItemUp,
  onMoveItemDown,
}: {
  items: UserDayItem[]
  resolveRegion: (item: UserDayItem) => string | null
  onRemoveItem: (itemId: string) => void
  canMoveItemUp: (itemId: string) => boolean
  canMoveItemDown: (itemId: string) => boolean
  onMoveItemUp: (itemId: string) => void
  onMoveItemDown: (itemId: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const firstLiRef = useRef<HTMLLIElement | null>(null)
  const lastLiRef = useRef<HTMLLIElement | null>(null)
  const [line, setLine] = useState({ top: 0, height: 0 })

  const itemIds = useMemo(() => items.map((i) => i.id).join("\0"), [items])

  // Altura de la línea vertical entre el centro del primer y último punto; depende de layout y de ResizeObserver.
  const measure = useCallback(() => {
    const w = wrapRef.current
    const a = firstLiRef.current
    const b = lastLiRef.current
    if (!w || !a || !b) return
    const wr = w.getBoundingClientRect()
    const ar = a.getBoundingClientRect()
    const br = b.getBoundingClientRect()
    const y1 = ar.top - wr.top + ar.height / 2
    const y2 = br.top - wr.top + br.height / 2
    setLine({ top: y1, height: Math.max(0, y2 - y1) })
  }, [itemIds, items.length])

  useLayoutEffect(() => {
    measure()
  }, [measure, itemIds])

  useLayoutEffect(() => {
    const w = wrapRef.current
    if (!w) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(w)
    window.addEventListener("resize", measure)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [measure])

  const n = items.length
  const showLine = n > 1 && line.height > 0.5

  return (
    <div ref={wrapRef} className="relative pl-0">
      {showLine && (
        <div
          className="pointer-events-none absolute left-2.5 z-0 w-px bg-border"
          style={{ top: line.top, height: line.height }}
          aria-hidden
        />
      )}
      <ul className="relative z-[1] m-0 list-none space-y-2.5 p-0">
        {items.map((item, index) => (
          <li
            key={item.id}
            ref={(el) => {
              if (index === 0) firstLiRef.current = el
              if (index === n - 1) lastLiRef.current = el
            }}
            className="flex min-h-0 items-center gap-3"
          >
            <div className="z-10 flex w-5 shrink-0 items-center justify-center" aria-hidden>
              <div
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-card",
                  ITEM_COLORS[item.type].dot,
                )}
              />
            </div>
            <TravelItemCard
              className="min-w-0 flex-1"
              variant="planned"
              title={item.name}
              type={item.type}
              sourceAuthor={item.sourceAuthor}
              regionLabel={resolveRegion(item)}
              href={item.affiliateUrl}
              onRemove={() => onRemoveItem(item.id)}
              moveControls={
                <div className="flex w-8 flex-col items-center justify-center gap-0.5">
                  {canMoveItemUp(item.id) ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onMoveItemUp(item.id)
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Mover ítem hacia arriba"
                    >
                      <ChevronUp className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                  ) : null}
                  {canMoveItemDown(item.id) ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onMoveItemDown(item.id)
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Mover ítem hacia abajo"
                    >
                      <ChevronDown className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                  ) : null}
                </div>
              }
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function DaySection({
  tripId,
  dayId,
  dayIndex,
  dayCount,
  dayDescription,
  dayDateLabel,
  items,
  resolveRegion,
  isDaySelected,
  onDaySelectChange,
  onRemoveItem,
  canMoveItemUp,
  canMoveItemDown,
  onMoveItemUp,
  onMoveItemDown,
}: {
  tripId: string
  dayId: string
  dayIndex: number
  dayCount: number
  dayDescription: string
  dayDateLabel: string | null
  items: UserDayItem[]
  resolveRegion: (item: UserDayItem) => string | null
  isDaySelected: boolean
  onDaySelectChange: (checked: boolean) => void
  onRemoveItem: (itemId: string) => void
  canMoveItemUp: (itemId: string) => boolean
  canMoveItemDown: (itemId: string) => boolean
  onMoveItemUp: (itemId: string) => void
  onMoveItemDown: (itemId: string) => void
}) {
  const { updateDayLabel } = useTrips()
  const [editingDescription, setEditingDescription] = useState(false)
  const [draft, setDraft] = useState(dayDescription)
  const inputRef = useRef<HTMLInputElement>(null)
  const descriptionEditorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editingDescription) setDraft(dayDescription)
  }, [dayDescription, editingDescription])

  useEffect(() => {
    if (editingDescription) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [editingDescription])

  // Guarda la descripción al pinchar fuera del control (equivalente a aceptar), en fase capture.
  useEffect(() => {
    if (!editingDescription) return

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (descriptionEditorRef.current?.contains(target)) return
      commitDescription()
    }

    document.addEventListener("pointerdown", handlePointerDownOutside, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside, true)
    }
  }, [editingDescription, draft, tripId, dayId])

  const commitDescription = () => {
    const trimmed = draft.trim()
    updateDayLabel(tripId, dayId, trimmed)
    setEditingDescription(false)
  }

  const cancelDescription = () => {
    setDraft(dayDescription)
    setEditingDescription(false)
  }

  const startEdit = () => {
    setDraft(dayDescription)
    setEditingDescription(true)
  }

  const headingForAria = formatDayHeadingLine(dayIndex, dayDescription, dayDateLabel)
  const normalizedDesc = dayDescription.trim() ? normalizeDayLabel(dayDescription) : null

  return (
    <div className="mb-7 last:mb-0">
      <div className="mb-3 flex min-w-0 items-center gap-2.5">
        <div className="flex shrink-0 items-center" onPointerDown={(e) => e.stopPropagation()}>
          <Checkbox
            id={`day-select-${dayId}`}
            checked={isDaySelected}
            onCheckedChange={(c) => onDaySelectChange(c === true)}
            className="size-4"
            disabled={dayCount === 1}
            aria-label={
              dayCount === 1
                ? "No puedes marcar el único día"
                : `Marcar ${headingForAria} para eliminar`
            }
          />
        </div>
        <div ref={descriptionEditorRef} className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5">
          <span className="shrink-0 text-[15px] font-semibold tabular-nums leading-tight">Día {dayIndex + 1}</span>
          {dayDateLabel ? (
            <>
              <span className="shrink-0 text-[15px] text-muted-foreground" aria-hidden>
                ·
              </span>
              <span className="shrink-0 text-[15px] font-medium tabular-nums leading-tight text-muted-foreground">
                {dayDateLabel}
              </span>
            </>
          ) : null}
          <span className="shrink-0 text-[15px] text-muted-foreground" aria-hidden>
            ·
          </span>
          {editingDescription ? (
            <>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    commitDescription()
                  }
                  if (e.key === "Escape") {
                    e.preventDefault()
                    cancelDescription()
                  }
                }}
                className="min-w-0 flex-1 border-b border-primary bg-transparent py-0.5 text-[15px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/60"
                placeholder="Descripción del día"
                aria-label="Descripción del día"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-foreground/80 hover:text-foreground"
                onClick={commitDescription}
                aria-label="Guardar descripción"
              >
                <Check className="h-4 w-4" strokeWidth={2.2} />
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className={cn(
                "min-w-0 flex-1 cursor-pointer select-none text-left text-[15px] leading-tight",
                "rounded-sm ring-offset-2 transition-colors",
                "hover:bg-muted/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                normalizedDesc
                  ? "font-semibold text-foreground"
                  : "font-medium text-muted-foreground",
              )}
              aria-label={normalizedDesc ? "Editar descripción del día" : "Añadir descripción del día"}
            >
              {normalizedDesc ?? "Sin descripción"}
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/20 py-5 text-center text-sm text-muted-foreground/80">
          Añade elementos desde Fuentes
        </div>
      ) : (
        <DayItineraryTimeline
          items={items}
          resolveRegion={resolveRegion}
          onRemoveItem={onRemoveItem}
          canMoveItemUp={canMoveItemUp}
          canMoveItemDown={canMoveItemDown}
          onMoveItemUp={onMoveItemUp}
          onMoveItemDown={onMoveItemDown}
        />
      )}
    </div>
  )
}
