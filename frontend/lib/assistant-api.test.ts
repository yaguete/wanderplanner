import assert from "node:assert/strict"
import { ApiLimitError } from "./api"
import { ASSISTANT_CONNECTION_ERROR, streamAssistant } from "./assistant-api"

const body = {
  trip_briefing: "x",
  countries: ["ES"],
  messages: [{ role: "user" as const, content: "hola" }],
}

async function captureError(): Promise<unknown> {
  let captured: unknown
  await streamAssistant(body, { onError: (err) => { captured = err } })
  return captured
}

async function main() {
  const origFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => {
      throw new TypeError("Load failed")
    }
    const network = await captureError()
    assert.equal(network, ASSISTANT_CONNECTION_ERROR)
    assert.ok(!String(network).includes("Load failed"))
    assert.ok(!String(network).toLowerCase().includes("api"))

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ detail: "boom" }), { status: 500 })
    assert.equal(await captureError(), ASSISTANT_CONNECTION_ERROR)

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          detail: { message: "Has llegado al límite diario", limit: "daily" },
        }),
        { status: 429 },
      )
    const limit = await captureError()
    assert.ok(limit instanceof ApiLimitError)
    assert.equal((limit as ApiLimitError).limit, "daily")
    assert.equal((limit as ApiLimitError).message, "Has llegado al límite diario")
  } finally {
    globalThis.fetch = origFetch
  }

  console.log("assistant-api.test.ts: ok")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
