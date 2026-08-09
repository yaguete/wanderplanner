"use client"

import { useEffect, useState } from "react"

/** Umbral (px) para no confundir la barra de URL / chrome del navegador con el teclado. */
const KEYBOARD_THRESHOLD_PX = 120

export type VirtualKeyboardState = {
  /** Teclado virtual abierto (viewport visual claramente más bajo que el layout). */
  open: boolean
  /**
   * Píxeles del layout viewport tapados por abajo (iOS overlay).
   * Con `interactive-widget: resizes-content` suele ser ~0: el layout ya se encoge.
   */
  inset: number
}

/** El elemento con foco levanta teclado virtual (inputs de texto, textareas, contenteditable). */
function isTextInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled
  if (el instanceof HTMLInputElement) {
    if (el.readOnly || el.disabled) return false
    return !/^(button|submit|reset|checkbox|radio|range|file|color|image|hidden)$/.test(el.type)
  }
  return el instanceof HTMLElement && el.isContentEditable
}

/**
 * Detecta el teclado virtual y cuánto tapa del layout.
 * Útil para ocultar docks fijos y reposicionar composers encima del teclado.
 *
 * Dos señales combinadas:
 * - Visual Viewport API → `inset` (posicionamiento) y `open` cuando el viewport encoge.
 * - Foco en un campo de texto con puntero táctil → `open` incluso cuando la métrica
 *   del viewport no es fiable (iOS con zoom, o innerHeight siguiendo al visual viewport).
 */
export function useVirtualKeyboard(): VirtualKeyboardState {
  const [state, setState] = useState<VirtualKeyboardState>({ open: false, inset: 0 })

  useEffect(() => {
    const vv = window.visualViewport
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false

    const update = () => {
      const inset = vv
        ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        : 0
      const focusOpen = coarsePointer && isTextInputFocused()
      setState((prev) => {
        const open = inset > KEYBOARD_THRESHOLD_PX || focusOpen
        return prev.open === open && prev.inset === inset ? prev : { open, inset }
      })
    }

    // El foco cambia antes de que el teclado termine de aparecer/desaparecer:
    // reevalúa también tras un pequeño delay para capturar el inset final.
    let timer: ReturnType<typeof setTimeout> | undefined
    const updateSoon = () => {
      update()
      clearTimeout(timer)
      timer = setTimeout(update, 300)
    }

    update()
    vv?.addEventListener("resize", update)
    vv?.addEventListener("scroll", update)
    window.addEventListener("resize", update)
    document.addEventListener("focusin", updateSoon)
    document.addEventListener("focusout", updateSoon)
    return () => {
      clearTimeout(timer)
      vv?.removeEventListener("resize", update)
      vv?.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
      document.removeEventListener("focusin", updateSoon)
      document.removeEventListener("focusout", updateSoon)
    }
  }, [])

  return state
}
