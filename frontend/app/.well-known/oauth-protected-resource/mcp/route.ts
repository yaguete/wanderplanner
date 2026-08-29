import {
  mcpProtectedResourceGet,
  mcpProtectedResourceOptions,
} from "@/lib/mcp/protected-resource"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(req: Request): Response {
  return mcpProtectedResourceGet(req)
}

export const OPTIONS = mcpProtectedResourceOptions
