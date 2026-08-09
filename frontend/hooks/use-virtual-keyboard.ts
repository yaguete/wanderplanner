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

/**
 * Detecta el teclado virtual vía Visual Viewport API.
 * Útil para ocultar docks fijos y reposicionar composers encima del teclado.
 */
export function useVirtualKeyboard(): VirtualKeyboardState {
  const [state, setState] = useState<VirtualKeyboardState>({ open: false, inset: 0 })

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setState({ open: inset > KEYBOARD_THRESHOLD_PX, inset })
    }

    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    window.addEventListener("resize", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [])

  return state
}
