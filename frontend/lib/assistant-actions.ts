/**
 * Resolución de propuestas del asistente contra el viaje actual.
 * El modelo emite ids del briefing; aquí se traduce a mutaciones de `trip-context`.
 */
import type {
  ItemType,
  RouteMode,
  Source,
  SourceRouteHint,
  Trip,
  TripTaskCategory,
  UserBasicItem,
  UserDay,
  UserDayItem,
} from "@/types/itinerary"
import type { AssistantAction } from "@/lib/assistant-api"
import { formatLegName, isRouteLegItem, isRouteMode } from "@/lib/route-legs"
import {
  ASSISTANT_SOURCE_ID,
  userBasicItemFromSource,
  userDayItemFromSource,
} from "@/lib/item-provenance"
import { sanitizeAffiliateUrl } from "@/lib/affiliate-url"
import { buildAssistantBookingSearchUrl, stayReserveHref } from "@/lib/booking-search"
import { partnerCtaLabel } from "@/lib/item-discovery-links"
import { buildTripTasks, taskKeyForItem } from "@/lib/trip-tasks"
import type { MoveParams } from "@/lib/itinerary-dnd"
import type { OutboundAffiliate } from "@/lib/funnel-analytics"

export type LocatedDayItem = {
  day: UserDay
  dayIndex: number
  item: UserDayItem
  itemIndex: number
}

export type MoveAnchorPosition = "before" | "after"

const TASK_CATEGORIES: readonly TripTaskCategory[] = [
  "accommodation",
  "transport",
  "activity",
  "food",
  "basic",
  "paperwork",
  "health",
  "other",
]

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
  anchor_item_id?: string | null
  position?: MoveAnchorPosition | null
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
      fromIndex: number
    }
  | { ok: false; reason: "item_missing" | "day_missing" | "leg_locked" }

function targetItemsWithoutMover(
  days: readonly UserDay[],
  fromDayId: string,
  toDayId: string,
  itemId: string,
): UserDayItem[] {
  const toDay = days.find((d) => d.id === toDayId)
  if (!toDay) return []
  if (fromDayId === toDayId) {
    return toDay.items.filter((i) => i.id !== itemId)
  }
  return [...toDay.items]
}

function toIndexForAnchor(
  target: readonly UserDayItem[],
  anchorItemId: string | null | undefined,
  position: MoveAnchorPosition | null | undefined,
): number {
  const anchorId = anchorItemId?.trim()
  if (!anchorId) return target.length
  const anchorIx = target.findIndex((i) => i.id === anchorId)
  if (anchorIx < 0) return target.length
  return position === "after" ? anchorIx + 1 : anchorIx
}

/**
 * Traduce una propuesta de movimiento a `moveItemBetweenDays`.
 * Sin ancla, el ítem va al final del día destino.
 */
export function resolveMoveItem(
  days: readonly UserDay[],
  proposal: MoveItemProposal,
): ResolvedMoveItem {
  const located = locateDayItem(days, proposal.item_id, proposal.name)
  if (!located) return { ok: false, reason: "item_missing" }
  if (isRouteLegItem(located.item)) return { ok: false, reason: "leg_locked" }

  const toDayId = proposal.to_day_id.trim()
  const toDayIndex = days.findIndex((d) => d.id === toDayId)
  if (toDayIndex < 0) return { ok: false, reason: "day_missing" }

  const target = targetItemsWithoutMover(days, located.day.id, toDayId, located.item.id)
  const toIndex = toIndexForAnchor(target, proposal.anchor_item_id, proposal.position)

  return {
    ok: true,
    fromDayId: located.day.id,
    toDayId,
    itemId: located.item.id,
    toIndex,
    name: located.item.name,
    fromDayNumber: located.dayIndex + 1,
    toDayNumber: toDayIndex + 1,
    fromIndex: located.itemIndex,
  }
}

/** Copia de `moveItemBetweenDays` sobre un array de días (para simular el swap). */
export function applyMoveToDays(
  days: readonly UserDay[],
  params: MoveParams,
): UserDay[] {
  const { fromDayId, toDayId, itemId, toIndex } = params
  const fromDay = days.find((d) => d.id === fromDayId)
  const toDay = days.find((d) => d.id === toDayId)
  if (!fromDay || !toDay) return days.map((d) => d)

  const fromIndex = fromDay.items.findIndex((i) => i.id === itemId)
  if (fromIndex < 0) return days.map((d) => d)

  const movingItem = fromDay.items[fromIndex]!
  const sourceItems = [...fromDay.items]
  sourceItems.splice(fromIndex, 1)

  const sameDay = fromDayId === toDayId
  const targetBase = sameDay ? sourceItems : [...toDay.items]
  const safeIndex = Math.max(0, Math.min(toIndex, targetBase.length))
  const targetItems = [...targetBase]
  targetItems.splice(safeIndex, 0, movingItem)

  return days.map((d) => {
    if (d.id === fromDayId && d.id === toDayId) return { ...d, items: targetItems }
    if (d.id === fromDayId) return { ...d, items: sourceItems }
    if (d.id === toDayId) return { ...d, items: targetItems }
    return d
  })
}

