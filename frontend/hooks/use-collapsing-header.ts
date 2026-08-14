"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Móvil: la cabecera se repliega al bajar y vuelve al subir.
 * El listener va en captura porque cada pestaña puede montar su propio scroller
 * (los eventos `scroll` no burbujean).
 *
 * `onCollapsedChange` avisa al padre (p. ej. para ocultar la navbar) también
 * cuando el repliegue se resetea a mano al cambiar de pestaña.
 */
export function useCollapsingHeader(
  enabled: boolean,
  onCollapsedChange?: (collapsed: boolean) => void,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsedState] = useState(false)
  const collapsedRef = useRef(false)
  const onCollapsedChangeRef = useRef(onCollapsedChange)
  onCollapsedChangeRef.current = onCollapsedChange

  const setCollapsed = useCallback((next: boolean) => {
    if (collapsedRef.current === next) return
    collapsedRef.current = next
    setCollapsedState(next)
    onCollapsedChangeRef.current?.(next)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setCollapsed(false)
      return
    }
    const node = containerRef.current
    if (!node) return

    const lastTopByScroller = new WeakMap<EventTarget, number>()
    const onScroll = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const top = target.scrollTop
      const previous = lastTopByScroller.get(target) ?? 0
      lastTopByScroller.set(target, top)

      if (top <= 8) {
        setCollapsed(false)
        return
      }
      const delta = top - previous
      if (Math.abs(delta) < 6) return
      if (delta > 0) {
        if (top > 64) setCollapsed(true)
      } else {
        setCollapsed(false)
      }
    }

    node.addEventListener("scroll", onScroll, true)
    return () => node.removeEventListener("scroll", onScroll, true)
  }, [enabled, setCollapsed])

  return { containerRef, collapsed, setCollapsed }
}
