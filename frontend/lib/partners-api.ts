import { parseApiDetail } from "@/lib/api"
import { parseSse } from "@/lib/sse"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export type PrewarmProgressStage = "fetching" | "extracting"

export type PrewarmCounts = {
  accommodations: number
  activities: number
  transport: number
  basics: number
}

export type PrewarmResult = {
  status: "cached" | "extracted"
  destination: string | null
  total_days: number | null
  items: number
  counts: PrewarmCounts
  og_image: string | null
  og_title: string | null
}

export class PrewarmError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "PrewarmError"
    this.status = status
  }
}

function progressLabel(stage: PrewarmProgressStage): string {
  if (stage === "fetching") return "El artículo no está al día. Leyéndolo…"
  return "Sintetizando la ruta…"
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0
}

function parsePrewarmCounts(raw: unknown): PrewarmCounts {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}
  return {
    accommodations: asCount(obj.accommodations),
    activities: asCount(obj.activities),
    transport: asCount(obj.transport),
    basics: asCount(obj.basics),
  }
}

/**
 * Dispara POST /partners/prewarm (SSE). Sin Bearer: el endpoint es público.
 */
export async function prewarmSource(
  url: string,
  options?: {
    captchaToken?: string | null
    onProgress?: (label: string) => void
    signal?: AbortSignal
  },
): Promise<PrewarmResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/partners/prewarm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        url,
        captcha_token: options?.captchaToken ?? null,
      }),
      signal: options?.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e
    throw new PrewarmError(
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
    if (response.status === 403) {
      throw new PrewarmError(
        message || "Captcha inválido o ausente. Recarga e inténtalo de nuevo.",
        403,
      )
    }
    if (response.status === 429) {
      throw new PrewarmError(
        message || "Has alcanzado el límite diario de precalentados. Vuelve mañana.",
        429,
      )
    }
    if (response.status === 503) {
      throw new PrewarmError(
        message || "El precalentado no está disponible ahora mismo.",
        503,
      )
    }
    throw new PrewarmError(message, response.status)
  }

  if (!response.body) {
    throw new PrewarmError("Respuesta vacía del servidor", response.status)
  }

  let result: PrewarmResult | null = null
  for await (const { event, data } of parseSse(response.body.getReader())) {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }
    if (event === "progress") {
      const stage = (data as { stage?: string })?.stage
      if (stage === "fetching" || stage === "extracting") {
        options?.onProgress?.(progressLabel(stage))
      }
      continue
    }
    if (event === "error") {
      const detail = (data as { detail?: unknown })?.detail
      throw new PrewarmError(
        typeof detail === "string" ? detail : "Error al sintetizar la fuente",
        500,
      )
    }
    if (event === "result") {
      if (data == null || typeof data !== "object" || Array.isArray(data)) {
        throw new PrewarmError("La respuesta del API no es JSON válido", 500)
      }
      const raw = data as Record<string, unknown>
      result = {
        status: raw.status === "cached" ? "cached" : "extracted",
        destination: typeof raw.destination === "string" ? raw.destination : null,
        total_days:
          typeof raw.total_days === "number" && Number.isFinite(raw.total_days)
            ? raw.total_days
            : null,
        items: asCount(raw.items),
        counts: parsePrewarmCounts(raw.counts),
        og_image: typeof raw.og_image === "string" ? raw.og_image : null,
        og_title: typeof raw.og_title === "string" ? raw.og_title.trim() || null : null,
      }
    }
  }

  if (!result) {
    throw new PrewarmError("El servidor no devolvió resultado", 500)
  }
  return result
}
