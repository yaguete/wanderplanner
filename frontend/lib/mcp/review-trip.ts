import { z } from "zod"
import { isSyntheticSourceId } from "@/lib/item-provenance"
import { expandSpannedItems, parseSpanDays } from "@/lib/item-span"
import { isRouteLeg } from "@/lib/route-legs"
import { buildTripBudgetView } from "@/lib/trip-budget"
import { normalizeName } from "@/lib/trip-tasks"
import type { BasicCategory, ItemType, UserDay, UserDayItem } from "@/types/itinerary"
import { tripFromBudgetRow } from "./get-trip-budget"
import {
  SEARCH_MAX_RESULTS,
  searchSources,
  searchSourcesOutput,
  type SearchHit,
  type SearchSourceRow,
  type SearchTripRow,
} from "./search-sources"
import { asStringList, orderBySourceIds } from "./trip-access"

export const MCP_REVIEW_TRIP_COLUMNS =
  "id, name, start_date, end_date, num_days, countries, expectations, source_ids, days, basics, tasks, extra_tasks, budget, currency, num_travelers" as const

export const REVIEW_UNCONSOLIDATED_MAX = 20
export const REVIEW_EVIDENCE_NAMES_MAX = 12
export const REVIEW_EVIDENCE_HITS_MAX = SEARCH_MAX_RESULTS
export const REVIEW_UNPRICED_TITLES_MAX = 12
export const REVIEW_CONTEXT_MAX = 240

const ITEM_TYPES = new Set<ItemType>(["stay", "activity", "food", "transport"])
const BASIC_CATEGORIES = new Set<BasicCategory>([
  "insurance",
  "sim",
  "carRental",
  "flight",
  "other",
])

export const REVIEW_CHECK_IDS = [
  "empty_days",
  "unconsolidated_items",
  "stay_coverage",
  "budget_coverage",
  "missing_legs",
] as const

export type ReviewCheckId = (typeof REVIEW_CHECK_IDS)[number]
export type ReviewSeverity = "ok" | "info" | "warning"

const checkItemSchema = z.object({
  name: z.string(),
  type: z.string(),
  sourceAuthor: z.string(),
})

export const reviewCheckSchema = z.object({
  id: z.enum(REVIEW_CHECK_IDS),
  severity: z.enum(["ok", "info", "warning"]),
  days: z.array(z.number()),
  summary: z.string(),
  items: z.array(checkItemSchema).optional(),
  shown: z.number().optional(),
  total: z.number().optional(),
  coverage: z
    .object({
      priced: z.number(),
      total: z.number(),
    })
    .optional(),
  unpriced: z.array(z.string()).optional(),
})

export const reviewTripOutput = z.object({
  checks: z.array(reviewCheckSchema),
  evidence: searchSourcesOutput.shape.results,
})

export type ReviewCheck = z.infer<typeof reviewCheckSchema>
export type ReviewTripResult = z.infer<typeof reviewTripOutput>

export const reviewTripInput = z.object({
  tripId: z.string().uuid(),
})

export type McpReviewTripRow = {
  id: string
  name: string | null
  start_date: string | null
  end_date: string | null
  num_days: number | null
  countries: unknown
  expectations: unknown
  source_ids: unknown
  days: unknown
  basics: unknown
  tasks: unknown
  extra_tasks: unknown
  budget: unknown
  currency: string | null
  num_travelers: number | null
}

function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function asTrimmed(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const t = raw.trim()
  return t.length > 0 ? t : null
}

