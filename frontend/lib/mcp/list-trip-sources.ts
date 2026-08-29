import { z } from "zod"
import { asStringList, orderBySourceIds } from "./trip-access"

/** Metadatos de fuente para MCP. No reutiliza SOURCE_COLUMNS del repo (trae items/user_id). */
export const MCP_SOURCE_META_COLUMNS = "id, url, author, title, area, total_days" as const

export const MCP_LIST_SOURCES_TRIP_COLUMNS = "id, source_ids" as const

export type McpSourceMetaRow = {
  id: string
  url: string | null
  author: string | null
  title: string | null
  area: string | null
  total_days: number | null
}

export type McpListSourcesTripRow = {
  id: string
  source_ids: unknown
}

export const listTripSourcesOutput = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      author: z.string(),
      title: z.string(),
      area: z.string().nullable(),
      totalDays: z.number().nullable(),
    }),
  ),
})

export type ListTripSourcesResult = z.infer<typeof listTripSourcesOutput>

export const listTripSourcesInput = z.object({
  tripId: z.string().uuid(),
})

export function mapSourceMeta(row: McpSourceMetaRow): ListTripSourcesResult["sources"][number] {
  return {
    id: row.id,
    url: (row.url ?? "").trim(),
    author: (row.author ?? "").trim(),
    title: (row.title ?? "").trim() || "Artículo sin título",
    area: typeof row.area === "string" && row.area.trim() ? row.area.trim() : null,
    totalDays: typeof row.total_days === "number" ? row.total_days : null,
  }
}

export function listTripSourcesResult(
  trip: McpListSourcesTripRow,
  rows: readonly McpSourceMetaRow[],
): { result: ListTripSourcesResult; text: string } {
  const sourceIds = asStringList(trip.source_ids)
  const ordered = orderBySourceIds(sourceIds, rows)
  const sources = ordered.map(mapSourceMeta)
  if (sources.length === 0) {
    return {
      result: { sources },
      text: "Este viaje no tiene fuentes todavía. Añade un artículo en WanderPlanner y vuelve a consultar.",
    }
  }
  const lines = sources.map((s) => {
    const bits = [s.title]
    if (s.author) bits.push(`vía ${s.author}`)
    if (s.area) bits.push(s.area)
    return `- ${bits.join(" · ")}`
  })
  return {
    result: { sources },
    text: `Fuentes de este viaje:\n${lines.join("\n")}`,
  }
}
