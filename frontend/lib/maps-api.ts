/**
 * POST /maps/resolve — despliega short links de Google Maps en el backend.
 * Fail-open: sin backend, 429 o error de red → lista vacía.
 */
import { authHeaders } from "@/lib/api-auth"
import { canonicalizeMapsUrl } from "@/lib/maps-links"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export type ResolvedMapsPin = {
  url: string
  lng: number
  lat: number
}

export async function resolveMapsLinks(
  urls: string[],
  options?: { signal?: AbortSignal },
): Promise<ResolvedMapsPin[]> {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const raw of urls) {
    const href = raw.trim()
    if (!href) continue
    const key = canonicalizeMapsUrl(href)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(href)
  }
  if (unique.length === 0) return []

  let response: Response
  try {
    response = await fetch(`${API_BASE}/maps/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders()),
      },
      body: JSON.stringify({ urls: unique.slice(0, 20) }),
      signal: options?.signal,
    })
  } catch {
    return []
  }
  if (!response.ok) return []
  try {
    const body = (await response.json()) as { pins?: unknown }
    if (!Array.isArray(body.pins)) return []
    const out: ResolvedMapsPin[] = []
    for (const row of body.pins) {
      if (!row || typeof row !== "object") continue
      const rec = row as { url?: unknown; lng?: unknown; lat?: unknown }
      if (typeof rec.url !== "string" || !rec.url.trim()) continue
      if (typeof rec.lng !== "number" || typeof rec.lat !== "number") continue
      if (!Number.isFinite(rec.lng) || !Number.isFinite(rec.lat)) continue
      out.push({ url: rec.url, lng: rec.lng, lat: rec.lat })
    }
    return out
  } catch {
    return []
  }
}
