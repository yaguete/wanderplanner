import assert from "node:assert/strict"
import { createMcpHandler } from "mcp-handler"
import { z } from "zod"
import { MCP_STATIC_CAPABILITIES, listenCompleteFrame, listenRequestId, withGracefulListen } from "./listen"

const SERVER_INFO = { name: "wanderplanner-test", version: "0.0.0" }
const REVISION = "2026-07-28"

const sdkHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "ping",
      { description: "ping", inputSchema: z.object({}) },
      async () => ({ content: [{ type: "text", text: "pong" }] }),
    )
    server.registerResource(
      "widget",
      "ui://test/widget.html",
      { mimeType: "text/html" },
      async (uri) => ({ contents: [{ uri: uri.href, text: "<p>hola</p>" }] }),
    )
  },
  { serverInfo: SERVER_INFO, capabilities: MCP_STATIC_CAPABILITIES },
)
const handler = withGracefulListen(sdkHandler, SERVER_INFO)

function modernRequest(method: string, id: number, params: Record<string, unknown> = {}): Request {
  return new Request("https://mcp.example.test/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": REVISION,
      "mcp-method": method,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": REVISION,
          "io.modelcontextprotocol/clientInfo": { name: "test-client", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  })
}

const listenParams = {
  notifications: { toolsListChanged: true, resourcesListChanged: true },
}

async function readWithin(response: Response, ms: number): Promise<string | "timeout"> {
  let handle: ReturnType<typeof setTimeout> | undefined
  const timer = new Promise<"timeout">((resolve) => {
    handle = setTimeout(() => resolve("timeout"), ms)
  })
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const drain = (async () => {
    let text = ""
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return text
      text += decoder.decode(value, { stream: true })
    }
  })()
  const result = await Promise.race([drain, timer])
  clearTimeout(handle)
  if (result === "timeout") await reader.cancel().catch(() => {})
  return result
}

async function run() {
  assert.equal(await listenRequestId(modernRequest("subscriptions/listen", 7, listenParams)), 7)
  assert.equal(await listenRequestId(modernRequest("tools/list", 8)), undefined)
  assert.equal(await listenRequestId(new Request("https://x.test/mcp")), undefined)
  assert.equal(
    await listenRequestId(
      new Request("https://x.test/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{no es json",
      }),
    ),
    undefined,
  )

  // Sin el envoltorio, el SDK deja el stream abierto: es lo que Vercel cortaba a los 30 s.
  const raw = await sdkHandler(modernRequest("subscriptions/listen", 1, listenParams))
  assert.match(raw.headers.get("content-type") ?? "", /text\/event-stream/)
  assert.equal(await readWithin(raw, 300), "timeout")

  const started = Date.now()
  const listen = await handler(modernRequest("subscriptions/listen", 2, listenParams))
  assert.equal(listen.status, 200)
  assert.match(listen.headers.get("content-type") ?? "", /text\/event-stream/)
  const body = await readWithin(listen, 2_000)
  assert.notEqual(body, "timeout", "el listen tiene que terminar solo")
  assert.ok(Date.now() - started < 2_000)
  assert.match(body, /notifications\/subscriptions\/acknowledged/)
  assert.match(body, /"notifications":\{\}/, "sin listChanged no se acepta ningún aviso")
  assert.ok(body.endsWith(listenCompleteFrame(2, SERVER_INFO)))

  const frames = body.trim().split("\n\n").map((frame) => JSON.parse(frame.replace(/^event: message\ndata: /, "")))
  const last = frames.at(-1)
  assert.equal(last.id, 2)
  assert.equal(last.result.resultType, "complete")
  assert.equal(last.result._meta["io.modelcontextprotocol/subscriptionId"], 2)

  const discover = await handler(modernRequest("server/discover", 3))
  const discoverText = await readWithin(discover, 2_000)
  assert.notEqual(discoverText, "timeout")
  const discoverJson = JSON.parse(discoverText.replace(/^[\s\S]*?data: /, "").trim())
  assert.equal(discoverJson.result.capabilities.tools.listChanged, false)
  assert.equal(discoverJson.result.capabilities.resources.listChanged, false)

  const tools = await handler(modernRequest("tools/list", 4))
  const toolsText = await readWithin(tools, 2_000)
  assert.notEqual(toolsText, "timeout")
  assert.match(toolsText, /"ping"/)

  console.log("mcp-listen: ok")
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
