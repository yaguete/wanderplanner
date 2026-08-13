"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"

export type IndicatorBox = { x: number; y: number; w: number; h: number }

const EMPTY: IndicatorBox = { x: 0, y: 0, w: 0, h: 0 }

/**
 * Mide el hijo `[data-indicator-active="true"]` y expone caja + ref del contenedor.
 * El indicador se mueve con `transform` (y `width`/`height` del propio pill, no del layout).
 */
export function useSlidingIndicator(activeKey: string, observeKey?: string | number) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<IndicatorBox>(EMPTY)
  const [ready, setReady] = useState(false)

  const update = useCallback(() => {
    const root = containerRef.current
    if (!root) return
    const active = root.querySelector<HTMLElement>("[data-indicator-active='true']")
    if (!active) return
    const rootRect = root.getBoundingClientRect()
    const rect = active.getBoundingClientRect()
    const next: IndicatorBox = {
      x: rect.left - rootRect.left + root.scrollLeft,
      y: rect.top - rootRect.top + root.scrollTop,
      w: rect.width,
      h: rect.height,
    }
    setBox((prev) =>
      prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h
        ? prev
        : next,
    )
    setReady(true)
  }, [])

  useLayoutEffect(() => {
    update()
  }, [activeKey, update])

  useLayoutEffect(() => {
    const root = containerRef.current
    if (!root) return
    const ro = new ResizeObserver(() => update())
    ro.observe(root)
    root.querySelectorAll<HTMLElement>("[data-indicator-target]").forEach((el) => {
      ro.observe(el)
    })
    return () => ro.disconnect()
  }, [update, observeKey])

  return { containerRef, box, ready }
}
