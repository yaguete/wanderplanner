import { addDays, differenceInCalendarDays, isValid, parseISO } from "date-fns"

const fmtDayMonth = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" })
const fmtMonth = new Intl.DateTimeFormat("es-ES", { month: "short" })

function parseYMD(s: string | null): Date | null {
  if (!s) return null
  const d = parseISO(s)
  return isValid(d) ? d : null
}

function shortMonth(d: Date): string {
  return fmtMonth.format(d).replace(/[.,]$/, "")
}

/**
 * "12–17 sep 2026" / "12 sep – 3 oct 2026" / "14 sept 2026" (un solo día);
 * null sin rango completo.
 */
export function formatTripDates(
  startISO: string | null,
  endISO: string | null,
): string | null {
  const a = parseYMD(startISO)
  const b = parseYMD(endISO)
  if (!a) return null
  if (!b) return null
  if (a.getTime() > b.getTime()) return null

  const yA = a.getFullYear()
  const yB = b.getFullYear()
  const mA = a.getMonth()
  const mB = b.getMonth()
  const sameDay = a.getTime() === b.getTime()
  const sameMonth = mA === mB && yA === yB

  if (sameDay) {
    return `${a.getDate()} ${shortMonth(a)} ${yA}`
  }
  if (sameMonth) {
    return `${a.getDate()}–${b.getDate()} ${shortMonth(b)} ${yB}`
  }
  if (yA === yB) {
    return `${a.getDate()} ${shortMonth(a)} – ${b.getDate()} ${shortMonth(b)} ${yB}`
  }
  return `${fmtDayMonth.format(a)} ${yA} – ${fmtDayMonth.format(b)} ${yB}`
}

/** Sustituto de shortTripDateLabel: "sep. 2026" a partir de la fecha de inicio. */
export function formatTripMonthYear(startISO: string | null): string | null {
  const a = parseYMD(startISO)
  if (!a) return null
  return `${shortMonth(a)}. ${a.getFullYear()}`
}

/** Día del itinerario: "14 sept" (sin año); null si falta o es inválida. */
export function formatDayDate(iso: string | null): string | null {
  const a = parseYMD(iso)
  if (!a) return null
  return `${a.getDate()} ${shortMonth(a)}`
}

/** Días de calendario del rango inclusive; null si faltan fechas o rango inválido. */
export function daysBetweenInclusive(
  startISO: string | null,
  endISO: string | null,
): number | null {
  const a = parseYMD(startISO)
  const b = parseYMD(endISO)
  if (!a || !b) return null
  if (a.getTime() > b.getTime()) return null
  return differenceInCalendarDays(b, a) + 1
}

/**
 * Fin inclusive: start + (numDays − 1).
 * 14 sept + 7 días → 20 sept (no 21).
 */
export function endDateFromStartAndNumDays(
  startISO: string | null,
  numDays: number,
): string | null {
  const a = parseYMD(startISO)
  if (!a || !Number.isFinite(numDays) || numDays < 1) return null
  return toISODate(addDays(a, numDays - 1))
}

/** ISO del día en índice 0-based a partir de startDate. */
export function dateISOForDayIndex(
  startISO: string | null,
  dayIndex0: number,
): string | null {
  const a = parseYMD(startISO)
  if (!a || dayIndex0 < 0 || !Number.isFinite(dayIndex0)) return null
  return toISODate(addDays(a, dayIndex0))
}

/** YYYY-MM-DD de mañana en zona local del navegador. */
export function tomorrowISO(): string {
  return toISODate(addDays(new Date(), 1))
}

/** Rango a ISO; útil al seleccionar en el picker (Date inicio, Date fin). */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
