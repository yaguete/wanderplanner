import { z } from "zod"
import { sanitizeAffiliateUrl } from "@/lib/affiliate-url"
import { parseTripBudget } from "@/lib/db/trips-repo"
import { tripWanderplannerUrl } from "@/lib/trip-tab"
import { taskKeyForItem } from "@/lib/trip-tasks"
import type { BasicCategory, ItemType, RoutePlaceKind, TripTaskStatus, UserDayItem } from "@/types/itinerary"
import { asStringList } from "./trip-access"

export const MCP_GET_TRIP_COLUMNS =
  "id, name, archived, start_date, end_date, num_days, countries, expectations, source_ids, days, basics, tasks, extra_tasks, dismissed_country_tasks, num_travelers, currency, origin, budget" as const

export const GET_TRIP_DETAIL_DAYS_MAX = 7
export const GET_TRIP_SUMMARY_NAMES_MAX = 12

const ITEM_TYPES = new Set<ItemType>(["stay", "activity", "food", "transport"])
const BASIC_CATEGORIES = new Set<BasicCategory>([
  "insurance",
  "sim",
  "carRental",
  "flight",
  "other",
])
const TASK_STATUSES = new Set<TripTaskStatus>(["pending", "booked", "paid", "notNeeded"])
const PLACE_KINDS = new Set<RoutePlaceKind>([
  "airport",
  "station",
  "busStation",
  "city",
  "address",
  "other",
])

export type McpGetTripRow = {
  id: string
  name: string | null
  archived: boolean | null
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
  dismissed_country_tasks: unknown
  num_travelers: unknown
  currency: unknown
  origin: unknown
  budget: unknown
}

const taskStateSchema = z.object({
  status: z.enum(["pending", "booked", "paid", "notNeeded"]),
  cost: z.number().nullable(),
  notes: z.string().nullable(),
})

const originSchema = z
  .object({
    label: z.string(),
    countryCode: z.string().nullable(),
  })
  .nullable()

const budgetCapSchema = z
  .object({
    total: z.number().nullable(),
    byCategory: z.record(z.string(), z.number()),
  })
  .nullable()

const basicSchema = z.object({
  name: z.string(),
  category: z.string(),
  detail: z.string().nullable(),
  affiliateUrl: z.string().nullable(),
  sourceAuthor: z.string().nullable(),
})

const extraTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  status: z.enum(["pending", "booked", "paid", "notNeeded"]),
  cost: z.number().nullable(),
  notes: z.string().nullable(),
})

const headerFields = {
  id: z.string(),
  name: z.string(),
  archived: z.boolean(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  numDays: z.number(),
  countries: z.array(z.string()),
  expectations: z.string().nullable(),
  sourceIds: z.array(z.string()),
  wanderplannerUrl: z.string(),
  numTravelers: z.number().nullable(),
  currency: z.string(),
  origin: originSchema,
  budget: budgetCapSchema,
  basics: z.array(basicSchema),
  extraTasks: z.array(extraTaskSchema),
  dismissedCountryTasks: z.array(z.string()),
  taskCounts: z.object({
    pending: z.number(),
    booked: z.number(),
    paid: z.number(),
    notNeeded: z.number(),
  }),
}

const routePlaceSchema = z.object({
  label: z.string(),
  kind: z.enum(["airport", "station", "busStation", "city", "address", "other"]),
})

const itemSchema = z.object({
  id: z.string(),
  type: z.enum(["stay", "activity", "food", "transport"]),
  name: z.string(),
  detail: z.string().nullable(),
  sourceAuthor: z.string().nullable(),
  affiliateUrl: z.string().nullable(),
  region: z.string().nullable(),
  spanDays: z.number().nullable(),
  route: z
    .object({
      from: routePlaceSchema,
      to: routePlaceSchema,
      mode: z.string().nullable(),
      leg: z.enum(["outbound", "return"]).nullable(),
    })
    .nullable(),
})

export const getTripOutput = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("summary"),
    ...headerFields,
    days: z.array(
      z.object({
        index: z.number(),
        label: z.string(),
        itemCount: z.number(),
        itemNames: z.array(z.string()),
      }),
    ),
  }),
  z.object({
    mode: z.literal("detail"),
    ...headerFields,
    requestedDays: z.array(z.number()),
    days: z.array(
      z.object({
        index: z.number(),
        label: z.string(),
        items: z.array(itemSchema),
      }),
    ),
    tasks: z.record(z.string(), taskStateSchema),
  }),
])

export type GetTripResult = z.infer<typeof getTripOutput>

export const getTripInput = z.object({
  tripId: z.string().uuid(),
  days: z.array(z.number().int().min(1).max(60)).max(GET_TRIP_DETAIL_DAYS_MAX).optional(),
})

function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function asTrimmed(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const t = raw.trim()
  return t.length > 0 ? t : null
}