function toMoveParams(resolved: Extract<ResolvedMoveItem, { ok: true }>): MoveParams {
  return {
    fromDayId: resolved.fromDayId,
    toDayId: resolved.toDayId,
    itemId: resolved.itemId,
    toIndex: resolved.toIndex,
  }
}

export type ResolvedSwapItems =
  | {
      ok: true
      moves: [MoveParams, MoveParams]
      nameA: string
      nameB: string
      dayNumberA: number
      dayNumberB: number
    }
  | { ok: false; reason: "item_missing" | "leg_locked" }

export function resolveSwapItems(
  days: readonly UserDay[],
  itemIdA: string,
  itemIdB: string,
  nameA?: string | null,
  nameB?: string | null,
): ResolvedSwapItems {
  const locA = locateDayItem(days, itemIdA, nameA)
  const locB = locateDayItem(days, itemIdB, nameB)
  if (!locA || !locB) return { ok: false, reason: "item_missing" }
  if (isRouteLegItem(locA.item) || isRouteLegItem(locB.item)) {
    return { ok: false, reason: "leg_locked" }
  }
  if (locA.item.id === locB.item.id) return { ok: false, reason: "item_missing" }

  const first = resolveMoveItem(days, {
    item_id: locA.item.id,
    to_day_id: locB.day.id,
    anchor_item_id: locB.item.id,
    position: "before",
  })
  if (!first.ok) return { ok: false, reason: first.reason === "leg_locked" ? "leg_locked" : "item_missing" }

  const afterFirst = applyMoveToDays(days, toMoveParams(first))
  const locBAfterFirst = locateDayItem(afterFirst, locB.item.id)
  if (!locBAfterFirst) return { ok: false, reason: "item_missing" }

  const secondParams: MoveParams = {
    fromDayId: locBAfterFirst.day.id,
    toDayId: locA.day.id,
    itemId: locB.item.id,
    toIndex: locA.itemIndex,
  }

  const moved = applyMoveToDays(afterFirst, secondParams)
  const locBAfter = locateDayItem(moved, locB.item.id)
  if (!locBAfter) return { ok: false, reason: "item_missing" }

  return {
    ok: true,
    moves: [toMoveParams(first), secondParams],
    nameA: locA.item.name,
    nameB: locB.item.name,
    dayNumberA: locA.dayIndex + 1,
    dayNumberB: locB.dayIndex + 1,
  }
}

export type ResolvedRemoveItem =
  | {
      ok: true
      dayId: string
      item: UserDayItem
      index: number
      dayNumber: number
      costAtRisk: number | null
      taskKey: string
    }
  | { ok: false; reason: "item_missing" | "leg_locked" }

export function resolveRemoveItem(
  trip: Pick<Trip, "days" | "tasks">,
  itemId: string,
  name?: string | null,
): ResolvedRemoveItem {
  const located = locateDayItem(trip.days, itemId, name)
  if (!located) return { ok: false, reason: "item_missing" }
  if (isRouteLegItem(located.item)) return { ok: false, reason: "leg_locked" }
  const taskKey = taskKeyForItem(located.item)
  const costAtRisk = trip.tasks[taskKey]?.cost ?? null
  return {
    ok: true,
    dayId: located.day.id,
    item: located.item,
    index: located.itemIndex,
    dayNumber: located.dayIndex + 1,
    costAtRisk,
    taskKey,
  }
}

export type ResolvedConsolidate =
  | {
      ok: true
      dayId: string
      dayNumber: number
      item: UserDayItem
      sourceTitle: string
    }
  | { ok: false; reason: "source_missing" | "item_missing" | "day_missing" | "duplicate" }

