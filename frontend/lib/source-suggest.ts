/**
 * Kill switch y cliente de GET /sources/suggest (pestaña «Busca un destino»).
 *
 * - `NEXT_PUBLIC_SOURCE_SUGGEST_ENABLED=false` oculta el chip.
 * - `NEXT_PUBLIC_SOURCE_SUGGEST_WEB_ENABLED=true` habilita el escalón web abierta
 *   (Turnstile). Default apagado: caché + dominios curados bastan para el lanzamiento.
 */
import { parseApiDetail } from "@/lib/api"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export type SourceSuggestOrigin = "cache" | "curated" | "web"

export type SourceSuggestHit = {
  url: string
  title: string
  destination: string | null
  totalDays: number | null
  host: string
  origin: SourceSuggestOrigin
  instant: boolean
}

export type SourceSuggestResponse = {
  results: SourceSuggestHit[]
  needCaptcha: boolean
}

function envFlag(raw: string | undefined, fallback: boolean): boolean {
  const value = (raw ?? "").trim().toLowerCase()
  if (!value) return fallback
  return value !== "false" && value !== "0" && value !== "off" && value !== "no"
}

export function isSourceSuggestEnabled(): boolean {
  return envFlag(process.env.NEXT_PUBLIC_SOURCE_SUGGEST_ENABLED, true)
}

export function isSourceSuggestWebEnabled(): boolean {
  return envFlag(process.env.NEXT_PUBLIC_SOURCE_SUGGEST_WEB_ENABLED, false)
}

export class SourceSuggestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "SourceSuggestError"
    this.status = status
  }
}

function parseHit(raw: unknown): SourceSuggestHit | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (typeof row.url !== "string" || !row.url) return null
  const origin = row.origin
  if (origin !== "cache" && origin !== "curated" && origin !== "web") return null
  let host = typeof row.host === "string" ? row.host : ""
  if (!host) {
    try {
      host = new URL(row.url).hostname.replace(/^www\./i, "")
    } catch {
      host = ""
    }
  }
  return {
    url: row.url,
    title: typeof row.title === "string" && row.title.trim() ? row.title : host || row.url,
    destination: typeof row.destination === "string" ? row.destination : null,
    totalDays:
      typeof row.total_days === "number" && Number.isFinite(row.total_days)
        ? row.total_days
        : null,
    host,
    origin,
    instant: row.instant === true,
  }
}

export async function suggestSources(
  query: string,
  options?: { captchaToken?: string | null; signal?: AbortSignal },
): Promise<SourceSuggestResponse> {
  const params = new URLSearchParams({ q: query.trim() })
  if (options?.captchaToken) params.set("captcha_token", options.captchaToken)

  let response: Response
  try {
    response = await fetch(`${API_BASE}/sources/suggest?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: options?.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e
    throw new SourceSuggestError(
      "No se pudo contactar con el servidor. Comprueba tu conexión.",
      0,
    )
  }

  if (!response.ok) {
    let detail: unknown
    try {
      const body = await response.json()
      detail = body?.detail ?? body
    } catch {
      detail = null
    }
    const { message } = parseApiDetail(detail, response.status)
    const friendly =
      response.status === 404 && (message === "Not Found" || !detail)
        ? "La búsqueda de destinos no está disponible en este servidor."
        : message
    throw new SourceSuggestError(friendly, response.status)
  }

  const body = (await response.json()) as Record<string, unknown>
  const rawResults = Array.isArray(body.results) ? body.results : []
  return {
    results: rawResults.map(parseHit).filter((hit): hit is SourceSuggestHit => hit != null),
    needCaptcha: body.need_captcha === true,
  }
}
