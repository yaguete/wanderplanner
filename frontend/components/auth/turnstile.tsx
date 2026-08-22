"use client"

/**
 * Cloudflare Turnstile para proteger los flujos públicos de autenticación y /partners.
 * Si `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no está definida, el componente no renderiza nada y
 * `isTurnstileEnabled()` devuelve false: en local se entra sin captcha **solo** si Auth
 * tampoco exige token (Supabase local). Contra el proyecto gestionado, el login sin
 * captcha responde `captcha_failed`.
 *
 * En `next dev`, React Strict Mode monta/desmonta el efecto: un `render()` síncrono deja
 * el widget de Turnstile zombi (shell sin iframe, sin token, botón Entrar deshabilitado).
 * El `setTimeout` cancela el primer montaje y pinta una sola vez.
 *
 * El token es de un solo uso. Flujos que se quedan en la misma página (p. ej. /partners)
 * deben pasar un `resetKey` que cambie tras cada envío para re-montar el widget.
 */
import { useEffect, useRef, useState } from "react"

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
const STRICT_MODE_DEFER_MS = 50

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
  if (kind === "load") {
    return "No se pudo cargar el captcha de Cloudflare. Desactiva el bloqueador para challenges.cloudflare.com o recarga."
  }
  if (errorCode === "110200") {
    return "Este host no está en el widget de Turnstile. Añade localhost (o 127.0.0.1) en Hostname management."
  }
  if (kind === "timeout") {
    return "El captcha no terminó a tiempo. Reinténtalo."
  }
  return "No se pudo verificar el captcha. Reinténtalo."
}

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.turnstile) {
        resolve()
        return
      }
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar Turnstile")), {
        once: true,
      })
      // Fast Refresh: el script ya cargó y `load` no volverá a dispararse.
      queueMicrotask(() => {
        if (window.turnstile) resolve()
      })
    })
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("No se pudo cargar Turnstile"))
    document.head.appendChild(script)
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

    const timer = window.setTimeout(() => {
      void loadScript()
        .then(() => {
          if (cancelled || !containerRef.current || !window.turnstile) return
          containerRef.current.innerHTML = ""
          widgetId = window.turnstile.render(containerRef.current, {
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
        })
        .catch(() => fail("load"))
    }, STRICT_MODE_DEFER_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId)
        } catch {
          /* widget ya desmontado por HMR */
        }
      }
    }
  }, [resetKey, cycle, appearance, theme])

  if (!SITE_KEY) return null
  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="h-[65px] w-full" />
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
