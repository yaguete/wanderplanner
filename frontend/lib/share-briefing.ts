/**
 * Plan recortado para el resumen de «Compartir». Puro: sin I/O.
 *
 * ❌ No reutilizar `buildTripBriefing`: ese briefing mete costes, presupuesto,
 * afiliados, coordenadas e HTML. La defensa de «cero dinero» es no enviarlo.
 */
import type { ItemType, ShareCard, Source, Trip, UserDay, UserDayItem } from "@/types/itinerary"
import { stripNullChars } from "@/lib/day-summary"
import { isSyntheticSourceId, itemProvenanceLabel } from "@/lib/item-provenance"
import { parseSpanDays } from "@/lib/item-span"

export const SHARE_MAX_DAYS = 30
export const SHARE_MAX_ITEMS_PER_DAY = 8
export const SHARE_MAX_SOURCES = 5
/** A partir de aquí el JSON va en tramos, no día a día: si no, el modelo corta a mitad. */
export const SHARE_GROUP_FROM = 10
export const SHARE_GROUP_SIZE = 3
const FIELD_MAX = 120

export type SharePlanItem = {
  type: ItemType
  name: string
  region: string | null
  /** Noches del stay si `spanDays` ≥ 2. Noches sí, dinero no. */
  nights?: number
  /** Días de una activity con `spanDays` ≥ 2. */
  days?: number
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
  if (isSyntheticSourceId(item.sourceId)) return null
  const label = itemProvenanceLabel(item)
  return clipOrNull(label)
}

function mapItem(item: UserDayItem, cited: Set<string>): SharePlanItem {
  if (!isSyntheticSourceId(item.sourceId)) cited.add(item.sourceId)
  const span = parseSpanDays(item.spanDays)
  return {
    type: item.type,
    name: clip(item.name) || "Sin nombre",
    region: clipOrNull(item.region),
    ...(item.type === "stay" && span != null ? { nights: span } : {}),
    ...(item.type === "activity" && span != null ? { days: span } : {}),
    route: itemRoute(item),
    via: itemVia(item),
  }
}

function mapDay(day: UserDay, index: number, cited: Set<string>): SharePlanDay {
  return {
    index,
    label: clipOrNull(day.label),
    items: day.items.slice(0, SHARE_MAX_ITEMS_PER_DAY).map((it) => mapItem(it, cited)),
  }
}

function mapChunk(chunk: UserDay[], startIndex: number, cited: Set<string>): SharePlanDay {
  const start = startIndex + 1
  const end = startIndex + chunk.length
  const items: SharePlanItem[] = []
  for (const day of chunk) {
    for (const item of day.items) {
      if (items.length >= SHARE_MAX_ITEMS_PER_DAY) break
      items.push(mapItem(item, cited))
    }
    if (items.length >= SHARE_MAX_ITEMS_PER_DAY) break
  }
  const ranged = chunk.length === 1 ? `Día ${start}` : `Días ${start}-${end}`
  return {
    index: start,
    label: chunk.length === 1 ? clipOrNull(chunk[0]!.label) ?? ranged : ranged,
    items,
  }
}

function groupedDays(days: UserDay[], cited: Set<string>): SharePlanDay[] {
  const out: SharePlanDay[] = []
  for (let i = 0; i < days.length; i += SHARE_GROUP_SIZE) {
    out.push(mapChunk(days.slice(i, i + SHARE_GROUP_SIZE), i, cited))
    if (out.length >= SHARE_MAX_DAYS) break
  }
  return out
}

export function tripHasShareablePlan(trip: Trip): boolean {
  return trip.days.some((d) => d.items.length > 0)
}

export function buildSharePlan(trip: Trip, sources: Source[]): SharePlanPayload {
  const numDays = trip.days.length > 0 ? trip.days.length : Math.max(1, trip.numDays ?? 1)
  const rawDays = trip.days
  const cited = new Set<string>()
  const days =
    rawDays.length < SHARE_GROUP_FROM
      ? rawDays.map((d, i) => mapDay(d, i + 1, cited))
      : groupedDays(rawDays, cited)

  const planSources: SharePlanSource[] = sources
    .filter((s) => cited.has(s.id))
    .slice(0, SHARE_MAX_SOURCES)
    .map((s) => ({
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

/** Primera apertura: no hay tarjeta. Un resumen ya guardado no se regenera solo. */
export function shareCardNeedsGenerate(card: ShareCard | null): card is null {
  return card == null
}

/** El plan actual ya no es el que originó (o regeneró) el texto. */
export function shareCardIsStale(card: ShareCard | null, planSignature: string): boolean {
  return card != null && card.signature !== planSignature
}
