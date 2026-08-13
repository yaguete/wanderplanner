/**
 * Ámbito del mapa: viaje entero o un día concreto.
 * Puro: sin I/O. `dayNumber` es 1-based, igual que en los colectores de geometría.
 */
export type DayScope = number | null

/** null si el id no existe (día borrado / viaje distinto) → el ámbito se auto-sana. */
export function dayScopeFromId(days: { id: string }[], dayId: string | null): DayScope {
  if (dayId == null) return null
  const idx = days.findIndex((d) => d.id === dayId)
  return idx < 0 ? null : idx + 1
}

export function inDayScope(scope: DayScope, dayNumber: number): boolean {
  return scope == null || dayNumber === scope
}

export function filterByDayScope<T>(
  items: T[],
  scope: DayScope,
  getDayNumber: (item: T) => number = (item) => (item as { dayNumber: number }).dayNumber,
): T[] {
  if (scope == null) return items
  return items.filter((item) => getDayNumber(item) === scope)
}

/** Único sitio donde se permite cortar `days` (solo para collectTransportDistances). */
export function daysForScope<T>(days: T[], scope: DayScope): T[] {
  if (scope == null) return days
  const day = days[scope - 1]
  return day == null ? [] : [day]
}

/** Ítems mapeables por día. Los días vacíos no aparecen (el consumidor usa `?? 0`). */
export function mappableCountsByDay(items: { dayNumber: number }[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const item of items) {
    counts.set(item.dayNumber, (counts.get(item.dayNumber) ?? 0) + 1)
  }
  return counts
}
