import type { Itinerary } from "@/types/itinerary"
import { authHeaders } from "@/lib/api-auth"
import { parseSse } from "@/lib/sse"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export type ItineraryProgressStage = "fetching" | "extracting"

export type UsageLimitKind = "guest" | "daily" | "monthly"

/** Error HTTP 429 con cuota de uso (invitado vs registrado). */
export class ApiLimitError extends Error {
  readonly status = 429
  readonly limit: UsageLimitKind

  constructor(message: string, limit: UsageLimitKind) {
    super(message)
    this.name = "ApiLimitError"
    this.limit = limit
  }
}

function isUsageLimitKind(v: unknown): v is UsageLimitKind {
  return v === "guest" || v === "daily" || v === "monthly"
}

/** Extrae mensaje legible y, si aplica, construye ApiLimitError desde el body FastAPI. */
export function parseApiDetail(
  detail: unknown,
  status?: number,
): { message: string; limitError?: ApiLimitError } {
  if (detail != null && typeof detail === "object" && !Array.isArray(detail)) {
    const obj = detail as { message?: unknown; limit?: unknown; detail?: unknown }
    const message =
      typeof obj.message === "string" && obj.message.trim()
        ? obj.message
        : typeof obj.detail === "string"
          ? obj.detail
          : status != null
            ? `Error del servidor: HTTP ${status}`
            : "Error del servidor"
    if (status === 429 && isUsageLimitKind(obj.limit)) {
      return { message, limitError: new ApiLimitError(message, obj.limit) }
    }
    return { message }
  }
  if (Array.isArray(detail)) {
    return {
      message: detail.map((x) => String((x as { msg?: string }).msg ?? x)).join("; "),
    }
  }
  if (detail != null) {
    return { message: String(detail) }
  }
  return {
    message: status != null ? `Error del servidor: HTTP ${status}` : "Error del servidor",
  }
}

function parseDetail(detail: unknown, status?: number): string {
  return parseApiDetail(detail, status).message
}

export async function fetchItinerary(
  url: string,
  onProgress?: (stage: ItineraryProgressStage) => void,
): Promise<Itinerary> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/itinerary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(await authHeaders()),
      },
      body: JSON.stringify({ url }),
    })
  } catch (e) {
    const network =
      e instanceof TypeError
        ? `No se pudo conectar con el API en ${API_BASE}. Comprueba que el backend esté en marcha (p. ej. en el puerto 8000) y que CORS permita origin de esta app.`
        : e instanceof Error
          ? e.message
          : "Error de red"
    throw new Error(network)
  }

  // El 429 llega como HTTP normal antes del SSE; no leer el stream aún.
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { detail?: unknown }
    const { message, limitError } = parseApiDetail(error.detail, response.status)
    if (limitError) throw limitError
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error("La respuesta del API no es JSON válido")
  }

  let result: Itinerary | null = null
  try {
    for await (const { event, data } of parseSse(response.body.getReader())) {
      if (event === "progress") {
        const stage = (data as { stage?: string })?.stage
        if (stage === "fetching" || stage === "extracting") {
          onProgress?.(stage)
        }
        continue
      }
      if (event === "error") {
        const detail = (data as { detail?: unknown })?.detail
        throw new Error(parseDetail(detail))
      }
      if (event === "result") {
        if (data == null || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("La respuesta del API no es JSON válido")
        }
        result = data as Itinerary
      }
    }
  } catch (e) {
    if (e instanceof Error) throw e
    throw new Error("La respuesta del API no es JSON válido")
  }

  if (!result) {
    throw new Error("La respuesta del API no es JSON válido")
  }
  return result
}
