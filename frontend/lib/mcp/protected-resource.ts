import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
} from "mcp-handler"
import { mcpResourceUrl, supabaseIssuer } from "@/lib/mcp/config"

/** RFC 9728: el `resource` es el identificador del MCP, no el origen. */
export function mcpProtectedResourceGet(req: Request): Response {
  return protectedResourceHandler({
    authServerUrls: [supabaseIssuer()],
    resourceUrl: mcpResourceUrl(),
  })(req)
}

export const mcpProtectedResourceOptions = metadataCorsOptionsRequestHandler()