export function resolveConsolidateSourceItem(
  trip: Pick<Trip, "days">,
  sources: readonly Source[],
  sourceId: string,
  sourceItemId: string,
  dayId: string,
): ResolvedConsolidate {
  const source = sources.find((s) => s.id === sourceId.trim())
  if (!source) return { ok: false, reason: "source_missing" }
  const srcItem = source.items.find((i) => i.id === sourceItemId.trim())
  if (!srcItem) return { ok: false, reason: "item_missing" }
  const dayIndex = trip.days.findIndex((d) => d.id === dayId.trim())
  if (dayIndex < 0) return { ok: false, reason: "day_missing" }
  const day = trip.days[dayIndex]!
  if (day.items.some((i) => i.sourceItemId === srcItem.id)) {
    return { ok: false, reason: "duplicate" }
  }
  return {
    ok: true,
    dayId: day.id,
    dayNumber: dayIndex + 1,
    item: userDayItemFromSource(srcItem, source),
    sourceTitle: source.author || source.title,
  }
}

export type ResolvedAddBasic =
  | { ok: true; basic: UserBasicItem; sourceTitle: string }
  | { ok: false; reason: "source_missing" | "item_missing" | "duplicate" }

export function resolveAddSourceBasic(
  trip: Pick<Trip, "basics">,
  sources: readonly Source[],
  sourceId: string,
  sourceBasicId: string,
): ResolvedAddBasic {
  const source = sources.find((s) => s.id === sourceId.trim())
  if (!source) return { ok: false, reason: "source_missing" }
  const srcBasic = source.basics.find((b) => b.id === sourceBasicId.trim())
  if (!srcBasic) return { ok: false, reason: "item_missing" }
  if (
    trip.basics.some(
      (b) => b.sourceBasicItemId === srcBasic.id && b.sourceId === source.id,
    )
  ) {
    return { ok: false, reason: "duplicate" }
  }
  return {
    ok: true,
    basic: userBasicItemFromSource(srcBasic, source),
    sourceTitle: source.author || source.title,
  }
}

export function parseTaskCategory(raw: string | null | undefined): TripTaskCategory {
  const value = (raw || "").trim()
  return TASK_CATEGORIES.includes(value as TripTaskCategory)
    ? (value as TripTaskCategory)
    : "other"
}

const ITEM_TYPES: readonly ItemType[] = ["transport", "stay", "food", "activity"]

export function buildAssistantDayItem(input: {
  type: string
  name: string
  detail?: string | null
  region?: string | null
  /** Solo recomendaciones nuevas (no `stay`): taquilla, museo, tour. */
  affiliateUrl?: string | null
}): UserDayItem {
  const type: ItemType = ITEM_TYPES.includes(input.type as ItemType)
    ? (input.type as ItemType)
    : "activity"
  const name = input.name.trim()
  const region = input.region?.trim() || null
  const item: UserDayItem = {
    id: crypto.randomUUID(),
    sourceItemId: `assistant-${crypto.randomUUID()}`,
    sourceId: ASSISTANT_SOURCE_ID,
    type,
    name,
    detail: input.detail ?? null,
    sourceAuthor: "Asistente",
    region,
  }
  if (type === "stay") {
    const href = buildAssistantBookingSearchUrl({ name, region })
    if (href) item.affiliateUrl = href
  } else {
    const href = sanitizeAffiliateUrl(input.affiliateUrl)
    if (href) item.affiliateUrl = href
  }
  return item
}

export type AssistantItemPreviewLink = {
  href: string
  label: string
  affiliate: OutboundAffiliate | "auto"
}

function dayIndexFromNumber(dayNumber?: number | null): number {
  if (typeof dayNumber !== "number" || !Number.isFinite(dayNumber) || dayNumber < 1) {
    return 0
  }
  return Math.floor(dayNumber) - 1
}

function previewCtaLabel(href: string, vendor?: string | null): string {
  const label = partnerCtaLabel(href, vendor)
  return label === "Ver reserva" ? "Ver web" : label
}

function sourceItemAffiliate(
  action: Extract<AssistantAction, { kind: "add_item" }>,
  sources: readonly Source[],
): { href: string | null; vendor: string | null } {
  const snap = sanitizeAffiliateUrl(action.affiliate_url)
  const vendor = action.vendor?.trim() || null
  if (snap) return { href: snap, vendor }
  const sourceId = action.source_id?.trim()
  const itemId = action.source_item_id?.trim()
  if (!sourceId || !itemId) return { href: null, vendor }
  const source = sources.find((s) => s.id === sourceId)
  const item = source?.items.find((i) => i.id === itemId)
  return {
    href: sanitizeAffiliateUrl(item?.affiliateUrl),
    vendor: item?.vendor?.trim() || vendor,
  }
}

/**
 * Enlace de la tarjeta de propuesta: el mismo que acabará en Ruta.
 * Fuente → afiliado del bloguero. Stay nuevo → Booking propio.
 * Activity nueva → `url` del modelo (taquilla / web oficial).
 */
