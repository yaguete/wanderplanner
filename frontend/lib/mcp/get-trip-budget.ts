import { z } from "zod"
import { rowToTrip, type TripRow } from "@/lib/db/trips-repo"
import {
  buildTripBudgetView,
  formatBudgetBriefingMarkdown,
  type BudgetLineStatus,
  type TripBudgetView,
} from "@/lib/trip-budget"
import { tripWanderplannerUrl } from "@/lib/trip-tab"
import type { TaskGroupCategory } from "@/types/itinerary"

export const MCP_GET_TRIP_BUDGET_COLUMNS =
  "id, name, start_date, end_date, num_days, days, basics, tasks, extra_tasks, budget, currency, num_travelers" as const

export const getTripBudgetInput = z.object({
  tripId: z.string().uuid(),
})

const lineSchema = z.object({
  title: z.string(),
  cost: z.number(),
  status: z.enum(["estimated", "booked", "paid"]),
})

export const getTripBudgetOutput = z.object({
  name: z.string(),
  wanderplannerUrl: z.string(),
  currency: z.string(),
  counted: z.number(),
  split: z.object({
    estimated: z.number(),
    booked: z.number(),
    paid: z.number(),
  }),
  coverage: z.object({
    priced: z.number(),
    total: z.number(),
  }),
  verdict: z.object({
    kind: z.enum(["noCap", "under", "over"]),
    counted: z.number(),
    cap: z.number().nullable(),
    delta: z.number(),
  }),
  rates: z.object({
    perDay: z.number().nullable(),
    perTraveler: z.number().nullable(),
    perTravelerDay: z.number().nullable(),
    capPerDay: z.number().nullable(),
  }),
  caps: z.object({
    declaredTotal: z.number().nullable(),
    effective: z.number().nullable(),
    byCategory: z.record(z.string(), z.number()),
    categoriesExceedTotal: z.boolean(),
  }),
  groups: z.array(
    z.object({
      category: z.string(),
      subtotal: z.number(),
      cap: z.number().nullable(),
      over: z.number(),
      lines: z.array(lineSchema),
    }),
  ),
  unpriced: z.array(
    z.object({
      category: z.string(),
      titles: z.array(z.string()),
    }),
  ),
})

export type GetTripBudgetResult = z.infer<typeof getTripBudgetOutput>

export type McpBudgetRow = {
  id: string
  name: string | null
  start_date: string | null
  end_date: string | null
  num_days: number | null
  days: unknown
  basics: unknown
  tasks: unknown
  extra_tasks: unknown
  budget: unknown
  currency: string | null
  num_travelers: number | null
}

function slimView(
  view: TripBudgetView,
  name: string,
  wanderplannerUrl: string,
): GetTripBudgetResult {
  return {
    name,
    wanderplannerUrl,
    currency: view.currency,
    counted: view.counted,
    split: view.split,
    coverage: view.coverage,
    verdict: view.verdict,
    rates: view.rates,
    caps: {
      declaredTotal: view.caps.declaredTotal,
      effective: view.caps.effective,
      byCategory: view.caps.byCategory as Record<string, number>,
      categoriesExceedTotal: view.caps.categoriesExceedTotal,
    },
    groups: view.groups.map((g) => ({
      category: g.category,
      subtotal: g.subtotal,
      cap: g.cap,
      over: g.over,
      lines: g.lines.map((line) => ({
        title: line.task.title,
        cost: line.cost,
        status: line.status as BudgetLineStatus,
      })),
    })),
    unpriced: view.unpriced.map((g) => ({
      category: g.category as TaskGroupCategory,
      titles: g.tasks.map((t) => t.title),
    })),
  }
}

export function tripFromBudgetRow(row: McpBudgetRow) {
  return rowToTrip({
    id: row.id,
    user_id: "",
    name: row.name ?? "",
    countries: [],
    start_date: row.start_date,
    end_date: row.end_date,
    num_days: row.num_days,
    expectations: null,
    cover: "✈️",
    cover_url: null,
    archived: false,
    referrer: null,
    source_ids: [],
    days: Array.isArray(row.days) ? (row.days as TripRow["days"]) : [],
    basics: Array.isArray(row.basics) ? (row.basics as TripRow["basics"]) : [],
    tasks: row.tasks && typeof row.tasks === "object" && !Array.isArray(row.tasks)
      ? (row.tasks as TripRow["tasks"])
      : {},
    extra_tasks: Array.isArray(row.extra_tasks) ? (row.extra_tasks as TripRow["extra_tasks"]) : [],
    dismissed_country_tasks: [],
    num_travelers: row.num_travelers,
    currency: row.currency,
    origin: null,
    budget: row.budget as TripRow["budget"],
    share_card: null,
  })
}

export function mapGetTripBudget(row: McpBudgetRow): { result: GetTripBudgetResult; text: string } {
  const trip = tripFromBudgetRow(row)
  const view = buildTripBudgetView(trip)
  const name = (row.name ?? "").trim() || "Viaje sin nombre"
  return {
    result: slimView(view, name, tripWanderplannerUrl(row.id, "itinerary")),
    text: formatBudgetBriefingMarkdown(view),
  }
}
