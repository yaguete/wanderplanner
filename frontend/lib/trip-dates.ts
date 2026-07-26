import { differenceInCalendarDays, isValid, parseISO } from "date-fns"

const fmtDayMonth = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" })
const fmtMonth = new Intl.DateTimeFormat("es-ES", { month: "short" })
const fmtYear = new Intl.DateTimeFormat("es-ES", { year: "numeric" })

function parseYMD(s: string | null): Date | null {
  if (!s) return null
  const d = parseISO(s)
  return isValid(d) ? d : null
}

/**
 * "12–17 sep 2026" / "12 sep – 3 oct 2026"; null sin rango completo.
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
  const sameMonth = mA === mB && yA === yB

  if (sameMonth) {
    return `${a.getDate()}–${b.getDate()} ${fmtMonth.format(b)} ${yB}`
  }
  if (yA === yB) {
    return `${a.getDate()} ${fmtMonth.format(a)} – ${b.getDate()} ${fmtMonth.format(b)} ${yB}`
  }
  return `${fmtDayMonth.format(a)} ${yA} – ${fmtDayMonth.format(b)} ${yB}`
}

/** Sustituto de shortTripDateLabel: "sep. 2026" a partir de la fecha de inicio. */
export function formatTripMonthYear(startISO: string | null): string | null {
  const a = parseYMD(startISO)
  if (!a) return null
  const m = a.toLocaleString("es-ES", { month: "short" })
  return `${m.replace(/[.,]$/, "")}. ${a.getFullYear()}`
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

/** Rango a ISO; útil al seleccionar en el picker (Date inicio, Date fin). */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
