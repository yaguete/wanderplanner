"use client"

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SegmentedControl } from "@/components/segmented-control"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  buildCalendarGrid,
  calendarBadgeLabel,
  calendarDayAriaLabel,
  clipBadges,
  densityFor,
  monthBadgeCap,
  initialAnchorISO,
  shiftAnchor,
  weekdayHeader,
  type CalendarCell,
  type CalendarDensity,
  type CalendarScale,
} from "@/lib/itinerary-calendar"
import { ITEM_DOT_COLORS, ITEM_LABELS } from "@/lib/item-styles"
import { formatDayDate, toISODate } from "@/lib/trip-dates"
import { cn } from "@/lib/utils"
import type { UserDay, UserDayItem } from "@/types/itinerary"

export type RouteViewMode = "list" | "calendar" | "map"

const ROUTE_VIEW_KEY = "wp-route-view"
const CALENDAR_SCALE_KEY = "wp-calendar-scale"

const SCALE_ITEMS = [
  { id: "month" as const, label: "Mes" },
  { id: "week" as const, label: "Semana" },
] as const

const WEEKDAYS = weekdayHeader()

/** Preferencia Lista / Calendario / Mapa. Seguro en SSR. */
export function readStoredRouteView(): RouteViewMode {
  if (typeof window === "undefined") return "list"
  try {
    const v = localStorage.getItem(ROUTE_VIEW_KEY)
    if (v === "calendar" || v === "map" || v === "list") return v
    return "list"
  } catch {
    return "list"
  }
}

export function persistRouteView(mode: RouteViewMode): void {
  try {
    localStorage.setItem(ROUTE_VIEW_KEY, mode)
  } catch {
    // ignore
  }
}

function readStoredCalendarScale(): CalendarScale {
  if (typeof window === "undefined") return "month"
  try {
    const v = localStorage.getItem(CALENDAR_SCALE_KEY)
    return v === "week" ? "week" : "month"
  } catch {
    return "month"
  }
}

function persistCalendarScale(scale: CalendarScale): void {
  try {
    localStorage.setItem(CALENDAR_SCALE_KEY, scale)
  } catch {
    // ignore
  }
}

function useFinePointer(): boolean {
  const [fine, setFine] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia("(hover: hover) and (pointer: fine)")
    const sync = () => setFine(mql.matches)
    sync()
    mql.addEventListener("change", sync)
    return () => mql.removeEventListener("change", sync)
  }, [])
  return fine
}

function useCalendarDensity() {
  const ref = useRef<HTMLDivElement>(null)
  const [density, setDensity] = useState<CalendarDensity>(() =>
    densityFor(typeof window === "undefined" ? DENSITY_FALLBACK : 800),
  )
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const apply = (width: number) => {
      const next = densityFor(width)
      setDensity((prev) =>
        prev.badges === next.badges &&
        prev.cap === next.cap &&
        prev.weekLayout === next.weekLayout
          ? prev
          : next,
      )
    }
    apply(node.getBoundingClientRect().width)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w != null) apply(w)
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [])
  return { rootRef: ref, density }
}

const DENSITY_FALLBACK = 800

function itemsForCell(days: UserDay[], cell: CalendarCell): UserDayItem[] {
  if (cell.dayIndex == null) return []
  return days[cell.dayIndex]?.items ?? []
}

function dayIdForCell(days: UserDay[], cell: CalendarCell): string | null {
  if (cell.dayIndex == null) return null
  return days[cell.dayIndex]?.id ?? null
}

