import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { isMcpEnabled, mcpResourceOrigin } from "@/lib/mcp/config"
import { MCP_INSTRUCTIONS, registerWanderplannerTools } from "@/lib/mcp/register-tools"
import { verifyMcpBearer } from "@/lib/mcp/verify-access-token"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** Tope por invocación (Fluid: Hobby default 300 s). 30 s cubre el arranque en frío de Fly. */
export const maxDuration = 30

const mcpHandler = createMcpHandler(
  (server) => {
    registerWanderplannerTools(server)
  },
  {
    serverInfo: { name: "wanderplanner", version: "0.1.0" },
    instructions: MCP_INSTRUCTIONS,
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
