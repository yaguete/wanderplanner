/**
 * Plan recortado para el resumen de «Compartir». Puro: sin I/O.
 *
 * ❌ No reutilizar `buildTripBriefing`: ese briefing mete costes, presupuesto,
 * afiliados, coordenadas e HTML. La defensa de «cero dinero» es no enviarlo.
 */
import type { ItemType, Source, Trip, UserDay, UserDayItem } from "@/types/itinerary"
import { stripNullChars } from "@/lib/day-summary"
import { MANUAL_SOURCE_ID, itemProvenanceLabel } from "@/lib/item-provenance"

export const SHARE_MAX_DAYS = 30
export const SHARE_MAX_ITEMS_PER_DAY = 8
export const SHARE_MAX_SOURCES = 5
const FIELD_MAX = 120

export type SharePlanItem = {
  type: ItemType
  name: string
  region: string | null
  route: { from: string; to: string; mode: string | null } | null
  via: string | null
}

export type SharePlanDay = {
  index: number
  label: string | null
  items: SharePlanItem[]
}

export type SharePlanSource = {
  title: string
  author: string
  url: string
}

export type SharePlanPayload = {
  trip_name: string
  countries: string[]
  start_date: string | null
  num_days: number
  origin: string | null
  days: SharePlanDay[]
  sources: SharePlanSource[]
}

function clip(value: string, max = FIELD_MAX): string {
  const text = stripNullChars(value).trim()
  if (text.length <= max) return text
  return text.slice(0, max).trim()
}

function clipOrNull(value: string | null | undefined): string | null {
  if (value == null) return null
  const text = clip(value)
  return text || null
}

function itemRoute(item: UserDayItem): SharePlanItem["route"] {
  const route = item.route
  if (!route) return null
  const from = clip(route.from?.label ?? "")
  const to = clip(route.to?.label ?? "")
  if (!from && !to) return null
  return {
    from,
    to,
    mode: route.mode ?? null,
  }
}

function itemVia(item: UserDayItem): string | null {
  if (item.sourceId === MANUAL_SOURCE_ID) return null
  const label = itemProvenanceLabel(item)
  return clipOrNull(label)
}

function mapItem(item: UserDayItem): SharePlanItem {
  return {
    type: item.type,
    name: clip(item.name) || "Sin nombre",
    region: clipOrNull(item.region),
    route: itemRoute(item),
    via: itemVia(item),
  }
}

function mapDay(day: UserDay, index: number): SharePlanDay {
  return {
    index,
    label: clipOrNull(day.label),
    items: day.items.slice(0, SHARE_MAX_ITEMS_PER_DAY).map(mapItem),
  }
}

function groupedTail(days: UserDay[], fromIndex: number): SharePlanDay {
  const start = fromIndex + 1
  const end = days.length
  const items: SharePlanItem[] = []
  for (let i = fromIndex; i < days.length && items.length < SHARE_MAX_ITEMS_PER_DAY; i++) {
    for (const item of days[i]!.items) {
      if (items.length >= SHARE_MAX_ITEMS_PER_DAY) break
      items.push(mapItem(item))
    }
  }
  return {
    index: start,
    label: `Días ${start}-${end}`,
    items,
  }
}

export function tripHasShareablePlan(trip: Trip): boolean {
  return trip.days.some((d) => d.items.length > 0)
}

export function buildSharePlan(trip: Trip, sources: Source[]): SharePlanPayload {
  const numDays = trip.days.length > 0 ? trip.days.length : Math.max(1, trip.numDays ?? 1)
  const rawDays = trip.days
  let days: SharePlanDay[]
  if (rawDays.length <= SHARE_MAX_DAYS) {
    days = rawDays.map((d, i) => mapDay(d, i + 1))
  } else {
    const head = rawDays.slice(0, SHARE_MAX_DAYS - 1).map((d, i) => mapDay(d, i + 1))
    days = [...head, groupedTail(rawDays, SHARE_MAX_DAYS - 1)]
  }

  const planSources: SharePlanSource[] = sources.slice(0, SHARE_MAX_SOURCES).map((s) => ({
    title: clip(s.title) || clip(s.url) || "Fuente",
    author: clip(s.author) || "autor",
    url: clip(s.url, 500),
  }))

  return {
    trip_name: clip(trip.name) || "Viaje",
    countries: (trip.countries ?? []).slice(0, 12).map((c) => clip(c, 8)).filter(Boolean),
    start_date: trip.startDate,
    num_days: numDays,
    origin: clipOrNull(trip.origin?.label),
    days,
    sources: planSources,
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const keys = Object.keys(value as object).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`
}

/** FNV-1a 32-bit en hex. No es un secreto: solo huella estable del payload. */
function fnv1aHex(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

export function sharePlanSignature(payload: SharePlanPayload): string {
  return fnv1aHex(stableStringify(payload))
}
