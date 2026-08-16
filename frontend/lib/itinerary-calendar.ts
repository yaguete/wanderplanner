import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import type { UserDayItem } from "@/types/itinerary"
import { dateISOForDayIndex, formatTripDates, toISODate } from "@/lib/trip-dates"

export type CalendarScale = "month" | "week"

export type CalendarDensity = {
  badges: "dots" | "text"
  cap: number
  weekLayout: "rows" | "columns"
}

export type CalendarCell = {
  iso: string
  dayIndex: number | null
  inMonth: boolean
  isToday: boolean
  isTripStart: boolean
  isTripEnd: boolean
  isRangeStart: boolean
  isRangeEnd: boolean
}

export type CalendarGrid = {
  scale: CalendarScale
  anchorISO: string
  caption: string
  weeks: CalendarCell[][]
  intersectsTrip: boolean
}

const WEEK_STARTS_ON = 1 as const
/** Alineado con `@md` de container queries (28rem). */
export const DENSITY_MD_PX = 448
/**
 * Umbral «ancho»: semana en columnas y 3 badges de texto.
 * 640 px (no 768) para que un panel de ~777 px con `px-4` (~745 de calendario)
 * reciba el layout ancho; `@3xl` (768) no llegaría nunca en ese caso.
 */
export const DENSITY_WIDE_PX = 640

const fmtWeekdayShort = new Intl.DateTimeFormat("es-ES", { weekday: "short" })
const fmtWeekdayLong = new Intl.DateTimeFormat("es-ES", { weekday: "long" })
const fmtMonthLong = new Intl.DateTimeFormat("es-ES", { month: "long" })
const fmtDayMonthLong = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
})

function parseYMD(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = parseISO(s)
  return isValid(d) ? d : null
}

function stripTrailingPunct(s: string): string {
  return s.replace(/[.,]$/, "")
}

function mondayOf(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: WEEK_STARTS_ON })
}

function sundayOf(d: Date): Date {
  return endOfWeek(d, { weekStartsOn: WEEK_STARTS_ON })
}

/** Índice 0-based en `trip.days`, o null si `iso` cae fuera del viaje. */
export function dayIndexForISO(
  startDate: string | null,
  numDays: number,
  iso: string,
): number | null {
  if (!startDate || !Number.isFinite(numDays) || numDays < 1) return null
  const start = parseYMD(startDate)
  const day = parseYMD(iso)
  if (!start || !day) return null
  const diff = differenceInCalendarDays(day, start)
  if (diff < 0 || diff >= numDays) return null
  return diff
}

function monthCaption(anchor: Date): string {
  return `${stripTrailingPunct(fmtMonthLong.format(anchor))} ${anchor.getFullYear()}`
}

export function weekdayHeader(): string[] {
  const monday = parseISO("2026-01-05")
  return Array.from({ length: 7 }, (_, i) =>
    stripTrailingPunct(fmtWeekdayShort.format(addDays(monday, i))),
  )
}

export function calendarDayAriaDate(iso: string): string {
  const d = parseYMD(iso)
  if (!d) return iso
  return fmtDayMonthLong.format(d)
}

export function calendarWeekdayLong(iso: string): string {
  const d = parseYMD(iso)
  if (!d) return ""
  return fmtWeekdayLong.format(d)
}

export function calendarDayAriaLabel(p: {
  dayIndex: number
  iso: string
  itemCount: number
}): string {
  const items = p.itemCount === 1 ? "1 ítem" : `${p.itemCount} ítems`
  return `Día ${p.dayIndex + 1}, ${calendarDayAriaDate(p.iso)}, ${items}`
}

export function densityFor(panelWidthPx: number): CalendarDensity {
  if (!Number.isFinite(panelWidthPx) || panelWidthPx < DENSITY_MD_PX) {
    return { badges: "dots", cap: 4, weekLayout: "rows" }
  }
  if (panelWidthPx < DENSITY_WIDE_PX) {
    return { badges: "text", cap: 2, weekLayout: "rows" }
  }
  return { badges: "text", cap: 3, weekLayout: "columns" }
}

/**
 * Padding de celda mes (`p-1` = 8px) + número del día (`size-6` = 24px).
 * El resto del alto son huecos de badge (ítems y, si cabe, "+n").
 */
export const MONTH_CELL_CHROME_PX = 32
/** Alto de un badge de texto + `gap-0.5`. */
export const BADGE_SLOT_PX = 18

/** Tope de huecos visuales en mes: el de densidad, recortado al alto real de la celda. */
export function monthBadgeCap(widthCap: number, cellHeightPx: number): number {
  if (!Number.isFinite(widthCap) || widthCap <= 0) return 0
  if (!Number.isFinite(cellHeightPx) || cellHeightPx <= 0) return widthCap
  const slots = Math.max(
    1,
    Math.floor((cellHeightPx - MONTH_CELL_CHROME_PX) / BADGE_SLOT_PX),
  )
  return Math.min(widthCap, slots)
}

/**
 * Recorta a `cap` huecos visuales. Si hay más ítems que `cap`, el último
 * hueco queda para «+n» (`shown` tiene como máximo `cap - 1` ítems).
 */
