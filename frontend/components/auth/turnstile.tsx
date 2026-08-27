"use client"

/**
 * Cloudflare Turnstile para proteger los flujos públicos de autenticación y /partners.
 * Si `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no está definida, el componente no renderiza nada y
 * `isTurnstileEnabled()` devuelve false: en local se entra sin captcha **solo** si Auth
 * tampoco exige token (Supabase local). Contra el proyecto gestionado, el login sin
 * captcha responde `captcha_failed`.
 *
 * ❌ NUNCA llamar a `turnstile.ready()`. Su primera línea es:
 *     ready: function(cb){ g.scriptWasLoadedAsync && (warn(...), throwTurnstileError(...)), ... }
 * Es decir: si api.js se cargó con async/defer, `ready()` **lanza** siempre, no falla
 * "a veces". Un script inyectado desde JS es async por definición, así que para nosotros
 * lanzaba el 100% de las veces. Al hacerlo dentro de un `setTimeout`, la excepción salía
 * fuera de la promesa: nadie la capturaba, `waitForTurnstileApi` no resolvía jamás y a los
 * 8 s saltaba READY_MS con «El captcha no terminó a tiempo» sobre un hueco vacío. Login,
 * alta, recuperación, /start, invitado y partners: todos muertos a la vez.
 * Por eso `ready` no está en `TurnstileApi`: que no compile es la defensa.
 *
 * La vía soportada con async es el parámetro `onload=` de api.js: Cloudflare invoca ese
 * global cuando el API está lista. Mantenemos además un sondeo de `window.turnstile.render`
 * como red de seguridad (script ya cargado por un montaje anterior, o `onload` que no llega).
 *
 * En `next dev`, React Strict Mode monta/desmonta el efecto: un `render()` síncrono
 * deja el widget zombi. El `setTimeout` cancela el primer montaje. Nunca vaciar el
 * contenedor con `innerHTML`: hay que `remove()`.
 *
 * El token es de un solo uso. Flujos que se quedan en la misma página (p. ej. /partners)
 * deben pasar un `resetKey` que cambie tras cada envío para re-montar el widget.
 */
