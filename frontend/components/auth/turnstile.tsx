"use client"

/**
 * Cloudflare Turnstile para proteger la creación de sesiones anónimas (CTA público).
 * Si `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no está definida, el componente no renderiza nada y
 * `isTurnstileEnabled()` devuelve false: en local se entra sin captcha.
 */
import { useEffect, useRef } from "react"

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void },
  ) => string
  remove: (id: string) => void
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

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!SITE_KEY) return
    let widgetId: string | null = null
    let cancelled = false

    void loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token) => onTokenRef.current(token),
        })
      })
      .catch(() => {})

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [])

  if (!SITE_KEY) return null
  return <div ref={containerRef} />
}
