"use client"

import { useEffect, useRef, type RefObject } from "react"
import {
  tabSwipeIntent,
  type TabSwipeDirection,
} from "@/lib/tab-swipe"

const IGNORE_CLOSEST = ".source-chips-scroller, [data-wp-no-tab-swipe]"

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))
}

function hasTextSelection(): boolean {
  const selection = window.getSelection()
  return Boolean(selection && selection.type === "Range" && selection.toString().length > 0)
}

function isInsideHorizontalScroller(target: EventTarget | null, root: HTMLElement): boolean {
  let el: HTMLElement | null =
    target instanceof HTMLElement
      ? target
      : target instanceof Node
        ? target.parentElement
        : null
  while (el && el !== root) {
    const { overflowX } = getComputedStyle(el)
    if (
      (overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay") &&
      el.scrollWidth > el.clientWidth + 1
    ) {
      return true
    }
    el = el.parentElement
  }
  return false
}

/**
 * Swipe horizontal entre pestañas. Solo se engancha si `enabled` (móvil +
 * Fuentes visible). Observa, no cancela: el scroll vertical del documento y
 * el repliegue de cabecera siguen siendo nativos.
 *
 * No intenta matar el click que sigue al gesto: `preventDefault()` sobre
 * `pointerup` NO suprime `mouseup` ni `click` (comprobado en Chrome). Lo que
 * evita el disparo accidental es que en móvil el panel no tiene dianas
 * anchas — las cards no son clicables (`onSelect` undefined) y el afiliado es
 * un icono —, así que un gesto de 64 px no empieza y acaba dentro de la
 * misma. La excepción son los `<a>` del artículo de la Crónica, que vienen
 * crudos del blog; si eso llega a molestar, la vía que sí funciona es tragarse
 * el siguiente `click` en captura durante unos ms, no `preventDefault`.
 */
export function useTabSwipe(
  rootRef: RefObject<HTMLElement | null>,
  {
    enabled,
    onSwipe,
  }: {
    enabled: boolean
    onSwipe: (direction: TabSwipeDirection) => void
  },
) {
  const onSwipeRef = useRef(onSwipe)
  onSwipeRef.current = onSwipe

  useEffect(() => {
    if (!enabled) return
    const node = rootRef.current
    if (!node) return

    let start: { x: number; y: number; id: number } | null = null

    const onDown = (event: PointerEvent) => {
      // Siempre, antes de cualquier salida: un `start` viejo (gesto cuyo
      // `pointerup` nunca llegó) no puede colarse en el siguiente puntero.
      start = null
      if (!event.isPrimary) return
      if (event.pointerType === "mouse" && event.button !== 0) return
      const target = event.target
      if (!(target instanceof Node) || !node.contains(target)) return
      if (isEditableTarget(target)) return
      if (target instanceof Element && target.closest(IGNORE_CLOSEST)) return
      // El tap en las pestañas / botones del cromo no es un swipe.
      if (target instanceof Element && target.closest("[role=tab]")) return
      if (isInsideHorizontalScroller(target, node)) return
      start = { x: event.clientX, y: event.clientY, id: event.pointerId }
    }

    const onUp = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      const startX = start.x
      start = null
      if (hasTextSelection()) return
      const intent = tabSwipeIntent({
        dx,
        dy,
        startX,
        viewportWidth: window.innerWidth,
      })
      if (intent === "ignore") return
      onSwipeRef.current(intent)
    }

    const onCancel = (event: PointerEvent) => {
      if (start && event.pointerId === start.id) start = null
    }

    // Capture en `window`: llega antes que cualquier stopPropagation de
    // las cards, y el scroller es el documento (el panel no es el target).
    window.addEventListener("pointerdown", onDown, { capture: true })
    window.addEventListener("pointerup", onUp, { capture: true })
    window.addEventListener("pointercancel", onCancel, { capture: true })
    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true })
      window.removeEventListener("pointerup", onUp, { capture: true })
      window.removeEventListener("pointercancel", onCancel, { capture: true })
    }
  }, [enabled, rootRef])
}
