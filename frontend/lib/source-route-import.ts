import { MAX_AUTO_DAYS } from "@/lib/partner-trip"
import type { Source, SourceItem, UserDay, UserDayItem } from "@/types/itinerary"

export type SourceRouteImportPlan = {
  /** 0-based → ítems de la fuente a concatenar, en el orden de la ruta. */
  additions: { dayIndex: number; items: SourceItem[] }[]
  addedCount: number
  skippedExisting: number
  skippedPastCap: number
  daysToCreate: number
}

export type SourceRouteImportResult = {
  days: UserDay[]
  addedCount: number
  skippedExisting: number
  skippedPastCap: number
  daysCreated: number
}

/** Ítems de la pestaña Ruta: todo lo extraído salvo desplazamientos. */
export function sourceRouteItems(source: Pick<Source, "items">): SourceItem[] {
  return source.items.filter((item) => item.type !== "transport")
}

/** Día 1 de la fuente → índice 0. Sin `dayHint` (saco plano) → día 1. */
export function sourceItemDayIndex(item: Pick<SourceItem, "dayHint">): number {
  const hint = item.dayHint
  if (hint == null || !Number.isFinite(hint) || hint < 1) return 0
  return Math.floor(hint) - 1
}

/**
 * True si todos los ítems de un día de la fuente ya están en el día
 * correspondiente del viaje (día N → índice N−1; sin pista → día 1).
 */
export function isSourceDayCompleteOnTrip(
  days: readonly { items: { sourceItemId: string }[] }[],
  sourceDay: number | null,
  items: readonly Pick<SourceItem, "id">[],
): boolean {
  if (!items.length) return true
  const index =
    sourceDay == null || !Number.isFinite(sourceDay) || sourceDay < 1
      ? 0
      : Math.floor(sourceDay) - 1
  const tripDay = days[index]
  if (!tripDay) return false
  const present = new Set(tripDay.items.map((item) => item.sourceItemId))
  return items.every((item) => present.has(item.id))
}

/**
 * Qué copiar de la ruta de una fuente al plan del usuario.
 * No mueve ni borra ítems ya presentes (cualquier día, por `sourceItemId`).
 * Si hace falta, pide días extra al final para que el día N de la fuente
 * quepa en el día N del viaje; nunca recorta los días que ya tenía el usuario.
 */
export function planSourceRouteImport(
  days: readonly { items: { sourceItemId: string }[] }[],
  sourceItems: readonly SourceItem[],
  maxDays: number = MAX_AUTO_DAYS,
): SourceRouteImportPlan {
  const present = new Set<string>()
  for (const day of days) {
    for (const item of day.items) present.add(item.sourceItemId)
  }

  const growCap = Math.max(days.length, Math.max(1, maxDays))
  const byDay = new Map<number, SourceItem[]>()
  let skippedExisting = 0
  let skippedPastCap = 0

  for (const item of sourceItems) {
    if (present.has(item.id)) {
      skippedExisting += 1
      continue
    }
    const dayIndex = sourceItemDayIndex(item)
    if (dayIndex >= growCap) {
      skippedPastCap += 1
      continue
    }
    present.add(item.id)
    const bucket = byDay.get(dayIndex)
    if (bucket) bucket.push(item)
    else byDay.set(dayIndex, [item])
  }

  const additions = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayIndex, items]) => ({ dayIndex, items }))

  const addedCount = additions.reduce((n, group) => n + group.items.length, 0)
  let daysToCreate = 0
  if (additions.length > 0) {
    const required = Math.max(...additions.map((g) => g.dayIndex)) + 1
    daysToCreate = Math.max(0, required - days.length)
  }

  return {
    additions,
    addedCount,
    skippedExisting,
    skippedPastCap,
    daysToCreate,
  }
}

export function applySourceRouteImport(
  days: UserDay[],
  sourceItems: readonly SourceItem[],
  toUserItem: (item: SourceItem) => UserDayItem,
  opts?: {
    maxDays?: number
    makeEmptyDay?: () => UserDay
  },
): SourceRouteImportResult {
  const plan = planSourceRouteImport(days, sourceItems, opts?.maxDays)
  if (plan.addedCount === 0 && plan.daysToCreate === 0) {
    return {
      days,
      addedCount: 0,
      skippedExisting: plan.skippedExisting,
      skippedPastCap: plan.skippedPastCap,
      daysCreated: 0,
    }
  }

  const makeEmptyDay =
    opts?.makeEmptyDay ??
    (() => ({ id: crypto.randomUUID(), label: "", items: [] as UserDayItem[] }))

  const next: UserDay[] = days.map((day) => ({ ...day, items: [...day.items] }))
  for (let i = 0; i < plan.daysToCreate; i++) next.push(makeEmptyDay())

  for (const group of plan.additions) {
    const day = next[group.dayIndex]
    if (!day) continue
    day.items.push(...group.items.map(toUserItem))
  }

  return {
    days: next,
    addedCount: plan.addedCount,
    skippedExisting: plan.skippedExisting,
    skippedPastCap: plan.skippedPastCap,
    daysCreated: plan.daysToCreate,
  }
}
