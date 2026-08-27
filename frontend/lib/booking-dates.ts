/**
 * Añade checkin/checkout a un enlace de Booking del bloguero. No persiste,
 * no toca el aid ni otros params, no aplica a otros hosts.
 */
import { dateISOForDayIndex, toISODate } from "@/lib/trip-dates"
import { clipSpanToTrip, parseSpanDays } from "@/lib/item-span"
import { taskKeyForItem } from "@/lib/trip-tasks"
import type { UserDay, UserDayItem } from "@/types/itinerary"

function todayISO(): string {
  return toISODate(new Date())
}

function isBookingHostname(host: string): boolean {
  const h = host.toLowerCase()
  return (
    h === "booking.com" ||
    h.endsWith(".booking.com") ||
    h === "booking.es" ||
    h.endsWith(".booking.es")
  )
}

export function isBookingStayUrl(href: string | null | undefined): boolean {
  if (!href?.trim()) return false
  try {
    return isBookingHostname(new URL(href).hostname)
  } catch {
    return false
  }
}

/** Días cubiertos por el alojamiento (apariciones reales + `spanDays`). */
export function stayDayIndexesForItem(
  days: UserDay[],
  item: Pick<UserDayItem, "type" | "name" | "route" | "spanDays" | "id">,
): number[] {
  if (item.type !== "stay") return []
  const key = taskKeyForItem(item)
  const numDays = days.length
  const set = new Set<number>()
  for (let i = 0; i < days.length; i++) {
    for (const it of days[i]!.items) {
      if (it.type !== "stay" || taskKeyForItem(it) !== key) continue
      set.add(i)
      const span = parseSpanDays(it.spanDays)
      if (span == null) continue
      const total = clipSpanToTrip(i, span, numDays)
      for (let k = 1; k < total; k++) {
        const idx = i + k
        if (idx < numDays) set.add(idx)
      }
    }
  }
  return [...set].sort((a, b) => a - b)
}

export function stayDatesFromDayIndexes(
  startDate: string | null,
  dayIndexes: readonly number[],
): { checkin: string; checkout: string } | null {
  if (!startDate || dayIndexes.length === 0) return null
  const unique = [...new Set(dayIndexes.filter((i) => Number.isFinite(i) && i >= 0))]
  if (unique.length === 0) return null
  const min = Math.min(...unique)
  const nights = unique.length
  const checkin = dateISOForDayIndex(startDate, min)
  const checkout = dateISOForDayIndex(startDate, min + nights)
  if (!checkin || !checkout || checkout <= checkin) return null
  return { checkin, checkout }
}

/**
 * Misma URL (aid, label, hash…). Solo pisa `checkin` y `checkout` si es
 * Booking, hay fechas y el check-in no es pasado.
 */
export function withBookingStayDates(
  href: string | null | undefined,
  checkin: string | null,
  checkout: string | null,
): string | null {
  if (href == null || href === "") return href ?? null
  if (!checkin || !checkout) return href
  if (checkout <= checkin) return href
  if (checkin < todayISO()) return href
  if (!isBookingStayUrl(href)) return href
  try {
    const url = new URL(href)
    url.searchParams.set("checkin", checkin)
    url.searchParams.set("checkout", checkout)
    return url.toString()
  } catch {
    return href
  }
}

export function bookingStayHref(params: {
  href: string | null | undefined
  startDate: string | null
  dayIndexes: readonly number[]
}): string | null {
  const dates = stayDatesFromDayIndexes(params.startDate, params.dayIndexes)
  return withBookingStayDates(
    params.href,
    dates?.checkin ?? null,
    dates?.checkout ?? null,
  )
}
