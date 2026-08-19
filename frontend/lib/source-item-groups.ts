import type { SourceItem } from "@/types/itinerary"

export type SourceItemDayGroup = {
  day: number | null
  items: SourceItem[]
}

/** Agrupa ítems de una fuente por `dayHint`. Sin pistas de día → un solo saco `day: null`. */
export function groupItemsByDayHint(items: SourceItem[]): SourceItemDayGroup[] {
  if (!items.length) return []
  const hasDays = items.some((i) => i.dayHint != null)
  if (!hasDays) return [{ day: null, items }]

  const groups: SourceItemDayGroup[] = []
  let currentDay: number | null = null
  let currentGroup: SourceItem[] = []

  for (const item of items) {
    if (item.dayHint !== currentDay) {
      if (currentGroup.length) groups.push({ day: currentDay, items: currentGroup })
      currentDay = item.dayHint
      currentGroup = [item]
    } else {
      currentGroup.push(item)
    }
  }
  if (currentGroup.length) groups.push({ day: currentDay, items: currentGroup })
  return groups
}
