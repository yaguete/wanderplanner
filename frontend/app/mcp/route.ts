import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { z } from "zod"
import { isMcpEnabled, mcpResourceOrigin } from "@/lib/mcp/config"
import { listTripsResult, MCP_TRIP_COLUMNS, type McpTripRow } from "@/lib/mcp/list-trips"
import { createUserSupabase } from "@/lib/mcp/supabase"
import { verifyMcpBearer } from "@/lib/mcp/verify-access-token"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_trips",
      {
        title: "Listar viajes",
        description:
          "Lista los viajes del usuario en WanderPlanner (activos y archivados): nombre, fechas y número de días.",
        inputSchema: z.object({}),
        outputSchema: listTripsOutput,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async (_args, ctx) => {
        const auth = ctx.http?.authInfo
        const token = auth?.token
        if (!token) {
          return {
            isError: true,
            content: [{ type: "text", text: "No hay sesión. Vuelve a conectar WanderPlanner." }],
          }
        }

        const supabase = createUserSupabase(token)
        const { data, error } = await supabase
          .from("trips")
          .select(MCP_TRIP_COLUMNS)
          .order("archived", { ascending: true })

        if (error) {
          return {
            isError: true,
            content: [{ type: "text", text: "No se pudieron leer los viajes. Inténtalo de nuevo." }],
          }
        }

        const result = listTripsResult((data ?? []) as McpTripRow[])
        return {
          content: [{ type: "text", text: result.text }],
          structuredContent: { trips: result.trips },
        }
      },
    )
  },
  {
    serverInfo: { name: "wanderplanner", version: "0.1.0" },
    instructions:
      "Este servidor es la memoria de viaje del usuario: sus viajes en WanderPlanner. No inventes viajes ni recomendaciones que no salgan de las herramientas.",
  },
)

function handler(req: Request): Promise<Response> | Response {
  if (!isMcpEnabled()) {
    return new Response("MCP desactivado", {
      status: 503,
      headers: { "Retry-After": "3600" },
    })
  }
  return withMcpAuth(mcpHandler, verifyMcpBearer, {
    required: true,
    resourceUrl: mcpResourceOrigin(),
    resourceMetadataPath: "/.well-known/oauth-protected-resource",
  })(req)
}

export { handler as GET, handler as POST }
