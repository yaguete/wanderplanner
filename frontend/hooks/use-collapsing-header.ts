"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Margen sordo tras cada cambio de estado, algo mayor que los 200 ms de la
 * transición del repliegue. En móvil la cabecera va DENTRO del scroller que
 * escucha (el documento), así que replegarla acorta el documento y eso dispara
 * más eventos de scroll: sin este margen el hook los lee como gesto del usuario
 * y la cabecera se abre y cierra sola varias veces seguidas.
 */
const SETTLE_MS = 260

/**
 * Móvil: la cabecera se repliega al bajar y vuelve al subir.
 * El listener va en captura porque cada pestaña puede montar su propio scroller
 * (los eventos `scroll` no burbujean).
 *
 * En móvil el scroller es el **documento** (así el navegador puede colapsar su
 * barra de direcciones), y en desktop siguen siendo scrollers anidados dentro
 * del shell fijo. El documento entra como un scroller más en `lastTopByScroller`
 * —su `scroll` llega por `window`, no por captura— y el resto de la lógica
 * (umbrales, `onCollapsedChange`) es la misma para los dos casos.
 *
 * `onCollapsedChange` avisa al padre (p. ej. para compactar la navbar) también
 * cuando el repliegue se resetea a mano al cambiar de pestaña.
 *
 * `active`: al volver a la sección (Fuentes ↔ Mi viaje) se expande de nuevo
 * para que el siguiente scroll hacia abajo pueda volver a compactar.
 */
export function useCollapsingHeader(
  enabled: boolean,
  onCollapsedChange?: (collapsed: boolean) => void,
  active = true,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsedState] = useState(false)
  const collapsedRef = useRef(false)
  const onCollapsedChangeRef = useRef(onCollapsedChange)
  onCollapsedChangeRef.current = onCollapsedChange
  const prevActiveRef = useRef(active)
  const settleUntilRef = useRef(0)

  const setCollapsed = useCallback((next: boolean) => {
    if (collapsedRef.current === next) return
    collapsedRef.current = next
    settleUntilRef.current = performance.now() + SETTLE_MS
    setCollapsedState(next)
    onCollapsedChangeRef.current?.(next)
  }, [])

  useEffect(() => {
    if (enabled && active && !prevActiveRef.current) setCollapsed(false)
    prevActiveRef.current = active
  }, [active, enabled, setCollapsed])

  useEffect(() => {
    if (!enabled) {
      setCollapsed(false)
      return
    }
    const node = containerRef.current
    if (!node) return

    const lastTopByScroller = new WeakMap<EventTarget, number>()
    let frame = 0
    let pending: EventTarget | null = null

    const evaluate = () => {
      frame = 0
      const target = pending
      pending = null
      if (!target) return

      // El scroll del documento llega con `target === document`.
      const isDocument = target === document
      const top = isDocument ? window.scrollY : (target as HTMLElement).scrollTop
      const previous = lastTopByScroller.get(target) ?? 0
      // Se registra siempre, también durante el margen sordo: así el delta
      // siguiente se mide desde donde quedó el scroll y no desde antes.
      lastTopByScroller.set(target, top)

      // Volver arriba expande: es una condición absoluta, no un delta, así que
      // no puede realimentarse (expandir con `top <= 8` no mueve el scroll).
      if (top <= 8) {
        setCollapsed(false)
        return
      }

      if (performance.now() < settleUntilRef.current) return

      const delta = top - previous
      if (Math.abs(delta) < 6) return
      if (delta > 0) {
        if (top > 64) setCollapsed(true)
      } else {
        setCollapsed(false)
      }
    }

    // `scroll` dispara muchas veces por frame; decidir una sola vez por frame
    // evita encadenar cambios de layout dentro del mismo gesto.
    const onScroll = (event: Event) => {
      const target = event.target
      if (!target) return
      if (target !== document && !(target instanceof HTMLElement)) return
      pending = target
      if (!frame) frame = requestAnimationFrame(evaluate)
    }

    node.addEventListener("scroll", onScroll, true)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      node.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("scroll", onScroll)
    }
  }, [enabled, setCollapsed])

  return { containerRef, collapsed, setCollapsed }
}
