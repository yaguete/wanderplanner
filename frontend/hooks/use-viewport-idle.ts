"use client"

import { useEffect, useState } from "react"

/** Tras el último `resize` (o al activar). DevTools anima el viewport; hay que esperar. */
export const VIEWPORT_IDLE_MS = 180

/**
 * `false` mientras el viewport se está moviendo; `true` tras `ms` sin resize.
 * Arranca en `false` si `active`: el primer render móvil no monta aún
 * `useWindowVirtualizer` (si no, el chorro de resize al pasar de escritorio
 * a dispositivo dispara React error #185).
 */
export function useViewportIdle(active: boolean, ms: number = VIEWPORT_IDLE_MS): boolean {
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    if (!active) {
      setIdle(false)
      return
    }
    setIdle(false)
    let t = window.setTimeout(() => setIdle(true), ms)
    const onResize = () => {
      setIdle((was) => (was ? false : was))
      window.clearTimeout(t)
      t = window.setTimeout(() => setIdle(true), ms)
    }
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      window.clearTimeout(t)
    }
  }, [active, ms])

  return active && idle
}
