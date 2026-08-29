import { z } from "zod"
import type { createMcpHandler } from "mcp-handler"
import { fetchArticleHtml } from "@/lib/db/trips-repo"
import {
  COUNTRY_TASKS_FETCH_TIMEOUT_MS,
  fetchCountryTasksWithToken,
} from "@/lib/country-tasks"
import { asStringList, loadAccessibleTrip, loadSourcesByIds, tripLoadFailure } from "./trip-access"
import { listTripsResult, MCP_TRIP_COLUMNS, type McpTripRow } from "./list-trips"
import {
  getTripInput,
  getTripOutput,
  mapGetTrip,
  MCP_GET_TRIP_COLUMNS,
  type McpGetTripRow,
} from "./get-trip"
import {
  listTripSourcesInput,
  listTripSourcesOutput,
  listTripSourcesResult,
  MCP_LIST_SOURCES_TRIP_COLUMNS,
  MCP_SOURCE_META_COLUMNS,
  type McpListSourcesTripRow,
  type McpSourceMetaRow,
} from "./list-trip-sources"
import {
  attachSearchQuotes,
  MCP_SEARCH_SOURCE_COLUMNS,
  MCP_SEARCH_SOURCES_TRIP_COLUMNS,
  searchSources,
  searchSourcesInput,
  searchSourcesOutput,
  searchSourcesText,
  type SearchSourceRow,
  type SearchTripRow,
} from "./search-sources"
import {
  getTripBudgetInput,
  getTripBudgetOutput,
  mapGetTripBudget,
  MCP_GET_TRIP_BUDGET_COLUMNS,
  type McpBudgetRow,
} from "./get-trip-budget"
import {
  countryCodesForMcpTrip,
  countryTasksFetchErrorText,
  countryTasksText,
  extraTaskIdsFromRow,
  getCountryTasksInput,
  getCountryTasksOutput,
  mapCountryTasks,
  MCP_COUNTRY_TASKS_SOURCE_COLUMNS,
  MCP_COUNTRY_TASKS_TRIP_COLUMNS,
  type McpCountryTasksSourceRow,
  type McpCountryTasksTripRow,
} from "./get-country-tasks"
import { mcpNoSession, mcpOk, mcpReadFailed, mcpTextError, tokenFromCtx } from "./result"
import { createUserSupabase } from "./supabase"

type McpServer = Parameters<Parameters<typeof createMcpHandler>[0]>[0]

const listTripsOutput = z.object({
  trips: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      archived: z.boolean(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      numDays: z.number().nullable(),
      countries: z.array(z.string()),
    }),
  ),
})

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const

export const MCP_INSTRUCTIONS =
  "Este servidor es la memoria de viaje del usuario: sus viajes y los artículos que él mismo ha elegido como fuentes. Reglas: (1) No inventes recomendaciones — si algo no está en las fuentes del viaje ni en get_country_tasks, dilo y ofrece añadir una fuente. (2) Cuando cites una recomendación de una fuente, atribúyela a su autor y usa el enlace que devuelve la herramienta, que es el que ese autor publicó en su artículo. (3) Antes de escribir en el viaje, confirma con el usuario. (4) No inventes precios: los costes los pone el usuario."

