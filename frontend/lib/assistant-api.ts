/**
 * Cliente SSE del asistente: POST /assistant/chat
 */
import { ApiLimitError, parseApiDetail } from "@/lib/api"
import { authHeaders } from "@/lib/api-auth"
import { parseSse } from "@/lib/sse"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

/** Fallo de red/stream: copy de producto, sin URLs ni “configura el API”. */
export const ASSISTANT_CONNECTION_ERROR =
  "Hemos encontrado un problema de conexión. Inténtalo más tarde."

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
      source_id?: string | null
      source_item_id?: string | null
      source_author?: string | null
      day_number?: number | null
      /**
       * Recomendación nueva (sin fuente): URL oficial / entradas que encontró
       * el modelo. En `stay` se ignora: el Booking propio se genera al confirmar.
       */
      url?: string | null
      /** Snapshot del afiliado de la fuente (no lo emite el modelo). */
      affiliate_url?: string | null
      vendor?: string | null
    }
  | {
      kind: "move_item"
      item_id: string
      to_day_id: string
      name?: string | null
      why?: string | null
      anchor_item_id?: string | null
      position?: "before" | "after" | null
      from_day_id?: string | null
      from_day_number?: number | null
      to_day_number?: number | null
    }
  | {
      kind: "swap_items"
      item_id_a: string
      item_id_b: string
      name_a?: string | null
      name_b?: string | null
      why?: string | null
      day_number_a?: number | null
      day_number_b?: number | null
    }
  | {
      kind: "remove_item"
      item_id: string
      name?: string | null
      why?: string | null
      day_number?: number | null
      cost_at_risk?: number | null
    }
  | {
      kind: "add_transport"
      day_id: string
      from: string
      to: string
      mode?: string | null
      why?: string | null
      day_number?: number | null
    }
  | {
      kind: "add_extra_task"
      title: string
      category: string
      why?: string | null
    }
  | {
      kind: "add_basic"
      source_id: string
      source_basic_id: string
      name?: string | null
      why?: string | null
      source_author?: string | null
    }
  | {
      kind: "set_task_cost"
      task_ref: string
      cost: number
      why?: string | null
      task_title?: string | null
      previous_cost?: number | null
    }

export type AssistantStreamHandlers = {
  onDelta?: (text: string) => void
  onTool?: (payload: { name: string; status: "running" | "done"; args?: unknown }) => void
  /** Cierra el bocadillo actual; el siguiente delta abre uno nuevo. */
  onSegment?: () => void
  onStatus?: (label: string | null) => void
  onAction?: (action: AssistantAction) => void
  onFollowups?: (prompts: string[]) => void
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
    handlers.onError?.(ASSISTANT_CONNECTION_ERROR)
    return
  }

  // El 429 llega como HTTP normal antes del SSE.
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { detail?: unknown }
    const { limitError } = parseApiDetail(error.detail, response.status)
    handlers.onError?.(limitError ?? ASSISTANT_CONNECTION_ERROR)
    return
  }

  if (!response.body) {
    handlers.onError?.(ASSISTANT_CONNECTION_ERROR)
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
        case "followups": {
          const raw = payload.prompts
          const prompts = Array.isArray(raw)
            ? raw.map((p) => String(p).trim()).filter(Boolean).slice(0, 3)
            : []
          if (prompts.length) handlers.onFollowups?.(prompts)
          break
        }
        case "done":
          handlers.onDone?.()
          break
        case "error":
          handlers.onError?.(ASSISTANT_CONNECTION_ERROR)
          break
        default:
          break
      }
    }
  } catch (e) {
    if (signal?.aborted) return
    handlers.onError?.(ASSISTANT_CONNECTION_ERROR)
  }
}
