/**
 * Resolución de propuestas del asistente contra el viaje actual.
 * El modelo emite ids del briefing; aquí se traduce a mutaciones de `trip-context`.
 */
import type { UserDay, UserDayItem } from "@/types/itinerary"

export type LocatedDayItem = {
  day: UserDay
  dayIndex: number
  item: UserDayItem
  itemIndex: number
}

export function locateDayItem(
  days: readonly UserDay[],
  itemId: string,
  name?: string | null,
): LocatedDayItem | null {
  const id = itemId.trim()
  if (id) {
    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
      const day = days[dayIndex]!
      const itemIndex = day.items.findIndex((item) => item.id === id)
      if (itemIndex < 0) continue
      return { day, dayIndex, item: day.items[itemIndex]!, itemIndex }
    }
  }
  const needle = name?.trim().toLocaleLowerCase("es")
  if (!needle) return null
  const matches: LocatedDayItem[] = []
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = days[dayIndex]!
    day.items.forEach((item, itemIndex) => {
      if (item.name.trim().toLocaleLowerCase("es") === needle) {
        matches.push({ day, dayIndex, item, itemIndex })
      }
    })
  }
  return matches.length === 1 ? matches[0]! : null
}

export type MoveItemProposal = {
  item_id: string
  to_day_id: string
  name?: string | null
  why?: string | null
}

export type ResolvedMoveItem =
  | {
      ok: true
      fromDayId: string
      toDayId: string
      itemId: string
      toIndex: number
      name: string
      fromDayNumber: number
      toDayNumber: number
    }
  | { ok: false; reason: "item_missing" | "day_missing" }

/**
 * Traduce una propuesta de movimiento a `moveItemBetweenDays`.
 * Sin índice explícito, el ítem va al final del día destino.
 */
export function resolveMoveItem(
  days: readonly UserDay[],
  proposal: MoveItemProposal,
): ResolvedMoveItem {
  const located = locateDayItem(days, proposal.item_id, proposal.name)
  if (!located) return { ok: false, reason: "item_missing" }

  const toDayId = proposal.to_day_id.trim()
  const toDayIndex = days.findIndex((d) => d.id === toDayId)
  if (toDayIndex < 0) return { ok: false, reason: "day_missing" }

  const toDay = days[toDayIndex]!
  const sameDay = located.day.id === toDay.id
  const toIndex = sameDay ? located.day.items.length - 1 : toDay.items.length

  return {
    ok: true,
    fromDayId: located.day.id,
    toDayId: toDay.id,
    itemId: located.item.id,
    toIndex,
    name: located.item.name,
    fromDayNumber: located.dayIndex + 1,
    toDayNumber: toDayIndex + 1,
  }
}

/** Rellena nombre y números de día para la tarjeta, sin mutar el viaje. */
export function snapshotMoveProposal(
  days: readonly UserDay[],
  proposal: MoveItemProposal,
): MoveItemProposal & {
  from_day_id?: string
  from_day_number?: number
  to_day_number?: number
  name: string
} {
  const resolved = resolveMoveItem(days, proposal)
  if (!resolved.ok) {
    return {
      ...proposal,
      name: proposal.name?.trim() || "Ítem",
    }
  }
  return {
    ...proposal,
    name: resolved.name,
    from_day_id: resolved.fromDayId,
    from_day_number: resolved.fromDayNumber,
    to_day_number: resolved.toDayNumber,
  }
}
