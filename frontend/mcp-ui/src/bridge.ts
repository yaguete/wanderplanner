type Pending = {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

const pending = new Map<number, Pending>()
let nextId = 1

export function mcpRequest(method: string, params: unknown): Promise<unknown> {
  const id = nextId++
  window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*")
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
  })
}

export function listenMcpMessages(onToolResult: (structured: unknown) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) return
    const message = event.data
    if (!message || message.jsonrpc !== "2.0") return

    if (message.id !== undefined && pending.has(message.id)) {
      const waiter = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) waiter?.reject(message.error)
      else waiter?.resolve(message.result)
      return
    }

    if (message.method === "ui/notifications/tool-result") {
      const params = message.params
      const structured =
        params && typeof params === "object" && "structuredContent" in params
          ? params.structuredContent
          : params
      onToolResult(structured ?? null)
    }
  }
  window.addEventListener("message", onMessage, { passive: true })
  return () => window.removeEventListener("message", onMessage)
}

export async function handshake(): Promise<unknown> {
  try {
    const result = await mcpRequest("ui/initialize", {
      protocolVersion: "2026-01-26",
    })
    window.parent.postMessage(
      { jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} },
      "*",
    )
    return result
  } catch {
    return null
  }
}