export function registerWanderplannerTools(server: McpServer): void {
  server.registerTool(
    "list_trips",
    {
      title: "Listar viajes",
      description:
        "Lista los viajes del usuario en WanderPlanner (activos y archivados): nombre, fechas y número de días.",
      inputSchema: z.object({}),
      outputSchema: listTripsOutput,
      annotations: READ_ONLY,
    },
    async (_args, ctx) => {
      const token = tokenFromCtx(ctx)
      if (!token) return mcpNoSession()
      const supabase = createUserSupabase(token)
      const { data, error } = await supabase
        .from("trips")
        .select(MCP_TRIP_COLUMNS)
        .order("archived", { ascending: true })
      if (error) {
        return mcpTextError("No se pudieron leer los viajes. Inténtalo de nuevo.")
      }
      const result = listTripsResult((data ?? []) as McpTripRow[])
      return mcpOk(result.text, { trips: result.trips })
    },
  )

  server.registerTool(
    "get_trip",
    {
      title: "Ver un viaje",
      description:
        "Plan del viaje: sin `days` devuelve un resumen (una línea por día). Con `days` (números 1-based, hasta 7) detalla ítems, rutas y enlaces de esas jornadas. No incluye coordenadas ni el texto de Compartir.",
      inputSchema: getTripInput,
      outputSchema: getTripOutput,
      annotations: READ_ONLY,
    },
    async (args, ctx) => {
      const token = tokenFromCtx(ctx)
      if (!token) return mcpNoSession()
      const { tripId, days } = args as z.infer<typeof getTripInput>
      const supabase = createUserSupabase(token)
      const loaded = await loadAccessibleTrip<McpGetTripRow>(
        supabase,
        tripId,
        MCP_GET_TRIP_COLUMNS,
      )
      if (!loaded.ok) return tripLoadFailure(loaded)
      const mapped = mapGetTrip(loaded.row, days)
      return mcpOk(mapped.text, mapped.result)
    },
  )

  server.registerTool(
    "list_trip_sources",
    {
      title: "Listar fuentes del viaje",
      description:
        "Fuentes de inspiración del viaje: autor, título, área, días que declara el artículo y URL. Sin el HTML del artículo.",
      inputSchema: listTripSourcesInput,
      outputSchema: listTripSourcesOutput,
      annotations: READ_ONLY,
    },
    async (args, ctx) => {
      const token = tokenFromCtx(ctx)
      if (!token) return mcpNoSession()
      const { tripId } = args as z.infer<typeof listTripSourcesInput>
      const supabase = createUserSupabase(token)
      const loaded = await loadAccessibleTrip<McpListSourcesTripRow>(
        supabase,
        tripId,
        MCP_LIST_SOURCES_TRIP_COLUMNS,
      )
      if (!loaded.ok) return tripLoadFailure(loaded)
      const ids = asStringList(loaded.row.source_ids)
      const sources = await loadSourcesByIds<McpSourceMetaRow>(
        supabase,
        ids,
        MCP_SOURCE_META_COLUMNS,
      )
      if (!sources.ok) return mcpReadFailed()
      const mapped = listTripSourcesResult(loaded.row, sources.rows)
      return mcpOk(mapped.text, mapped.result)
    },
  )

  server.registerTool(
    "search_sources",
    {
      title: "Buscar en las fuentes del viaje",
      description:
        "Busca de forma determinista (nombre, tipo y área, sin IA) qué recomiendan los artículos del viaje. Devuelve autor, título, enlace del autor (`affiliateUrl`) y una cita corta si hay artículo. Filtra con `type` si el usuario habla de dormir, comer, etc.",
      inputSchema: searchSourcesInput,
      outputSchema: searchSourcesOutput,
      annotations: READ_ONLY,
    },
    async (args, ctx) => {
      const token = tokenFromCtx(ctx)
      if (!token) return mcpNoSession()
      const { tripId, query, type } = args as z.infer<typeof searchSourcesInput>
      const supabase = createUserSupabase(token)
      const loaded = await loadAccessibleTrip<SearchTripRow>(
        supabase,
        tripId,
        MCP_SEARCH_SOURCES_TRIP_COLUMNS,
      )
      if (!loaded.ok) return tripLoadFailure(loaded)
      const ids = asStringList(loaded.row.source_ids)
      const sources = await loadSourcesByIds<SearchSourceRow>(
        supabase,
        ids,
        MCP_SEARCH_SOURCE_COLUMNS,
      )
      if (!sources.ok) return mcpReadFailed()
      const hits = searchSources(query, sources.rows, loaded.row, type)
      const withQuotes = await attachSearchQuotes(hits, (sourceId, signal) =>
        fetchArticleHtml(supabase, sourceId, signal),
      )
      return mcpOk(searchSourcesText(query, withQuotes, sources.rows.length), {
        results: withQuotes,
      })
    },
  )

  server.registerTool(
    "get_trip_budget",
    {
      title: "Presupuesto del viaje",
      description:
        "Techo, cobertura, coste total y por persona, y veredicto. Los importes los pone el usuario; no inventes precios.",
      inputSchema: getTripBudgetInput,
      outputSchema: getTripBudgetOutput,
      annotations: READ_ONLY,
    },
    async (args, ctx) => {
      const token = tokenFromCtx(ctx)
      if (!token) return mcpNoSession()
      const { tripId } = args as z.infer<typeof getTripBudgetInput>
      const supabase = createUserSupabase(token)
      const loaded = await loadAccessibleTrip<McpBudgetRow>(
        supabase,
        tripId,
        MCP_GET_TRIP_BUDGET_COLUMNS,
      )
      if (!loaded.ok) return tripLoadFailure(loaded)
      try {
        const mapped = mapGetTripBudget(loaded.row)
        return mcpOk(mapped.text, mapped.result)
      } catch {
        return mcpReadFailed()
      }
    },
  )

  server.registerTool(
    "get_country_tasks",
    {
      title: "Trámites del país",
      description:
        "Trámites previos al viaje (visados, vacunas, documentación) según las recomendaciones del MAE para los países del viaje. Puede tardar si el servidor de la API está arrancando.",
      inputSchema: getCountryTasksInput,
      outputSchema: getCountryTasksOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      const token = tokenFromCtx(ctx)
      if (!token) return mcpNoSession()
      const { tripId } = args as z.infer<typeof getCountryTasksInput>
      const supabase = createUserSupabase(token)
      const loaded = await loadAccessibleTrip<McpCountryTasksTripRow>(
        supabase,
        tripId,
        MCP_COUNTRY_TASKS_TRIP_COLUMNS,
      )
      if (!loaded.ok) return tripLoadFailure(loaded)

      const explicit = asStringList(loaded.row.countries).map((c) => c.toUpperCase())
      let sourceRows: McpCountryTasksSourceRow[] = []
      if (explicit.length === 0) {
        const ids = asStringList(loaded.row.source_ids)
        const sources = await loadSourcesByIds<McpCountryTasksSourceRow>(
          supabase,
          ids,
          MCP_COUNTRY_TASKS_SOURCE_COLUMNS,
        )
        if (!sources.ok) return mcpReadFailed()
        sourceRows = sources.rows
      }
      const codes = countryCodesForMcpTrip(loaded.row, sourceRows)
      const fetched = await fetchCountryTasksWithToken(codes, token, {
        timeoutMs: COUNTRY_TASKS_FETCH_TIMEOUT_MS,
      })
      if (!fetched.ok) {
        return mcpTextError(countryTasksFetchErrorText(fetched))
      }
      const result = mapCountryTasks(
        fetched.result,
        extraTaskIdsFromRow(loaded.row.extra_tasks),
        asStringList(loaded.row.dismissed_country_tasks),
        codes,
      )
      return mcpOk(countryTasksText(result), result)
    },
  )
}

