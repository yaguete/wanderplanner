import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { hostnameFromHeaders, robotsForHostname } from "@/lib/mcp/host"

export default async function robots(): Promise<MetadataRoute.Robots> {
  const hostname = hostnameFromHeaders(await headers())
  return robotsForHostname(hostname)
}
