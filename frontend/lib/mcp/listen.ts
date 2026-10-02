/**
 * `subscriptions/listen` (MCP 2026-07-28) abre un SSE que el SDK solo cierra
 * cuando el cliente cancela. En Vercel nada publica en ese bus (cada
 * invocación tiene el suyo en memoria y las tools no cambian), así que el
 * stream no llevaría nunca un aviso: solo agota `maxDuration`, Vercel lo corta
 * sin respuesta y el cliente lo toma por una caída y reconecta.
 *
 * Se deja que el SDK valide la petición y escriba el acuse, y se cierra al
 * momento con la respuesta `complete` que la especificación define como cierre
 * ordenado.
 */

const LISTEN_METHOD = "subscriptions/listen"
const SUBSCRIPTION_ID_META_KEY = "io.modelcontextprotocol/subscriptionId"
const SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo"
/** El SDK encola el acuse al crear el stream; si no llega, no se espera más. */
const ACK_WAIT_MS = 1_000

type JsonRpcId = string | number
export type McpServerInfo = { name: string; version: string }

export const MCP_STATIC_CAPABILITIES = {
  tools: { listChanged: false },
  resources: { listChanged: false },
} as const

export async function listenRequestId(req: Request): Promise<JsonRpcId | undefined> {
  if (req.method.toUpperCase() !== "POST") return undefined
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return undefined
  let body: unknown
  try {
    body = await req.clone().json()
  } catch {
    return undefined
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined
  const { method, id } = body as { method?: unknown; id?: unknown }
  if (method !== LISTEN_METHOD) return undefined
  return typeof id === "string" || typeof id === "number" ? id : undefined
}

export function listenCompleteFrame(id: JsonRpcId, serverInfo: McpServerInfo): string {
  const message = {
    jsonrpc: "2.0",
    id,
    result: {
      resultType: "complete",
      _meta: { [SUBSCRIPTION_ID_META_KEY]: id, [SERVER_INFO_META_KEY]: serverInfo },
    },
  }
  return `event: message\ndata: ${JSON.stringify(message)}\n\n`
}

function isEventStream(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").includes("text/event-stream")
}

async function readAck(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<Uint8Array | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ACK_WAIT_MS)
  })
  try {
    const chunk = await Promise.race([reader.read(), timeout])
    return chunk?.value
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

async function endListenStream(
  response: Response,
  id: JsonRpcId,
  serverInfo: McpServerInfo,
): Promise<Response> {
  const reader = response.body!.getReader()
  const ack = await readAck(reader)
  void reader.cancel().catch(() => {})
  const complete = new TextEncoder().encode(listenCompleteFrame(id, serverInfo))
  const head = ack ?? new Uint8Array(0)
  const body = new Uint8Array(head.length + complete.length)
  body.set(head)
  body.set(complete, head.length)
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

export function withGracefulListen(
  handler: (req: Request) => Promise<Response>,
  serverInfo: McpServerInfo,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const id = await listenRequestId(req)
    const response = await handler(req)
    if (id === undefined || !response.body || !isEventStream(response)) return response
    console.info("[mcp] subscriptions/listen cerrado sin esperar")
    return endListenStream(response, id, serverInfo)
  }
}
