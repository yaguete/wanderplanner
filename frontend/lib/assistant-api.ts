/**
 * Cliente SSE del asistente: POST /assistant/chat
 */
import { ApiLimitError, parseApiDetail } from "@/lib/api"
import { authHeaders } from "@/lib/api-auth"
import { parseSse } from "@/lib/sse"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export type AssistantChatMessage = {
  role: "user" | "assistant"
  content: string
}

export type AssistantAction =
  | {
      kind: "add_source"
      url: string
      title: string
      why: string
    }
  | {
      kind: "add_item"
      day_id: string
      type: "transport" | "stay" | "food" | "activity"
      name: string
      detail?: string | null
      region?: string | null
    }

export type AssistantStreamHandlers = {
  onDelta?: (text: string) => void
  onTool?: (payload: { name: string; status: "running" | "done"; args?: unknown }) => void
  /** Cierra el bocadillo actual; el siguiente delta abre uno nuevo. */
  onSegment?: () => void
  onStatus?: (label: string | null) => void
  onAction?: (action: AssistantAction) => void
  onDone?: () => void
  onError?: (error: string | ApiLimitError) => void
}

export async function streamAssistant(
  body: {
    trip_briefing: string
    countries: string[]
    messages: AssistantChatMessage[]
    /** Perfil de viajero en markdown (tipos, notas y referencias favoritas). */
    user_profile?: string | null
    /** Dominios de las referencias del usuario: Tavily los prioriza. */
    preferred_domains?: string[]
  },
  handlers: AssistantStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/assistant/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(await authHeaders()),
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (signal?.aborted) return
    const network =
      e instanceof TypeError
        ? `No se pudo conectar con el API en ${API_BASE}. Comprueba que el backend esté en marcha.`
        : e instanceof Error
          ? e.message
          : "Error de red"
    handlers.onError?.(network)
    return
  }

  // El 429 llega como HTTP normal antes del SSE.
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { detail?: unknown }
    const { message, limitError } = parseApiDetail(error.detail, response.status)
    handlers.onError?.(limitError ?? message)
    return
  }

  if (!response.body) {
    handlers.onError?.("Respuesta sin cuerpo")
    return
  }

  const reader = response.body.getReader()
  try {
    for await (const { event, data } of parseSse(reader)) {
      if (signal?.aborted) break
      const payload = data as Record<string, unknown>
      switch (event) {
        case "delta":
          if (typeof payload.text === "string") handlers.onDelta?.(payload.text)
          break
        case "segment":
          handlers.onSegment?.()
          break
        case "status":
          handlers.onStatus?.(
            payload.label == null ? null : String(payload.label),
          )
          break
        case "tool":
          handlers.onTool?.({
            name: String(payload.name ?? ""),
            status: payload.status === "done" ? "done" : "running",
            args: payload.args,
          })
          break
        case "action":
          handlers.onAction?.(payload as AssistantAction)
          break
        case "done":
          handlers.onDone?.()
          break
        case "error":
          handlers.onError?.(String(payload.message ?? "Error del asistente"))
          break
        default:
          break
      }
    }
  } catch (e) {
    if (signal?.aborted) return
    handlers.onError?.(e instanceof Error ? e.message : "Error leyendo el stream")
  }
}