function mapOrigin(raw: unknown): { label: string; countryCode: string | null } | null {
  const obj = asObject(raw)
  if (!obj) return null
  const label = asTrimmed(obj.label)
  if (!label) return null
  let countryCode: string | null = null
  if (typeof obj.countryCode === "string") {
    const code = obj.countryCode.trim().toUpperCase()
    if (/^[A-Z]{2}$/.test(code)) countryCode = code
  }
  return { label, countryCode }
}

function mapTaskState(raw: unknown): {
  status: TripTaskStatus
  cost: number | null
  notes: string | null
} | null {
  const obj = asObject(raw)
  if (!obj) return null
  const status = obj.status
  if (typeof status !== "string" || !TASK_STATUSES.has(status as TripTaskStatus)) return null
  return {
    status: status as TripTaskStatus,
    cost: typeof obj.cost === "number" && Number.isFinite(obj.cost) ? obj.cost : null,
    notes: asTrimmed(obj.notes),
  }
}

function mapRoutePlace(raw: unknown): { label: string; kind: RoutePlaceKind } | null {
  const obj = asObject(raw)
  if (!obj) return null
  const label = asTrimmed(obj.label)
  if (!label) return null
  const kindRaw = obj.kind
  const kind =
    typeof kindRaw === "string" && PLACE_KINDS.has(kindRaw as RoutePlaceKind)
      ? (kindRaw as RoutePlaceKind)
      : "other"
  return { label, kind }
}

type McpRoute = {
  from: { label: string; kind: RoutePlaceKind }
  to: { label: string; kind: RoutePlaceKind }
  mode: string | null
  leg: "outbound" | "return" | null
} | null

function mapRoute(raw: unknown): McpRoute {
  const obj = asObject(raw)
  if (!obj) return null
  const from = mapRoutePlace(obj.from)
  const to = mapRoutePlace(obj.to)
  if (!from || !to) return null
  const mode = asTrimmed(obj.mode)
  const leg = obj.leg === "outbound" || obj.leg === "return" ? obj.leg : null
  return { from, to, mode, leg }
}

function mapItem(raw: unknown): z.infer<typeof itemSchema> | null {
  const obj = asObject(raw)
  if (!obj) return null
  const type = obj.type
  if (typeof type !== "string" || !ITEM_TYPES.has(type as ItemType)) return null
  const name = asTrimmed(obj.name) || "Sin nombre"
  const id = typeof obj.id === "string" && obj.id.trim() ? obj.id : name
  const spanRaw = obj.spanDays
  const spanDays =
    typeof spanRaw === "number" && Number.isInteger(spanRaw) && spanRaw >= 2 ? spanRaw : null
  return {
    id,
    type: type as ItemType,
    name,
    detail: asTrimmed(obj.detail),
    sourceAuthor: asTrimmed(obj.sourceAuthor),
    affiliateUrl: sanitizeAffiliateUrl(typeof obj.affiliateUrl === "string" ? obj.affiliateUrl : null),
    region: asTrimmed(obj.region),
    spanDays,
    route: mapRoute(obj.route),
  }
}

function mapBasic(raw: unknown): z.infer<typeof basicSchema> | null {
  const obj = asObject(raw)
  if (!obj) return null
  const name = asTrimmed(obj.name)
  if (!name) return null
  const category =
    typeof obj.category === "string" && BASIC_CATEGORIES.has(obj.category as BasicCategory)
      ? obj.category
      : "other"
  return {
    name,
    category,
    detail: asTrimmed(obj.detail),
    affiliateUrl: sanitizeAffiliateUrl(typeof obj.affiliateUrl === "string" ? obj.affiliateUrl : null),
    sourceAuthor: asTrimmed(obj.sourceAuthor),
  }
}

function mapExtraTask(raw: unknown): z.infer<typeof extraTaskSchema> | null {
  const obj = asObject(raw)
  if (!obj) return null
  const id = typeof obj.id === "string" ? obj.id : ""
  const title = asTrimmed(obj.title)
  if (!id || !title) return null
  const state = mapTaskState(obj.state) ?? {
    status: "pending" as const,
    cost: null,
    notes: null,
  }
  return {
    id,
    title,
    category: asTrimmed(obj.category) || "other",
    status: state.status,
    cost: state.cost,
    notes: state.notes,
  }
}

function asDayRows(raw: unknown): { label: string; items: unknown[] }[] {
  if (!Array.isArray(raw)) return []
  return raw.map((day) => {
    const obj = asObject(day)
    if (!obj) return { label: "", items: [] }
    return {
      label: asTrimmed(obj.label) ?? "",
      items: Array.isArray(obj.items) ? obj.items : [],
    }
  })
}

function mapTasks(raw: unknown): Record<string, z.infer<typeof taskStateSchema>> {
  const obj = asObject(raw)
  if (!obj) return {}
  const out: Record<string, z.infer<typeof taskStateSchema>> = {}
  for (const [key, value] of Object.entries(obj)) {
    const state = mapTaskState(value)
    if (state) out[key] = state
  }
  return out
}

