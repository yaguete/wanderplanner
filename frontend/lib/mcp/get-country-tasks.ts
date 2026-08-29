import { z } from "zod"
import { resolveTripCountryCodes } from "@/lib/countries"
import type { CountryTasksResult } from "@/lib/country-tasks"
import { asStringList } from "./trip-access"

export {
  COUNTRY_TASKS_FETCH_TIMEOUT_MS,
  countryTasksFetchErrorText,
} from "@/lib/country-tasks"

export const MCP_COUNTRY_TASKS_TRIP_COLUMNS =
  "id, name, countries, source_ids, days, extra_tasks, dismissed_country_tasks" as const

export const MCP_COUNTRY_TASKS_SOURCE_COLUMNS = "id, area, items" as const

export const getCountryTasksInput = z.object({
  tripId: z.string().uuid(),
})

const suggestionSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(["paperwork", "health"]),
  leadTimeDays: z.number().nullable(),
  details: z.string().nullable(),
  countryCode: z.string(),
  countryName: z.string(),
  status: z.enum(["suggested", "accepted", "dismissed"]),
})

export const getCountryTasksOutput = z.object({
  codes: z.array(z.string()),
  disclaimer: z.string(),
  briefSource: z.string(),
  suggestions: z.array(suggestionSchema),
  sources: z.array(
    z.object({
      countryCode: z.string(),
      name: z.string(),
      url: z.string().nullable(),
      briefFetchedAt: z.string().nullable(),
    }),
  ),
  errors: z.array(
    z.object({
      countryCode: z.string(),
      name: z.string(),
      error: z.string(),
    }),
  ),
})

export type GetCountryTasksResult = z.infer<typeof getCountryTasksOutput>

export type McpCountryTasksTripRow = {
  id: string
  name: string | null
  countries: unknown
  source_ids: unknown
  days: unknown
  extra_tasks: unknown
  dismissed_country_tasks: unknown
}

export type McpCountryTasksSourceRow = {
  id: string
  area: string | null
  items: unknown
}

export function extraTaskIdsFromRow(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((t) => {
    if (!t || typeof t !== "object" || Array.isArray(t)) return []
    const id = (t as { id?: unknown }).id
    return typeof id === "string" && id ? [id] : []
  })
}

export function mapCountryTasks(
  fetched: CountryTasksResult,
  extraTaskIds: readonly string[],
  dismissedIds: readonly string[],
  codes: string[],
): GetCountryTasksResult {
  const accepted = new Set(extraTaskIds)
  const dismissed = new Set(dismissedIds)
  return {
    codes,
    disclaimer: fetched.disclaimer,
    briefSource: fetched.briefSource,
    suggestions: fetched.suggestions.map((s) => ({
      id: s.id,
      title: s.title,
      category: s.category,
      leadTimeDays: s.leadTimeDays,
      details: s.details,
      countryCode: s.countryCode,
      countryName: s.countryName,
      status: accepted.has(s.id) ? "accepted" : dismissed.has(s.id) ? "dismissed" : "suggested",
    })),
    sources: fetched.sources,
    errors: fetched.errors,
  }
}

export function countryCodesForMcpTrip(
  trip: McpCountryTasksTripRow,
  sources: readonly McpCountryTasksSourceRow[],
): string[] {
  return resolveTripCountryCodes(
    {
      name: (trip.name ?? "").trim() || "Viaje",
      countries: asStringList(trip.countries),
      days: Array.isArray(trip.days)
        ? trip.days.map((d) => {
            if (!d || typeof d !== "object" || Array.isArray(d)) return { items: [] }
            const items = (d as { items?: unknown }).items
            return { items: Array.isArray(items) ? (items as { region?: string | null }[]) : [] }
          })
        : [],
    },
    sources.map((s) => ({
      area: s.area,
      items: Array.isArray(s.items) ? (s.items as { region?: string | null }[]) : [],
    })),
  )
}

export function countryTasksText(result: GetCountryTasksResult): string {
  if (result.codes.length === 0) {
    return "Este viaje no tiene países asignados todavía. Añade un destino en WanderPlanner o una fuente con el área del artículo."
  }
  const suggested = result.suggestions.filter((s) => s.status === "suggested")
  if (result.errors.length > 0 && suggested.length === 0 && result.suggestions.length === 0) {
    return `No pude completar los trámites de ${result.codes.join(", ")}. Inténtalo de nuevo.`
  }
  if (result.suggestions.length === 0) {
    return `No hay trámites oficiales que mostrar para ${result.codes.join(", ")}.`
  }
  const lines = result.suggestions.map((s) => {
    const mark = s.status === "accepted" ? "hecho" : s.status === "dismissed" ? "descartado" : s.category
    return `- ${s.title} (${s.countryName} · ${mark})`
  })
  return `${result.disclaimer}\nTrámites para ${result.codes.join(", ")}:\n${lines.join("\n")}`
}
