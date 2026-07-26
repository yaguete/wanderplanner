/**
 * Cliente SSE del asistente: POST /assistant/chat
 */
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
  onError?: (message: string) => void
}

function parseApiError(detail: unknown, status: number): string {
  if (Array.isArray(detail)) {
    return detail.map((x) => String((x as { msg?: string }).msg ?? x)).join("; ")
  }
  if (detail != null) return String(detail)
  return `Error del servidor: HTTP ${status}`
}

async function* parseSse(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<{
  event: string
  data: unknown
}> {
  const decoder = new TextDecoder()
  let buffer = ""
  let eventName = "message"
  let dataLines: string[] = []

  const flush = (): { event: string; data: unknown } | null => {
    if (!dataLines.length) {
      eventName = "message"
      return null
    }
    const raw = dataLines.join("\n")
    dataLines = []
    const ev = eventName
    eventName = "message"
    try {
      return { event: ev, data: JSON.parse(raw) }
    } catch {
      return { event: ev, data: raw }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split("\n")
    buffer = parts.pop() ?? ""
    for (const line of parts) {
      if (line === "") {
        const item = flush()
        if (item) yield item
        continue
      }
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart())
      }
    }
  }
  const last = flush()
  if (last) yield last
}

export async function streamAssistant(
  body: {
    trip_briefing: string
    countries: string[]
    messages: AssistantChatMessage[]
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

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { detail?: unknown }
    handlers.onError?.(parseApiError(error.detail, response.status))
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