export function assistantAddItemPreviewLink(
  action: Extract<AssistantAction, { kind: "add_item" }>,
  sources: readonly Source[],
  paint: {
    startDate: string | null
    currency?: string | null
    numTravelers?: number | null
  },
): AssistantItemPreviewLink | null {
  const type = action.type
  if (type !== "stay" && type !== "activity") return null

  const fromSource = Boolean(action.source_id?.trim() && action.source_item_id?.trim())
  const dayIndex = dayIndexFromNumber(action.day_number)
  const dayIndexes = [dayIndex]

  if (fromSource) {
    const { href: stored, vendor } = sourceItemAffiliate(action, sources)
    if (!stored) return null
    const href =
      type === "stay"
        ? (stayReserveHref({
            type: "stay",
            name: action.name,
            region: action.region,
            affiliateUrl: stored,
            startDate: paint.startDate,
            dayIndexes,
            currency: paint.currency,
            numTravelers: paint.numTravelers,
          }) ?? stored)
        : stored
    return { href, label: previewCtaLabel(href, vendor), affiliate: "partner" }
  }

  if (type === "stay") {
    const href = stayReserveHref({
      type: "stay",
      name: action.name.trim(),
      region: action.region,
      sourceId: ASSISTANT_SOURCE_ID,
      startDate: paint.startDate,
      dayIndexes,
      currency: paint.currency,
      numTravelers: paint.numTravelers,
    })
    if (!href) return null
    return { href, label: previewCtaLabel(href), affiliate: "own" }
  }

  const href = sanitizeAffiliateUrl(action.url)
  if (!href) return null
  return { href, label: previewCtaLabel(href, action.vendor), affiliate: "auto" }
}

export function buildAssistantTransportStub(input: {
  from: string
  to: string
  mode?: string | null
}): UserDayItem {
  const from = input.from.trim()
  const to = input.to.trim()
  const mode: RouteMode | null = isRouteMode(input.mode) ? input.mode : null
  const hint: SourceRouteHint = { from, to, mode }
  return {
    id: crypto.randomUUID(),
    sourceItemId: `assistant-${crypto.randomUUID()}`,
    sourceId: ASSISTANT_SOURCE_ID,
    type: "transport",
    name: formatLegName(from, to),
    detail: null,
    sourceAuthor: "Asistente",
    sourceRouteHint: hint,
  }
}

export type ResolvedSetTaskCost =
  | {
      ok: true
      taskKey: string
      title: string
      cost: number
      previousCost: number | null
    }
  | { ok: false; reason: "task_missing" | "invalid_cost" }

export function resolveSetTaskCost(
  trip: Trip,
  taskRef: string,
  cost: unknown,
): ResolvedSetTaskCost {
  const ref = taskRef.trim()
  if (!ref) return { ok: false, reason: "task_missing" }
  const tasks = buildTripTasks(trip)
  const found = tasks.find((t) => t.id === ref)
  if (!found) return { ok: false, reason: "task_missing" }
  const num = typeof cost === "number" ? cost : Number(cost)
  if (!Number.isFinite(num) || num < 0) return { ok: false, reason: "invalid_cost" }
  return {
    ok: true,
    taskKey: found.id,
    title: found.title,
    cost: num,
    previousCost: found.state?.cost ?? null,
  }
}