function countTasks(tasks: Record<string, z.infer<typeof taskStateSchema>>) {
  const counts = { pending: 0, booked: 0, paid: 0, notNeeded: 0 }
  for (const state of Object.values(tasks)) {
    counts[state.status] += 1
  }
  return counts
}

/** Claves de `trip.tasks` que corresponden a los ítems ya mapeados (no se recomponen). */
function tasksForMappedItems(
  all: Record<string, z.infer<typeof taskStateSchema>>,
  items: z.infer<typeof itemSchema>[],
): Record<string, z.infer<typeof taskStateSchema>> {
  const out: Record<string, z.infer<typeof taskStateSchema>> = {}
  for (const item of items) {
    const key = taskKeyForItem({
      id: item.id,
      type: item.type,
      name: item.name,
      route: item.route as UserDayItem["route"],
    })
    const state = all[key]
    if (state) out[key] = state
  }
  return out
}

function header(row: McpGetTripRow, daysLen: number) {
  const budget = parseTripBudget(row.budget)
  const tasks = mapTasks(row.tasks)
  return {
    id: row.id,
    name: (row.name ?? "").trim() || "Viaje sin nombre",
    archived: row.archived === true,
    startDate: row.start_date,
    endDate: row.end_date,
    numDays: daysLen,
    countries: asStringList(row.countries),
    expectations: asTrimmed(row.expectations),
    sourceIds: asStringList(row.source_ids),
    wanderplannerUrl: tripWanderplannerUrl(row.id, "itinerary"),
    numTravelers:
      typeof row.num_travelers === "number" && Number.isFinite(row.num_travelers)
        ? row.num_travelers
        : null,
    currency: asTrimmed(row.currency) || "EUR",
    origin: mapOrigin(row.origin),
    budget: budget
      ? { total: budget.total, byCategory: budget.byCategory as Record<string, number> }
      : null,
    basics: (Array.isArray(row.basics) ? row.basics : []).flatMap((b) => {
      const mapped = mapBasic(b)
      return mapped ? [mapped] : []
    }),
    extraTasks: (Array.isArray(row.extra_tasks) ? row.extra_tasks : []).flatMap((t) => {
      const mapped = mapExtraTask(t)
      return mapped ? [mapped] : []
    }),
    dismissedCountryTasks: asStringList(row.dismissed_country_tasks),
    taskCounts: countTasks(tasks),
    tasks,
  }
}

export function requestedDayIndexes(
  requested: number[] | undefined,
  numDays: number,
): number[] {
  if (!requested || requested.length === 0) return []
  const unique = [...new Set(requested.filter((n) => Number.isInteger(n) && n >= 1 && n <= numDays))]
  unique.sort((a, b) => a - b)
  return unique.slice(0, GET_TRIP_DETAIL_DAYS_MAX)
}

function formatHeaderLine(h: ReturnType<typeof header>): string {
  const bits = [h.name]
  if (h.numDays > 0) bits.push(`${h.numDays} día${h.numDays === 1 ? "" : "s"}`)
  if (h.startDate) bits.push(`desde ${h.startDate}`)
  if (h.archived) bits.push("archivado")
  return bits.join(" · ")
}

export type GetTripMapped = { result: GetTripResult; text: string }

export function mapGetTrip(row: McpGetTripRow, days?: number[]): GetTripMapped {
  const dayRows = asDayRows(row.days)
  const numDays = dayRows.length > 0 ? dayRows.length : typeof row.num_days === "number" ? row.num_days : 0
  const h = header(row, numDays)
  const { tasks, ...head } = h
  const indexes = requestedDayIndexes(days, numDays)

  if (indexes.length === 0) {
    const result: GetTripResult = {
      mode: "summary",
      ...head,
      days: dayRows.map((day, i) => {
        const names = day.items.flatMap((it) => {
          const mapped = mapItem(it)
          return mapped ? [mapped.name] : []
        })
        return {
          index: i + 1,
          label: day.label,
          itemCount: names.length,
          itemNames: names.slice(0, GET_TRIP_SUMMARY_NAMES_MAX),
        }
      }),
    }
    const hint =
      numDays > 0
        ? ` Pasa days con hasta ${GET_TRIP_DETAIL_DAYS_MAX} números de día (1-based) para ver ítems, rutas y enlaces.`
        : ""
    return { result, text: `${formatHeaderLine(h)}.${hint}` }
  }

  const detailDays = indexes.map((index) => {
    const day = dayRows[index - 1]
    const items = (day?.items ?? []).flatMap((it) => {
      const mapped = mapItem(it)
      return mapped ? [mapped] : []
    })
    return { index, label: day?.label ?? "", items }
  })
  const result: GetTripResult = {
    mode: "detail",
    ...head,
    requestedDays: indexes,
    days: detailDays,
    tasks: tasksForMappedItems(
      tasks,
      detailDays.flatMap((d) => d.items),
    ),
  }
  const listed = indexes.join(", ")
  return {
    result,
    text: `${formatHeaderLine(h)}. Detalle de los días ${listed}.`,
  }
}
