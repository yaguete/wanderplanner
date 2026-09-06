"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { collapsingHeaderIntent } from "@/lib/collapsing-header"

/**
 * Margen sordo tras cada cambio de estado, algo mayor que los 200 ms de la
 * transición del repliegue. En móvil la cabecera va DENTRO del scroller que
 * escucha (el documento), así que replegarla acorta el documento y eso dispara
 * más eventos de scroll: sin este margen el hook los lee como gesto del usuario
 * y la cabecera se abre y cierra sola varias veces seguidas. Compactar o
 * agrandar el dock también cambia `--wp-nav-height` / el padding de reserva.
 */
const SETTLE_MS = 260

/**
 * Móvil: la cabecera se repliega al bajar. Con `expandOnScrollUp` (asistente,
 * desktop de Fuentes) vuelve al subir; Fuentes / Mi viaje en móvil lo apagan
 * y recuperan el cromo con el chevron (`CollapsedChromeReveal`).
 *
 * El dock inferior va por otra vía: se compacta al bajar y recupera el tamaño
 * grande al subir, aunque el cromo siga replegado. El chevron no lo toca.
 *
 * El listener va en captura porque cada pestaña puede montar su propio scroller
 * (los eventos `scroll` no burbujean).
 *
 * En móvil el scroller es el **documento** (así el navegador puede colapsar su
 * barra de direcciones), y en desktop siguen siendo scrollers anidados dentro
 * del shell fijo. El documento entra como un scroller más en `lastTopByScroller`
 * —su `scroll` llega por `window`, no por captura— y el resto de la lógica
 * (umbrales) es la misma para los dos casos.
 *
 * `onNavCompactChange` avisa al padre solo por gesto de scroll, no cuando el
 * repliegue se resetea a mano (chevron, cambio de pestaña interna).
 *
 * `active`: al volver a la sección (Fuentes ↔ Mi viaje) se expande de nuevo
 * para que el siguiente scroll hacia abajo pueda volver a compactar.
 */
export function useCollapsingHeader(
  enabled: boolean,
  onNavCompactChange?: (compact: boolean) => void,
  active = true,
  expandOnScrollUp = true,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsedState] = useState(false)
  const collapsedRef = useRef(false)
  const navCompactRef = useRef(false)
  const onNavCompactChangeRef = useRef(onNavCompactChange)
  onNavCompactChangeRef.current = onNavCompactChange
  const expandOnScrollUpRef = useRef(expandOnScrollUp)
  expandOnScrollUpRef.current = expandOnScrollUp
  const activeRef = useRef(active)
  activeRef.current = active
  const prevActiveRef = useRef(active)
  const settleUntilRef = useRef(0)

  const setCollapsed = useCallback((next: boolean) => {
    if (collapsedRef.current === next) return
    collapsedRef.current = next
    settleUntilRef.current = performance.now() + SETTLE_MS
    setCollapsedState(next)
  }, [])

  const setNavCompact = useCallback((next: boolean) => {
    if (navCompactRef.current === next) return
    navCompactRef.current = next
    settleUntilRef.current = performance.now() + SETTLE_MS
    onNavCompactChangeRef.current?.(next)
  }, [])

  useEffect(() => {
    if (enabled && active && !prevActiveRef.current) {
      setCollapsed(false)
      navCompactRef.current = false
      // El `scrollTo` que restaura la sección parece un gesto hacia abajo.
      settleUntilRef.current = performance.now() + SETTLE_MS
    }
    prevActiveRef.current = active
  }, [active, enabled, setCollapsed])

  useEffect(() => {
    if (!enabled) {
      setCollapsed(false)
      navCompactRef.current = false
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

      if (!activeRef.current) return

      // Auto-scroll del arrastre de cards: no leer el scroll programático
      // como gesto o la cabecera se repliega y caduca el snapshot de rects.
      if (document.documentElement.dataset.wpDragging === "1") return

      const expandOnUp = expandOnScrollUpRef.current
      // Volver arriba expande solo si el modo lo permite: es una condición
      // absoluta, no un delta, así que no puede realimentarse (expandir con
      // `top <= 8` no mueve el scroll). El dock no entra aquí: compactar o
      // agrandar cambia el padding y sí puede mover el scroll.
      if (top <= 8 && expandOnUp) {
        setCollapsed(false)
        return
      }

      if (performance.now() < settleUntilRef.current) return

      const delta = top - previous
      const headerIntent = collapsingHeaderIntent({
        top,
        delta,
        expandOnScrollUp: expandOnUp,
      })
      if (headerIntent === "collapse") setCollapsed(true)
      else if (headerIntent === "expand") setCollapsed(false)

      if (onNavCompactChangeRef.current) {
        const navIntent = collapsingHeaderIntent({
          top,
          delta,
          expandOnScrollUp: true,
        })
        if (navIntent === "collapse") setNavCompact(true)
        else if (navIntent === "expand") setNavCompact(false)
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
  }, [enabled, setCollapsed, setNavCompact])

  return { containerRef, collapsed, setCollapsed }
}