export const ItineraryCalendarView = memo(function ItineraryCalendarView({
  startDate,
  numDays,
  days,
  onEditTrip,
  onOpenDay,
}: {
  startDate: string | null
  numDays: number
  days: UserDay[]
  onEditTrip?: () => void
  onOpenDay: (dayId: string) => void
}) {
  const { rootRef, density } = useCalendarDensity()
  const finePointer = useFinePointer()
  const todayISO = useMemo(() => toISODate(new Date()), [])
  const [scale, setScale] = useState<CalendarScale>("month")
  const [anchorISO, setAnchorISO] = useState(() =>
    initialAnchorISO({ scale: "month", startDate, numDays, todayISO }),
  )

  useEffect(() => {
    const stored = readStoredCalendarScale()
    queueMicrotask(() => {
      if (stored !== "month") setScale(stored)
    })
  }, [])

  const handleScaleChange = useCallback((next: CalendarScale) => {
    setScale(next)
    persistCalendarScale(next)
  }, [])

  const grid = useMemo(
    () =>
      buildCalendarGrid({
        scale,
        anchorISO,
        startDate,
        numDays,
        todayISO,
      }),
    [scale, anchorISO, startDate, numDays, todayISO],
  )

  const goTodayTrip = useCallback(() => {
    setAnchorISO(initialAnchorISO({ scale, startDate, numDays, todayISO }))
  }, [scale, startDate, numDays, todayISO])

  const hasDates = startDate != null && numDays >= 1
  const weekColumns = scale === "week" && density.weekLayout === "columns"
  const weekRows = scale === "week" && density.weekLayout === "rows"

  return (
    <div
      ref={rootRef}
      className="@container flex min-h-0 flex-1 flex-col"
      role="group"
      aria-label="Calendario del viaje"
    >
      <div className="flex shrink-0 items-center gap-2 pb-2">
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={scale === "month" ? "Mes anterior" : "Semana anterior"}
            onClick={() => setAnchorISO((iso) => shiftAnchor(iso, scale, -1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <p
            className="min-w-0 flex-1 truncate text-center text-sm font-medium tabular-nums"
            aria-live="polite"
          >
            {grid.caption}
          </p>
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={scale === "month" ? "Mes siguiente" : "Semana siguiente"}
            onClick={() => setAnchorISO((iso) => shiftAnchor(iso, scale, 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <SegmentedControl
          items={SCALE_ITEMS}
          value={scale}
          onValueChange={handleScaleChange}
          ariaLabel="Escala del calendario"
          size="compact"
          className="w-fit shrink-0 [&_button]:flex-none"
        />
      </div>

      {hasDates && !grid.intersectsTrip ? (
        <div className="flex shrink-0 justify-center pb-2">
          <button
            type="button"
            onClick={goTodayTrip}
            className="rounded-md border border-border/80 bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
          >
            Ir al viaje
          </button>
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {weekRows ? (
          <WeekRows
            weeks={grid.weeks}
            days={days}
            density={density}
            finePointer={finePointer}
            onOpenDay={onOpenDay}
            interactive={hasDates}
          />
        ) : weekColumns ? (
          <WeekColumns
            week={grid.weeks[0] ?? []}
            days={days}
            density={density}
            finePointer={finePointer}
            onOpenDay={onOpenDay}
            interactive={hasDates}
          />
        ) : (
          <MonthGrid
            weeks={grid.weeks}
            days={days}
            density={density}
            finePointer={finePointer}
            onOpenDay={onOpenDay}
            interactive={hasDates}
          />
        )}

        {!hasDates ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80 px-6 text-center text-sm text-muted-foreground backdrop-blur-[1px]">
            <p className="m-0 font-medium text-foreground">
              Este viaje aún no tiene fechas
            </p>
            <p className="m-0 max-w-sm">
              El calendario sitúa cada día del viaje en su fecha real. Añade la
              fecha de inicio y aparecerá aquí.
            </p>
            {onEditTrip ? (
              <button
                type="button"
                className="rounded-md border border-border/80 bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                onClick={onEditTrip}
              >
                Añadir fechas
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
})

function WeekdayRow({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <div
      className="grid grid-cols-7 gap-0.5"
      aria-hidden={ariaHidden ? true : undefined}
    >
      {WEEKDAYS.map((d) => (
        <div
          key={d}
          className="px-0.5 pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {d}
        </div>
      ))}
    </div>
  )
}

function MonthGrid({
  weeks,
  days,
  density,
  finePointer,
  onOpenDay,
  interactive,
}: {
  weeks: CalendarCell[][]
  days: UserDay[]
  density: CalendarDensity
  finePointer: boolean
  onOpenDay: (dayId: string) => void
  interactive: boolean
}) {
  const n = Math.max(weeks.length, 1)
  const gridRef = useRef<HTMLDivElement>(null)
  const [cellHeight, setCellHeight] = useState(0)
  useEffect(() => {
    const node = gridRef.current
    if (!node) return
    const apply = () => {
      const h = node.getBoundingClientRect().height
      setCellHeight(n > 0 ? h / n : 0)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(node)
    return () => ro.disconnect()
  }, [n])
  const cap = monthBadgeCap(density.cap, cellHeight)
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      aria-hidden={!interactive ? true : undefined}
    >
      <WeekdayRow ariaHidden />
      <div
        ref={gridRef}
        className="grid min-h-0 flex-1 grid-cols-1 gap-0.5"
        style={{ gridTemplateRows: `repeat(${n}, minmax(3.5rem, 1fr))` }}
      >
        {weeks.map((week) => (
          <div key={week[0]?.iso} className="grid min-h-0 grid-cols-7 gap-0.5">
            {week.map((cell) => (
              <DayCell
                key={cell.iso}
                cell={cell}
                days={days}
                density={density}
                cap={cap}
                finePointer={finePointer}
                onOpenDay={onOpenDay}
                interactive={interactive}
                layout="month"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function WeekColumns({
  week,
  days,
  density,
  finePointer,
  onOpenDay,
  interactive,
}: {
  week: CalendarCell[]
  days: UserDay[]
  density: CalendarDensity
  finePointer: boolean
  onOpenDay: (dayId: string) => void
  interactive: boolean
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      aria-hidden={!interactive ? true : undefined}
    >
      <WeekdayRow ariaHidden />
      <div className="grid min-h-0 flex-1 grid-cols-7 gap-0.5">
        {week.map((cell) => (
          <DayCell
            key={cell.iso}
            cell={cell}
            days={days}
            density={density}
            finePointer={finePointer}
            onOpenDay={onOpenDay}
            interactive={interactive}
            layout="week-columns"
          />
        ))}
      </div>
    </div>
  )
}

function WeekRows({
  weeks,
  days,
  density,
  finePointer,
  onOpenDay,
  interactive,
}: {
  weeks: CalendarCell[][]
  days: UserDay[]
  density: CalendarDensity
  finePointer: boolean
  onOpenDay: (dayId: string) => void
  interactive: boolean
}) {
  const cells = weeks[0] ?? []
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
      aria-hidden={!interactive ? true : undefined}
    >
      {cells.map((cell) => (
        <DayCell
          key={cell.iso}
          cell={cell}
          days={days}
          density={density}
          finePointer={finePointer}
          onOpenDay={onOpenDay}
          interactive={interactive}
          layout="week-rows"
        />
      ))}
    </div>
  )
}

function DayCell({
  cell,
  days,
  density,
  cap: capOverride,
  finePointer,
  onOpenDay,
  interactive,
  layout,
}: {
  cell: CalendarCell
  days: UserDay[]
  density: CalendarDensity
  cap?: number
  finePointer: boolean
  onOpenDay: (dayId: string) => void
  interactive: boolean
  layout: "month" | "week-columns" | "week-rows"
}) {
  const inTrip = cell.dayIndex != null && interactive
  const items = inTrip ? itemsForCell(days, cell) : []
  const dayId = inTrip ? dayIdForCell(days, cell) : null
  const uncapped = layout === "week-columns"
  const cap = capOverride ?? density.cap
  const { shown, overflow } = clipBadges(
    items,
    uncapped ? Number.POSITIVE_INFINITY : cap,
  )
  const hidden = overflow > 0 ? items.slice(shown.length) : []
  const badgeMode = density.badges
  const dateNum = Number(cell.iso.slice(8, 10))
  const openList = () => {
    if (dayId) onOpenDay(dayId)
  }
  const aria = inTrip
    ? calendarDayAriaLabel({
        dayIndex: cell.dayIndex!,
        iso: cell.iso,
        itemCount: items.length,
      })
    : undefined

  const inTripBand = cell.dayIndex != null && interactive

  const shell = cn(
    "flex min-h-0 min-w-0 flex-col p-1 text-left",
    layout === "week-rows" ? "flex-row items-start gap-2 px-2 py-1.5" : "h-full",
    layout === "week-columns" || layout === "month" ? "overflow-hidden" : null,
    inTripBand && "bg-muted",
    layout === "week-rows"
      ? cn(cell.isTripStart && "rounded-t-md", cell.isTripEnd && "rounded-b-md")
      : cn(cell.isRangeStart && "rounded-l-md", cell.isRangeEnd && "rounded-r-md"),
    inTrip && "hover:bg-muted/80",
  )

  const numberClass = cn(
    "inline-flex size-6 shrink-0 items-center justify-center text-xs tabular-nums",
    cell.isToday
      ? "rounded-full bg-pink-500 font-medium text-white"
      : inTrip
        ? "font-medium text-foreground"
        : cell.inMonth
          ? "text-muted-foreground"
          : "text-muted-foreground/50",
  )

  const numberEl = (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className={numberClass} aria-current={cell.isToday ? "date" : undefined}>
        {dateNum}
      </span>
      {cell.isToday ? (
        <span className="hidden text-[10px] font-medium leading-none text-pink-500 md:inline">Hoy</span>
      ) : null}
    </span>
  )

  const overflowEl =
    overflow > 0 ? (
      finePointer && inTrip ? (
        <DayOverflow overflow={overflow} hiddenItems={hidden} onOpenDay={openList} />
      ) : (
        <span className="flex h-4 shrink-0 items-center px-0.5 text-[10px] font-medium tabular-nums leading-none text-muted-foreground">
          +{overflow}
        </span>
      )
    ) : null

  const badgeItems = shown.map((item) => (
    <ItemBadge
      key={item.id}
      item={item}
      mode={badgeMode}
      showTooltip={finePointer && inTrip}
      onOpen={finePointer ? openList : undefined}
    />
  ))

  const badges =
    layout === "month" ? (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-0.5">
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
          {badgeItems}
        </div>
        {overflowEl}
      </div>
    ) : (
      <div
        className={cn(
          "flex min-h-0 min-w-0 gap-0.5",
          layout === "week-rows"
            ? "flex-1 flex-row flex-wrap content-start"
            : "flex-col overflow-y-auto",
        )}
      >
        {badgeItems}
        {overflowEl}
      </div>
    )

  if (!inTrip) {
    return (
      <div className={shell} aria-hidden>
        {layout === "week-rows" ? (
          <>
            <RowDayLabel iso={cell.iso} number={numberEl} />
            <div className="min-w-0 flex-1" />
          </>
        ) : (
          numberEl
        )}
      </div>
    )
  }

  if (!finePointer) {
    return (
      <DayPopover items={items} cell={cell} onOpenDay={openList}>
        <button type="button" className={cn(shell, "w-full")} aria-label={aria}>
          {layout === "week-rows" ? (
            <>
              <RowDayLabel iso={cell.iso} number={numberEl} />
              {badges}
            </>
          ) : (
            <>
              {numberEl}
              {badges}
            </>
          )}
        </button>
      </DayPopover>
    )
  }

  return (
    <div className={shell}>
      {layout === "week-rows" ? (
        <>
          <button
            type="button"
            onClick={openList}
            aria-label={aria}
            className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RowDayLabel iso={cell.iso} number={numberEl} />
          </button>
          {badges}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={openList}
            aria-label={aria}
            className="shrink-0 self-start rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {numberEl}
          </button>
          {badges}
        </>
      )}
    </div>
  )
}

function RowDayLabel({
  iso,
  number,
}: {
  iso: string
  number: ReactNode
}) {
  const weekday = WEEKDAYS[isoWeekdayMon0(iso)]
  return (
    <div className="flex min-w-[4.5rem] shrink-0 items-center gap-1.5 pt-0.5">
      {number}
      <span className="text-[11px] text-muted-foreground">{weekday}</span>
    </div>
  )
}

/** Lunes = 0. Componentes locales, no UTC. */
function isoWeekdayMon0(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return 0
  const js = new Date(y, m - 1, d).getDay()
  return (js + 6) % 7
}

function ItemBadge({
  item,
  mode,
  showTooltip,
  onOpen,
}: {
  item: UserDayItem
  mode: "dots" | "text"
  showTooltip: boolean
  onOpen?: () => void
}) {
  const label = calendarBadgeLabel(item)
  const inner = (
    <span
      className={cn(
        "inline-flex h-4 max-w-full min-w-0 items-center gap-1 rounded-sm border border-border bg-muted",
        mode === "text" ? "px-1" : "px-0.5",
      )}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", ITEM_DOT_COLORS[item.type])}
        aria-hidden
      />
      {mode === "text" ? (
        <span className="min-w-0 truncate text-[10px] leading-tight text-foreground">
          {label}
        </span>
      ) : null}
    </span>
  )

  if (!showTooltip) return inner

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          aria-label={item.name}
          className="inline-flex h-4 max-w-full min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {inner}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <p className="m-0 text-[10px] text-muted-foreground">
          {ITEM_LABELS[item.type]}
        </p>
        <p className="m-0 font-medium">{item.name}</p>
      </TooltipContent>
    </Tooltip>
  )
}

function DayOverflow({
  overflow,
  hiddenItems,
  onOpenDay,
}: {
  overflow: number
  hiddenItems: UserDayItem[]
  onOpenDay: () => void
}) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpenDay}
          className="flex h-4 shrink-0 items-center self-start rounded-sm px-0.5 text-[10px] font-medium tabular-nums leading-none text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Ver ${overflow} más`}
        >
          +{overflow}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-h-64 max-w-xs overflow-y-auto text-xs">
        <ul className="flex flex-col gap-1.5">
          {hiddenItems.map((item) => (
            <li key={item.id}>
              <p className="m-0 text-[10px] text-muted-foreground">
                {ITEM_LABELS[item.type]}
              </p>
              <p className="m-0 font-medium">{item.name}</p>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

function DayPopover({
  items,
  cell,
  onOpenDay,
  children,
}: {
  items: UserDayItem[]
  cell: CalendarCell
  onOpenDay: () => void
  children: React.ReactNode
}) {
  const dateLabel = formatDayDate(cell.iso)
  const heading =
    cell.dayIndex != null
      ? `Día ${cell.dayIndex + 1}${dateLabel ? ` · ${dateLabel}` : ""}`
      : dateLabel
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-3"
        collisionPadding={{ bottom: 80, top: 8, left: 8, right: 8 }}
      >
        <p className="m-0 text-xs font-medium text-foreground">{heading}</p>
        {items.length === 0 ? (
          <p className="mt-2 m-0 text-xs text-muted-foreground">Sin ítems este día.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {items.map((item) => (
              <li key={item.id} className="flex min-w-0 items-start gap-1.5">
                <span
                  className={cn(
                    "mt-1 size-1.5 shrink-0 rounded-full",
                    ITEM_DOT_COLORS[item.type],
                  )}
                  aria-hidden
                />
                <span className="min-w-0 text-xs leading-snug">
                  <span className="text-[10px] text-muted-foreground">
                    {ITEM_LABELS[item.type]}
                  </span>
                  <span className="block text-foreground">{item.name}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={onOpenDay}
          className="mt-3 w-full rounded-md border border-border/80 bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          Abrir en Lista
        </button>
      </PopoverContent>
    </Popover>
  )
}