export function inverseMoveParams(
  applied: MoveParams,
  originalFromIndex: number,
): MoveParams {
  return {
    fromDayId: applied.toDayId,
    toDayId: applied.fromDayId,
    itemId: applied.itemId,
    toIndex: originalFromIndex,
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

export function actionDedupeKey(action: AssistantAction): string {
  switch (action.kind) {
    case "add_source":
      return `add_source:${action.url}`
    case "add_item":
      return `add_item:${action.day_id}:${action.source_item_id ?? action.name}:${action.source_id ?? ""}`
    case "move_item":
      return `move_item:${action.item_id}:${action.to_day_id}:${action.anchor_item_id ?? ""}:${action.position ?? ""}`
    case "swap_items":
      return `swap_items:${[action.item_id_a, action.item_id_b].sort().join(":")}`
    case "remove_item":
      return `remove_item:${action.item_id}`
    case "add_transport":
      return `add_transport:${action.day_id}:${action.from}:${action.to}`
    case "add_extra_task":
      return `add_extra_task:${action.title}:${action.category}`
    case "add_basic":
      return `add_basic:${action.source_id}:${action.source_basic_id}`
    case "set_task_cost":
      return `set_task_cost:${action.task_ref}`
  }
}

export function snapshotAssistantAction(
  trip: Trip,
  sources: readonly Source[],
  action: AssistantAction,
): AssistantAction {
  if (action.kind === "move_item") {
    return { ...action, ...snapshotMoveProposal(trip.days, action) }
  }
  if (action.kind === "swap_items") {
    const resolved = resolveSwapItems(
      trip.days,
      action.item_id_a,
      action.item_id_b,
      action.name_a,
      action.name_b,
    )
    if (!resolved.ok) return action
    return {
      ...action,
      name_a: resolved.nameA,
      name_b: resolved.nameB,
      day_number_a: resolved.dayNumberA,
      day_number_b: resolved.dayNumberB,
    }
  }
  if (action.kind === "remove_item") {
    const resolved = resolveRemoveItem(trip, action.item_id, action.name)
    if (!resolved.ok) return action
    return {
      ...action,
      name: resolved.item.name,
      day_number: resolved.dayNumber,
      cost_at_risk: resolved.costAtRisk,
    }
  }
  if (action.kind === "add_item") {
    const dayIndex = trip.days.findIndex((d) => d.id === action.day_id.trim())
    const day_number = dayIndex >= 0 ? dayIndex + 1 : action.day_number
    if (action.source_id && action.source_item_id) {
      const resolved = resolveConsolidateSourceItem(
        trip,
        sources,
        action.source_id,
        action.source_item_id,
        action.day_id,
      )
      if (!resolved.ok) return { ...action, day_number }
      return {
        ...action,
        name: resolved.item.name,
        type: resolved.item.type,
        source_author: resolved.sourceTitle,
        day_number: resolved.dayNumber,
        affiliate_url: resolved.item.affiliateUrl ?? null,
        vendor: resolved.item.vendor ?? null,
        url: null,
      }
    }
    return { ...action, day_number }
  }
  if (action.kind === "add_basic") {
    const resolved = resolveAddSourceBasic(
      trip,
      sources,
      action.source_id,
      action.source_basic_id,
    )
    if (!resolved.ok) return action
    return {
      ...action,
      name: resolved.basic.name,
      source_author: resolved.sourceTitle,
    }
  }
  if (action.kind === "set_task_cost") {
    const resolved = resolveSetTaskCost(trip, action.task_ref, action.cost)
    if (!resolved.ok) return action
    return {
      ...action,
      task_title: resolved.title,
      previous_cost: resolved.previousCost,
    }
  }
  if (action.kind === "add_transport") {
    const dayIndex = trip.days.findIndex((d) => d.id === action.day_id.trim())
    return {
      ...action,
      day_number: dayIndex >= 0 ? dayIndex + 1 : action.day_number,
    }
  }
  return action
}

const STALE_REASONS = new Set(["item_missing", "day_missing", "source_missing", "duplicate", "task_missing"])

/** True si una propuesta pending ya no se puede aplicar al viaje actual. */
export function isAssistantActionStale(
  trip: Trip,
  sources: readonly Source[],
  action: AssistantAction,
): boolean {
  if (action.kind === "move_item") {
    const resolved = resolveMoveItem(trip.days, action)
    return !resolved.ok && STALE_REASONS.has(resolved.reason)
  }
  if (action.kind === "swap_items") {
    const resolved = resolveSwapItems(
      trip.days,
      action.item_id_a,
      action.item_id_b,
      action.name_a,
      action.name_b,
    )
    return !resolved.ok && resolved.reason === "item_missing"
  }
  if (action.kind === "remove_item") {
    const resolved = resolveRemoveItem(trip, action.item_id, action.name)
    return !resolved.ok && resolved.reason === "item_missing"
  }
  if (action.kind === "add_item") {
    if (action.source_id && action.source_item_id) {
      const resolved = resolveConsolidateSourceItem(
        trip,
        sources,
        action.source_id,
        action.source_item_id,
        action.day_id,
      )
      return !resolved.ok && STALE_REASONS.has(resolved.reason)
    }
    return !trip.days.some((d) => d.id === action.day_id)
  }
  if (action.kind === "add_transport") {
    return !trip.days.some((d) => d.id === action.day_id.trim())
  }
  if (action.kind === "add_basic") {
    const resolved = resolveAddSourceBasic(
      trip,
      sources,
      action.source_id,
      action.source_basic_id,
    )
    return !resolved.ok && STALE_REASONS.has(resolved.reason)
  }
  if (action.kind === "set_task_cost") {
    const resolved = resolveSetTaskCost(trip, action.task_ref, action.cost)
    return !resolved.ok && resolved.reason === "task_missing"
  }
  return false
}
