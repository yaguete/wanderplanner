import assert from "node:assert/strict"
import { turnstileFailureMessage, waitForTurnstileApi } from "./turnstile"

// ---------- mensajes ----------

assert.equal(
  turnstileFailureMessage("load"),
  "No se pudo cargar el captcha de Cloudflare. Desactiva el bloqueador para challenges.cloudflare.com o recarga.",
)
assert.equal(
  turnstileFailureMessage("widget", "110200"),
  "Este host no está en el widget de Turnstile. Añade localhost (o 127.0.0.1) en Hostname management.",
)
assert.equal(
  turnstileFailureMessage("widget", "110100"),
  "La clave del captcha no es válida. Revisa NEXT_PUBLIC_TURNSTILE_SITE_KEY.",
)
assert.equal(turnstileFailureMessage("timeout"), "El captcha no terminó a tiempo. Reinténtalo.")
assert.equal(turnstileFailureMessage("widget"), "No se pudo verificar el captcha. Reinténtalo.")
assert.equal(turnstileFailureMessage("widget", "empty"), "No se pudo verificar el captcha. Reinténtalo.")

// ---------- DOM de mentira ----------
//
// Lo justo para ejercitar la carga de api.js sin jsdom: el runner es `tsx`, no vitest.

type Listener = () => void

class FakeScript {
  src = ""
  async = false
  private attrs = new Map<string, string>()
  private listeners = new Map<string, Listener[]>()
  removed = false

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }
  hasAttribute(name: string) {
    return this.attrs.has(name)
  }
  addEventListener(type: string, fn: Listener) {
    const list = this.listeners.get(type) ?? []
    list.push(fn)
    this.listeners.set(type, list)
  }
  dispatch(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn()
  }
  remove() {
    this.removed = true
    scripts = scripts.filter((s) => s !== this)
  }
}

let scripts: FakeScript[] = []

function installFakeDom() {
  scripts = []
  const win: Record<string, unknown> = {
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: unknown) => clearTimeout(id as NodeJS.Timeout),
    turnstile: undefined,
  }
  const doc = {
    querySelector: (selector: string) => {
      const match = /^script\[([^\]]+)\]$/.exec(selector)
      if (!match) return null
      return scripts.find((s) => s.hasAttribute(match[1])) ?? null
    },
    createElement: () => new FakeScript(),
    head: {
      appendChild: (script: FakeScript) => {
        scripts.push(script)
        return script
      },
    },
  }
  ;(globalThis as Record<string, unknown>).window = win
  ;(globalThis as Record<string, unknown>).document = doc
  return win
}

/**
 * Réplica del api.js real: `window.turnstile.ready()` LANZA si el script se cargó con
 * async/defer, que es siempre nuestro caso (script inyectado desde JS).
 * Si alguien vuelve a llamar a `ready()`, este doble revienta y el test cae.
 */
function simulateApiJsLoad(win: Record<string, unknown>, script: FakeScript, callOnload = true) {
  win.turnstile = {
    render: () => "widget-1",
    remove: () => {},
    reset: () => {},
    ready: () => {
      throw new Error(
        "[Cloudflare Turnstile] Remove async/defer from the Turnstile api.js script tag before using turnstile.ready().",
      )
    },
  }
  if (!callOnload) return
  const onload = new URL(script.src).searchParams.get("onload")
  assert.ok(onload, "api.js debe pedirse con ?onload= : es la via soportada con async")
  const fn = win[onload]
  assert.equal(typeof fn, "function", "el global de onload debe existir antes de cargar api.js")
  ;(fn as () => void)()
}

async function run() {
  // 1. El caso que rompio el login: api.js carga y avisa por `onload`.
  //    Con `ready()` de por medio la promesa no resolvia nunca y saltaba el timeout de 8 s.
  {
    const win = installFakeDom()
    const pending = waitForTurnstileApi()
    assert.equal(scripts.length, 1, "debe inyectar api.js una sola vez")
    assert.equal(scripts[0].async, true)
    simulateApiJsLoad(win, scripts[0])
    const api = await pending
    assert.equal(typeof api.render, "function")
  }

  // 2. Script ya cargado por un montaje anterior: `onload` no vuelve a dispararse.
  {
    const win = installFakeDom()
    win.turnstile = { render: () => "w", remove: () => {}, reset: () => {} }
    const api = await waitForTurnstileApi()
    assert.equal(typeof api.render, "function")
    assert.equal(scripts.length, 0, "no debe reinyectar api.js si el API ya esta viva")
  }

  // 3. Red de seguridad: `onload` no llega nunca y el sondeo salva la carga.
  {
    const win = installFakeDom()
    const pending = waitForTurnstileApi()
    simulateApiJsLoad(win, scripts[0], false)
    const api = await pending
    assert.equal(typeof api.render, "function")
  }

  // 4. api.js no carga (bloqueador, red): «load», no un cuelgue de 8 s.
  {
    installFakeDom()
    const pending = waitForTurnstileApi()
    scripts[0].dispatch("error")
    await assert.rejects(pending, (err: Error) => err.message === "load")
  }

  // 5. Tras un fallo, «Reintentar captcha» vuelve a pedir el script de verdad.
  {
    const win = installFakeDom()
    const failing = waitForTurnstileApi()
    scripts[0].dispatch("error")
    await assert.rejects(failing)

    const retry = waitForTurnstileApi()
    assert.equal(scripts.length, 1, "el <script> muerto se sustituye, no se reutiliza")
    simulateApiJsLoad(win, scripts[0])
    const api = await retry
    assert.equal(typeof api.render, "function")
  }

  console.log("turnstile: ok")
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
