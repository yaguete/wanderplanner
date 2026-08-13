"use client"

/**
 * Cloudflare Turnstile para proteger los flujos públicos de autenticación y /partners.
 * Si `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no está definida, el componente no renderiza nada y
 * `isTurnstileEnabled()` devuelve false: en local se entra sin captcha.
 *
 * El token es de un solo uso. Flujos que se quedan en la misma página (p. ej. /partners)
 * deben pasar un `resetKey` que cambie tras cada envío para re-montar el widget.
 */
import { useEffect, useRef } from "react"

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

type TurnstileAppearance = "always" | "execute" | "interaction-only"

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      "error-callback"?: () => void
      "expired-callback"?: () => void
      appearance?: TurnstileAppearance
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

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
  if (existing) {
    return new Promise((resolve) => existing.addEventListener("load", () => resolve()))
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
}: {
  onToken: (token: string | null) => void
  /** Cambia este valor para re-montar el widget (token de un solo uso). */
  resetKey?: number | string
  /** `interaction-only` no pinta el widget salvo que Cloudflare lo pida. */
  appearance?: TurnstileAppearance
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!SITE_KEY) return
    let widgetId: string | null = null
    let cancelled = false
    onTokenRef.current(null)

    void loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          appearance,
          callback: (token) => onTokenRef.current(token),
          "error-callback": () => onTokenRef.current(null),
          "expired-callback": () => onTokenRef.current(null),
        })
      })
      .catch(() => {})

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [resetKey, appearance])

  if (!SITE_KEY) return null
  return <div ref={containerRef} />
}