import { useEffect, useRef, useState } from "react"

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""
/** Global que invoca api.js al terminar de inicializarse (`onload=` en la URL). */
const CALLBACK_NAME = "__wpTurnstileOnload"
const SCRIPT_SRC = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${CALLBACK_NAME}`
/** Marca propia: buscar por `src` es frágil porque la URL lleva query. */
const SCRIPT_MARKER = "data-wp-turnstile"
const STRICT_MODE_DEFER_MS = 50
const POLL_MS = 50
const READY_MS = 8_000

type TurnstileAppearance = "always" | "execute" | "interaction-only"

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      "error-callback"?: (error?: string) => void
      "expired-callback"?: () => void
      "timeout-callback"?: () => void
      appearance?: TurnstileAppearance
      theme?: "auto" | "light" | "dark"
      size?: "normal" | "compact" | "flexible"
    },
  ) => string
  remove: (id: string) => void
  reset: (id: string) => void
  // `ready` existe en el API real y está omitido a propósito: ver la cabecera.
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export function isTurnstileEnabled(): boolean {
  return Boolean(SITE_KEY)
}

export function turnstileFailureMessage(kind: "load" | "widget" | "timeout", errorCode = ""): string {
  const code = errorCode.trim()
  if (kind === "load") {
    return "No se pudo cargar el captcha de Cloudflare. Desactiva el bloqueador para challenges.cloudflare.com o recarga."
  }
  if (code === "110200") {
    return "Este host no está en el widget de Turnstile. Añade localhost (o 127.0.0.1) en Hostname management."
  }
  if (code === "110100") {
    return "La clave del captcha no es válida. Revisa NEXT_PUBLIC_TURNSTILE_SITE_KEY."
  }
  if (kind === "timeout") {
    return "El captcha no terminó a tiempo. Reinténtalo."
  }
  return "No se pudo verificar el captcha. Reinténtalo."
}

/** El API solo sirve cuando `render` existe: `window.turnstile` se puebla por fases. */
function readyApi(): TurnstileApi | null {
  if (typeof window === "undefined") return null
  const api = window.turnstile
  return api && typeof api.render === "function" ? api : null
}

type Waiter = (error: Error | null, api?: TurnstileApi) => void

const waiters = new Set<Waiter>()
/** Un `load` fallido deja el <script> muerto: al reintentar hay que tirarlo y volver a pedirlo. */
let scriptFailed = false

function notifyWaiters(error: Error | null, api?: TurnstileApi) {
  const pending = [...waiters]
  waiters.clear()
  for (const waiter of pending) waiter(error, api)
}

function ensureScript() {
  const stale = document.querySelector<HTMLScriptElement>(`script[${SCRIPT_MARKER}]`)
  if (stale && !scriptFailed) return
  if (stale) stale.remove()
  scriptFailed = false

  const globals = window as unknown as Record<string, unknown>
  globals[CALLBACK_NAME] = () => notifyWaiters(null, readyApi() ?? undefined)

  const script = document.createElement("script")
  script.src = SCRIPT_SRC
  script.async = true
  script.setAttribute(SCRIPT_MARKER, "true")
  script.addEventListener(
    "error",
    () => {
      scriptFailed = true
      notifyWaiters(new Error("load"))
    },
    { once: true },
  )
  document.head.appendChild(script)
}

export function waitForTurnstileApi(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("load"))
      return
    }

    // Script ya cargado por un montaje anterior: `onload` no volverá a dispararse.
    const loaded = readyApi()
    if (loaded) {
      resolve(loaded)
      return
    }

    let settled = false
    const finish = (error: Error | null, api?: TurnstileApi) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      waiters.delete(waiter)
      if (error || !api) reject(error ?? new Error("load"))
      else resolve(api)
    }

    const timeout = window.setTimeout(() => finish(new Error("timeout")), READY_MS)
    const waiter: Waiter = (error, api) => finish(error, api ?? readyApi() ?? undefined)
    waiters.add(waiter)

    ensureScript()

    // Red de seguridad por si `onload=` no llega (proxy que reescribe la URL, api.js
    // servida desde caché rara). Sondear es barato y nos ahorra depender de un único hilo.
    const poll = () => {
      if (settled) return
      const api = readyApi()
      if (api) {
        finish(null, api)
        return
      }
      window.setTimeout(poll, POLL_MS)
    }
    window.setTimeout(poll, POLL_MS)
  })
}

export function Turnstile({
  onToken,
  resetKey = 0,
  appearance = "always",
  theme = "auto",
}: {
  onToken: (token: string | null) => void
  /** Cambia este valor para re-montar el widget (token de un solo uso). */
  resetKey?: number | string
  /** `interaction-only` no pinta el widget salvo que Cloudflare lo pida. */
  appearance?: TurnstileAppearance
  theme?: "auto" | "light" | "dark"
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken
  const [error, setError] = useState<string | null>(null)
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    if (!SITE_KEY) return
    let widgetId: string | null = null
    let cancelled = false
    onTokenRef.current(null)
    setError(null)

    const fail = (kind: "load" | "widget" | "timeout", code = "") => {
      if (cancelled) return
      onTokenRef.current(null)
      setError(turnstileFailureMessage(kind, code))
    }

    const removeWidget = (api?: TurnstileApi) => {
      const id = widgetId
      widgetId = null
      const turnstile = api ?? window.turnstile
      if (id && turnstile) {
        try {
          turnstile.remove(id)
        } catch {
          /* widget ya desmontado por HMR */
        }
      }
    }

    const timer = window.setTimeout(() => {
      void waitForTurnstileApi()
        .then((api) => {
          if (cancelled || !containerRef.current) return
          removeWidget(api)
          try {
            widgetId = api.render(containerRef.current, {
              sitekey: SITE_KEY,
              appearance,
              theme,
              size: "normal",
              callback: (token) => {
                setError(null)
                onTokenRef.current(token)
              },
              "error-callback": (code) => fail("widget", String(code ?? "")),
              "expired-callback": () => onTokenRef.current(null),
              "timeout-callback": () => fail("timeout"),
            })
          } catch {
            // `render()` lanza si el contenedor ya tiene widget o la sitekey no vale:
            // sin este catch el formulario se queda mudo con el botón deshabilitado.
            fail("widget")
          }
        })
        .catch((err) => {
          fail(err instanceof Error && err.message === "timeout" ? "timeout" : "load")
        })
    }, STRICT_MODE_DEFER_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      removeWidget()
    }
  }, [resetKey, cycle, appearance, theme])

  if (!SITE_KEY) return null
  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="min-h-[65px] w-full" />
      {error ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            className="self-start text-sm font-medium text-foreground underline underline-offset-4"
            onClick={() => setCycle((value) => value + 1)}
          >
            Reintentar captcha
          </button>
        </div>
      ) : null}
    </div>
  )
}