export function clipBadges<T>(
  items: T[],
  cap: number,
): { shown: T[]; overflow: number } {
  if (cap === Infinity || items.length <= cap) {
    return { shown: items, overflow: 0 }
  }
  if (cap <= 0) return { shown: [], overflow: items.length }
  const shownCount = cap - 1
  return { shown: items.slice(0, shownCount), overflow: items.length - shownCount }
}

function shortPlace(label: string): string {
  const comma = label.indexOf(",")
  const raw = comma === -1 ? label : label.slice(0, comma)
  return raw.trim()
}

export function calendarBadgeLabel(
  item: Pick<UserDayItem, "name" | "route">,
): string {
  if (item.route) return `→ ${shortPlace(item.route.to.label)}`
  return item.name
}

export function initialAnchorISO(p: {
  scale: CalendarScale
  startDate: string | null
  numDays: number
  todayISO: string
}): string {
  if (!p.startDate || p.numDays < 1) return p.todayISO
  return dayIndexForISO(p.startDate, p.numDays, p.todayISO) != null
    ? p.todayISO
    : p.startDate
}

export function shiftAnchor(
  anchorISO: string,
  scale: CalendarScale,
  dir: -1 | 1,
): string {
  const d = parseYMD(anchorISO)
  if (!d) return anchorISO
  const next = scale === "month" ? addMonths(d, dir) : addWeeks(d, dir)
  return toISODate(next)
}

function buildCell(p: {
  date: Date
  month: number
  todayISO: string
  startDate: string | null
  numDays: number
  weekday: number
}): CalendarCell {
  const iso = toISODate(p.date)
  const dayIndex = dayIndexForISO(p.startDate, p.numDays, iso)
  const inTrip = dayIndex != null
  const lastIndex = p.numDays >= 1 ? p.numDays - 1 : -1
  const isTripStart = inTrip && dayIndex === 0
  const isTripEnd = inTrip && dayIndex === lastIndex
  return {
    iso,
    dayIndex,
    inMonth: p.date.getMonth() === p.month,
    isToday: iso === p.todayISO,
    isTripStart,
    isTripEnd,
    isRangeStart: inTrip && (isTripStart || p.weekday === 0),
    isRangeEnd: inTrip && (isTripEnd || p.weekday === 6),
  }
}

function cellsForRange(p: {
  from: Date
  to: Date
  month: number
  todayISO: string
  startDate: string | null
  numDays: number
}): CalendarCell[] {
  const cells: CalendarCell[] = []
  let cursor = p.from
  let weekday = 0
  while (cursor.getTime() <= p.to.getTime()) {
    cells.push(
      buildCell({
        date: cursor,
        month: p.month,
        todayISO: p.todayISO,
        startDate: p.startDate,
        numDays: p.numDays,
        weekday,
      }),
    )
    cursor = addDays(cursor, 1)
    weekday = (weekday + 1) % 7
  }
  return cells
}

function chunkWeeks(cells: CalendarCell[]): CalendarCell[][] {
  const weeks: CalendarCell[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return weeks
}

export function buildCalendarGrid(p: {
  scale: CalendarScale
  anchorISO: string
  startDate: string | null
  numDays: number
  todayISO: string
}): CalendarGrid {
  const anchor = parseYMD(p.anchorISO) ?? parseYMD(p.todayISO)
  if (!anchor) {
    return {
      scale: p.scale,
      anchorISO: p.anchorISO,
      caption: p.anchorISO,
      weeks: [],
      intersectsTrip: false,
    }
  }

  const numDays = Number.isFinite(p.numDays) ? p.numDays : 0
  const month = anchor.getMonth()

  if (p.scale === "week") {
    const from = mondayOf(anchor)
    const to = sundayOf(anchor)
    const weeks = [
      cellsForRange({
        from,
        to,
        month,
        todayISO: p.todayISO,
        startDate: p.startDate,
        numDays,
      }),
    ]
    const weekStartISO = toISODate(from)
    const weekEndISO = toISODate(to)
    return {
      scale: "week",
      anchorISO: p.anchorISO,
      caption: formatTripDates(weekStartISO, weekEndISO) ?? weekStartISO,
      weeks,
      intersectsTrip: weeks[0]!.some((c) => c.dayIndex != null),
    }
  }

  const from = mondayOf(startOfMonth(anchor))
  const to = sundayOf(endOfMonth(anchor))
  const cells = cellsForRange({
    from,
    to,
    month,
    todayISO: p.todayISO,
    startDate: p.startDate,
    numDays,
  })
  const weeks = chunkWeeks(cells)
  return {
    scale: "month",
    anchorISO: p.anchorISO,
    caption: monthCaption(anchor),
    weeks,
    intersectsTrip: cells.some((c) => c.dayIndex != null),
  }
}

/** Comprueba que el mapa día→fecha sale de `days.length`, no de `endDate`. */
export function isoByDayIndex(
  startDate: string | null,
  dayCount: number,
): (string | null)[] {
  return Array.from({ length: dayCount }, (_, i) =>
    dateISOForDayIndex(startDate, i),
  )
}