export function clipReviewText(value: string, max = REVIEW_CONTEXT_MAX): string {
  const t = value.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trimEnd()}…`
}

function formatDayList(days: number[]): string {
  if (days.length === 0) return ""
  if (days.length === 1) return `día ${days[0]}`
  if (days.length === 2) return `días ${days[0]} y ${days[1]}`
  return `días ${days.slice(0, -1).join(", ")} y ${days[days.length - 1]}`
}

/**
 * Días suficientes para `expandSpannedItems` sin pasar por `sanitizeUserDays`
 * (esa vía borra `route` sin coords y no hace falta para span ni para tipo transport).
 */
export function daysFromRaw(daysRaw: unknown): UserDay[] {
  if (!Array.isArray(daysRaw)) return []
  return daysRaw.map((day, i) => {
    const obj = asObject(day)
    const rawItems = Array.isArray(obj?.items) ? obj.items : []
    const items: UserDayItem[] = []
    for (const raw of rawItems) {
      const item = asObject(raw)
      if (!item) continue
      const type = item.type
      if (typeof type !== "string" || !ITEM_TYPES.has(type as ItemType)) continue
      const name = asTrimmed(item.name) || "Sin nombre"
      const id =
        typeof item.id === "string" && item.id.trim() ? item.id.trim() : `${i}:${name}`
      const sourceItemId = typeof item.sourceItemId === "string" ? item.sourceItemId : ""
      const sourceId = typeof item.sourceId === "string" ? item.sourceId : ""
      const parsed = parseSpanDays(item.spanDays)
      const next: UserDayItem = {
        id,
        sourceItemId,
        sourceId,
        type: type as ItemType,
        name,
        detail: null,
        sourceAuthor: "",
      }
      if (parsed != null) next.spanDays = parsed
      items.push(next)
    }
    return {
      id: typeof obj?.id === "string" && obj.id.trim() ? obj.id.trim() : `day-${i}`,
      label: asTrimmed(obj?.label) ?? "",
      items,
    }
  })
}

function collectSourceItemIds(daysRaw: unknown): Set<string> {
  const ids = new Set<string>()
  if (!Array.isArray(daysRaw)) return ids
  for (const day of daysRaw) {
    const obj = asObject(day)
    const items = Array.isArray(obj?.items) ? obj.items : []
    for (const it of items) {
      const item = asObject(it)
      const id = typeof item?.sourceItemId === "string" ? item.sourceItemId : ""
      if (id) ids.add(id)
    }
  }
  return ids
}

function collectSourceBasicIds(basicsRaw: unknown): Set<string> {
  const ids = new Set<string>()
  if (!Array.isArray(basicsRaw)) return ids
  for (const b of basicsRaw) {
    const obj = asObject(b)
    const id = typeof obj?.sourceBasicItemId === "string" ? obj.sourceBasicItemId : ""
    if (id) ids.add(id)
  }
  return ids
}

type LegHit = { leg: "outbound" | "return"; dayIndex: number }

/** jsonb crudo: un `leg` cuenta aunque falten coords (sanitizeUserDays las exigiría). */
export function findRawLegs(daysRaw: unknown): LegHit[] {
  if (!Array.isArray(daysRaw)) return []
  const out: LegHit[] = []
  const seen = new Set<"outbound" | "return">()
  daysRaw.forEach((day, dayIndex) => {
    const obj = asObject(day)
    const items = Array.isArray(obj?.items) ? obj.items : []
    for (const it of items) {
      const item = asObject(it)
      if (!item || item.type !== "transport") continue
      const route = asObject(item.route)
      if (!isRouteLeg(route?.leg)) continue
      if (seen.has(route.leg)) continue
      seen.add(route.leg)
      out.push({ leg: route.leg, dayIndex })
    }
  })
  return out
}

/** Noches en destino: del día de ida (o 0) al anterior a la vuelta (o penúltimo). */
export function nightIndexes(
  numDays: number,
  outboundIndex: number | null,
  returnIndex: number | null,
): number[] {
  if (!Number.isInteger(numDays) || numDays < 2) return []
  const start = outboundIndex ?? 0
  const end = returnIndex != null ? returnIndex - 1 : numDays - 2
  if (end < start || start < 0) return []
  const out: number[] = []
  for (let i = start; i <= end && i < numDays; i++) out.push(i)
  return out
}

function checkEmptyDays(days: UserDay[]): ReviewCheck {
  const expanded = expandSpannedItems(days)
  const empty: number[] = []
  expanded.forEach((slots, i) => {
    if (slots.length === 0) empty.push(i + 1)
  })
  if (empty.length === 0) {
    return {
      id: "empty_days",
      severity: "ok",
      days: [],
      summary: "Todos los días tienen ítems o ecos de estancia.",
    }
  }
  return {
    id: "empty_days",
    severity: "warning",
    days: empty,
    summary: `Sin ítems (ni ecos de estancia) el ${formatDayList(empty)}.`,
  }
}

function checkUnconsolidated(
  sources: readonly SearchSourceRow[],
  sourceIds: string[],
  daysRaw: unknown,
  basicsRaw: unknown,
): ReviewCheck {
  const ordered = orderBySourceIds(sourceIds, sources)
  const inPlanItems = collectSourceItemIds(daysRaw)
  const inPlanBasics = collectSourceBasicIds(basicsRaw)
  const all: Array<{ name: string; type: string; sourceAuthor: string }> = []

  for (const source of ordered) {
    const author = (source.author ?? "").trim()
    const items = Array.isArray(source.items) ? source.items : []
    for (const raw of items) {
      const obj = asObject(raw)
      if (!obj) continue
      const itemType = obj.type
      if (typeof itemType !== "string" || !ITEM_TYPES.has(itemType as ItemType)) continue
      const name = asTrimmed(obj.name)
      if (!name) continue
      const id = typeof obj.id === "string" ? obj.id : ""
      if (id && inPlanItems.has(id)) continue
      all.push({ name, type: itemType, sourceAuthor: author })
    }
    const basics = Array.isArray(source.basics) ? source.basics : []
    for (const raw of basics) {
      const obj = asObject(raw)
      if (!obj) continue
      const name = asTrimmed(obj.name)
      if (!name) continue
      const category =
        typeof obj.category === "string" && BASIC_CATEGORIES.has(obj.category as BasicCategory)
          ? obj.category
          : "other"
      const id = typeof obj.id === "string" ? obj.id : ""
      if (id && inPlanBasics.has(id)) continue
      all.push({ name, type: category, sourceAuthor: author })
    }
  }

  const shownItems = all.slice(0, REVIEW_UNCONSOLIDATED_MAX)
  if (all.length === 0) {
    return {
      id: "unconsolidated_items",
      severity: "ok",
      days: [],
      summary: "No hay recomendaciones de las fuentes fuera del plan.",
      items: [],
      shown: 0,
      total: 0,
    }
  }
  return {
    id: "unconsolidated_items",
    severity: "info",
    days: [],
    summary:
      all.length === 1
        ? "1 recomendación de las fuentes no está en el plan."
        : `${all.length} recomendaciones de las fuentes no están en el plan.`,
    items: shownItems,
    shown: shownItems.length,
    total: all.length,
  }
}

function dayHasPersistedTransport(day: UserDay | undefined): boolean {
  return Boolean(day?.items.some((it) => it.type === "transport"))
}

function checkStayCoverage(days: UserDay[], legs: LegHit[]): ReviewCheck {
  const numDays = days.length
  const outbound = legs.find((l) => l.leg === "outbound")?.dayIndex ?? null
  const ret = legs.find((l) => l.leg === "return")?.dayIndex ?? null
  const nights = nightIndexes(numDays, outbound, ret)
  const expanded = expandSpannedItems(days)
  const gaps: number[] = []
  const gapsWithTransport: number[] = []

  for (const idx of nights) {
    const slots = expanded[idx] ?? []
    const hasStay = slots.some((s) => s.item.type === "stay")
    if (hasStay) continue
    const dayNumber = idx + 1
    gaps.push(dayNumber)
    if (dayHasPersistedTransport(days[idx])) gapsWithTransport.push(dayNumber)
  }

  if (nights.length === 0) {
    return {
      id: "stay_coverage",
      severity: "ok",
      days: [],
      summary: "No hay rango de noches que cubrir (viaje de un día o sin calendario).",
    }
  }
  if (gaps.length === 0) {
    return {
      id: "stay_coverage",
      severity: "ok",
      days: [],
      summary: "Las noches entre tramos tienen alojamiento.",
    }
  }

  const allHaveTransport =
    gapsWithTransport.length === gaps.length && gapsWithTransport.length > 0
  const transportNote =
    gapsWithTransport.length > 0
      ? ` El ${formatDayList(gapsWithTransport)} hay un transporte.`
      : ""
  return {
    id: "stay_coverage",
    severity: allHaveTransport ? "info" : "warning",
    days: gaps,
    summary: `Noches sin alojamiento: ${formatDayList(gaps)}.${transportNote}`,
  }
}

function checkBudget(row: McpReviewTripRow): ReviewCheck {
  const trip = tripFromBudgetRow({
    id: row.id,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    num_days: row.num_days,
    days: row.days,
    basics: row.basics,
    tasks: row.tasks,
    extra_tasks: row.extra_tasks,
    budget: row.budget,
    currency: row.currency,
    num_travelers: row.num_travelers,
  })
  const view = buildTripBudgetView(trip)
  const unpriced = view.unpriced
    .flatMap((g) => g.tasks.map((t) => t.title))
    .slice(0, REVIEW_UNPRICED_TITLES_MAX)
  const { priced, total } = view.coverage
  const coverage = { priced, total }

  if (total === 0) {
    return {
      id: "budget_coverage",
      severity: "ok",
      days: [],
      summary: "No hay gestiones que valorar.",
      coverage,
      unpriced: [],
    }
  }
  if (priced === total) {
    return {
      id: "budget_coverage",
      severity: "ok",
      days: [],
      summary: `Precio en ${priced} de ${total} gestiones.`,
      coverage,
      unpriced: [],
    }
  }
  const missing = total - priced
  return {
    id: "budget_coverage",
    severity: priced === 0 ? "warning" : "info",
    days: [],
    summary: `Precio en ${priced} de ${total} gestiones · ${missing} sin valorar.`,
    coverage,
    unpriced,
  }
}

function checkMissingLegs(legs: LegHit[]): ReviewCheck {
  const outbound = legs.find((l) => l.leg === "outbound")
  const ret = legs.find((l) => l.leg === "return")
  const days: number[] = []
  if (outbound) days.push(outbound.dayIndex + 1)
  if (ret) days.push(ret.dayIndex + 1)

  if (outbound && ret) {
    return {
      id: "missing_legs",
      severity: "ok",
      days,
      summary: `Hay ida (día ${outbound.dayIndex + 1}) y vuelta (día ${ret.dayIndex + 1}).`,
    }
  }
  if (!outbound && !ret) {
    return {
      id: "missing_legs",
      severity: "warning",
      days: [],
      summary: "Faltan los tramos de ida y vuelta.",
    }
  }
  if (!outbound) {
    return {
      id: "missing_legs",
      severity: "warning",
      days,
      summary: "Falta el tramo de ida.",
    }
  }
  return {
    id: "missing_legs",
    severity: "warning",
    days,
    summary: "Falta el tramo de vuelta.",
  }
}

export function buildReviewChecks(
  row: McpReviewTripRow,
  sources: readonly SearchSourceRow[],
): ReviewCheck[] {
  const days = daysFromRaw(row.days)
  const legs = findRawLegs(row.days)
  const sourceIds = asStringList(row.source_ids)
  return [
    checkEmptyDays(days),
    checkUnconsolidated(sources, sourceIds, row.days, row.basics),
    checkStayCoverage(days, legs),
    checkBudget(row),
    checkMissingLegs(legs),
  ]
}

/**
 * Nombres del plan para evidence: primero procedencia centinela (manual/asistente),
 * luego el resto, únicos por nombre plegado, tope `REVIEW_EVIDENCE_NAMES_MAX`.
 */
export function planNamesForEvidence(daysRaw: unknown): string[] {
  if (!Array.isArray(daysRaw)) return []
  type Named = { name: string; sentinel: boolean; order: number }
  const named: Named[] = []
  let order = 0
  for (const day of daysRaw) {
    const obj = asObject(day)
    const items = Array.isArray(obj?.items) ? obj.items : []
    for (const raw of items) {
      const item = asObject(raw)
      if (!item) continue
      const type = item.type
      if (typeof type !== "string" || !ITEM_TYPES.has(type as ItemType)) continue
      const route = asObject(item.route)
      if (isRouteLeg(route?.leg)) continue
      const name = asTrimmed(item.name)
      if (!name) continue
      const sourceId = typeof item.sourceId === "string" ? item.sourceId : ""
      named.push({ name, sentinel: isSyntheticSourceId(sourceId), order: order++ })
    }
  }
  named.sort((a, b) => Number(b.sentinel) - Number(a.sentinel) || a.order - b.order)
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of named) {
    const key = normalizeName(n.name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(n.name)
    if (out.length >= REVIEW_EVIDENCE_NAMES_MAX) break
  }
  return out
}

export function collectReviewEvidence(
  row: McpReviewTripRow,
  sources: readonly SearchSourceRow[],
): SearchHit[] {
  if (sources.length === 0) return []
  const trip: SearchTripRow = {
    id: row.id,
    source_ids: row.source_ids,
    days: row.days,
    basics: row.basics,
  }
  const names = planNamesForEvidence(row.days)
  const scored: SearchHit[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const hits = searchSources(name, sources, trip)
    for (const hit of hits) {
      const key = `${hit.sourceId}\0${normalizeName(hit.name)}`
      if (seen.has(key)) continue
      seen.add(key)
      scored.push(hit)
      if (scored.length >= REVIEW_EVIDENCE_HITS_MAX) return scored
    }
  }
  return scored
}

export function reviewTripText(
  row: McpReviewTripRow,
  checks: ReviewCheck[],
  evidence: SearchHit[],
  sourceCount: number,
): string {
  const lines: string[] = []
  const expectations = asTrimmed(row.expectations)
  if (expectations) lines.push(`Expectativas: ${clipReviewText(expectations)}`)

  const failing = checks.filter((c) => c.severity !== "ok")
  if (failing.length === 0) {
    lines.push("Ningún hallazgo en los checks.")
  } else {
    for (const c of failing) lines.push(c.summary)
  }

  if (sourceCount === 0) {
    lines.push("Este viaje no tiene fuentes.")
  } else if (evidence.length === 0) {
    lines.push("Las fuentes del viaje no mencionan los sitios que ya están en el plan.")
  } else {
    lines.push(
      evidence.length === 1
        ? "1 cita de las fuentes sobre sitios del plan."
        : `${evidence.length} citas de las fuentes sobre sitios del plan.`,
    )
  }
  return lines.join("\n")
}

export function mapReviewTrip(
  row: McpReviewTripRow,
  sources: readonly SearchSourceRow[],
): { result: ReviewTripResult; text: string } {
  const ordered = orderBySourceIds(asStringList(row.source_ids), sources)
  const checks = buildReviewChecks(row, ordered)
  const evidence = collectReviewEvidence(row, ordered)
  return {
    result: { checks, evidence },
    text: reviewTripText(row, checks, evidence, ordered.length),
  }
}
