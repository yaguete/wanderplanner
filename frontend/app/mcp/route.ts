import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { isMcpEnabled, mcpResourceOrigin } from "@/lib/mcp/config"
import { MCP_INSTRUCTIONS } from "@/lib/mcp/instructions"
import { MCP_STATIC_CAPABILITIES, withGracefulListen } from "@/lib/mcp/listen"
import { registerWanderplannerTools } from "@/lib/mcp/register-tools"
import { verifyMcpBearer } from "@/lib/mcp/verify-access-token"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** Tope por invocación (Fluid: Hobby default 300 s). 30 s cubre el arranque en frío de Fly. */
export const maxDuration = 30

const SERVER_INFO = { name: "wanderplanner", version: "0.1.0" }

const mcpHandler = withGracefulListen(
  createMcpHandler(
    (server) => {
      registerWanderplannerTools(server)
    },
    {
      serverInfo: SERVER_INFO,
      instructions: MCP_INSTRUCTIONS,
      capabilities: MCP_STATIC_CAPABILITIES,
    },
  ),
  SERVER_INFO,
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
