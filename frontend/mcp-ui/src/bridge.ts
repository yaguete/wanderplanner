type Pending = {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

type HostBridge = {
  getPayload: () => unknown
  subscribe: (fn: (payload: unknown) => void) => () => void
  request: (method: string, params: unknown, timeoutMs?: number) => Promise<unknown>
}

declare global {
  interface Window {
    __WP_MCP_PAYLOAD?: unknown
    __wpMcp?: HostBridge
  }
}

const pending = new Map<number, Pending>()
let nextId = 1
let fallbackListening = false

export const OPENAI_SET_GLOBALS_EVENT = "openai:set_globals"
export const WP_MCP_PAYLOAD_EVENT = "wp:mcp-payload"

export function mcpRequest(method: string, params: unknown, timeoutMs = 8000): Promise<unknown> {
  if (window.__wpMcp?.request) {
    return window.__wpMcp.request(method, params, timeoutMs)
  }
  const id = nextId++
  window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*")
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    window.setTimeout(() => {
      if (!pending.has(id)) return
      pending.delete(id)
      reject(new Error("timeout"))
    }, timeoutMs)
  })
}

function ensureFallbackListener() {
  if (fallbackListening) return
  fallbackListening = true
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source && event.source !== window.parent) return
    const message = event.data
    if (!message || message.jsonrpc !== "2.0") return
    if (message.id !== undefined && pending.has(message.id)) {
      const waiter = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) waiter?.reject(message.error)
      else waiter?.resolve(message.result)
    }
  })
}

export function listenMcpMessages(onToolResult: (structured: unknown) => void): () => void {
  const fromBootstrap = window.__wpMcp?.subscribe(onToolResult)
  const onCustom = (event: Event) => {
    onToolResult((event as CustomEvent).detail)
  }
  window.addEventListener(WP_MCP_PAYLOAD_EVENT, onCustom)

  const onMessage = (event: MessageEvent) => {
    if (event.source && event.source !== window.parent) return
    const message = event.data
    if (!message || message.jsonrpc !== "2.0") return
    if (message.method === "ui/notifications/tool-result") {
      const params = message.params
      const structured =
        params && typeof params === "object" && "structuredContent" in params
          ? params.structuredContent
          : params
      onToolResult(structured ?? null)
    }
  }
  window.addEventListener("message", onMessage)

  if (window.__WP_MCP_PAYLOAD != null) onToolResult(window.__WP_MCP_PAYLOAD)
  else if (window.__wpMcp?.getPayload() != null) onToolResult(window.__wpMcp.getPayload())

  return () => {
    fromBootstrap?.()
    window.removeEventListener(WP_MCP_PAYLOAD_EVENT, onCustom)
    window.removeEventListener("message", onMessage)
  }
}

/** Si el HTML se sirvió sin bootstrap (tests), completa el handshake con tope. */
export function startWidgetHost(): void {
  if (window.__wpMcp) return
  ensureFallbackListener()
  void mcpRequest(
    "ui/initialize",
    {
      protocolVersion: "2026-01-26",
      appCapabilities: { availableDisplayModes: ["inline"] },
    },
    400,
  ).finally(() => {
    window.parent.postMessage(
      { jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} },
      "*",
    )
  })
}
