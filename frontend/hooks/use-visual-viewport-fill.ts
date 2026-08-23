"use client"

import { useLayoutEffect } from "react"
import {
  isDialogFullscreenViewport,
  visualViewportFillBox,
} from "@/lib/visual-viewport"

/**
 * Ancla un overlay `position:fixed` al visual viewport (lo que el usuario ve).
 * En móvil, `100dvh` + `inset-0` se meten detrás de la barra de Firefox iOS
 * y de un zoom residual de iOS; el visual viewport no.
 */
export function useVisualViewportFill(
  ref: { current: HTMLElement | null },
  enabled: boolean,
) {
  useLayoutEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return

    const vv = window.visualViewport

    const clear = () => {
      el.style.top = ""
      el.style.left = ""
      el.style.right = ""
      el.style.bottom = ""
      el.style.width = ""
      el.style.height = ""
      el.style.maxHeight = ""
    }

    const apply = () => {
      if (!isDialogFullscreenViewport()) {
        clear()
        return
      }
      const box = visualViewportFillBox(vv, {
        layoutHeight: window.innerHeight,
        userAgent: navigator.userAgent,
      })
      if (box) {
        el.style.top = `${box.top}px`
        el.style.left = `${box.left}px`
        el.style.width = `${box.width}px`
        el.style.height = `${box.height}px`
        el.style.maxHeight = `${box.height}px`
        el.style.right = "auto"
        el.style.bottom = "auto"
        return
      }
      el.style.top = "0px"
      el.style.left = "0px"
      el.style.right = "auto"
      el.style.bottom = "auto"
      el.style.width = "100%"
      el.style.height = "100svh"
      el.style.maxHeight = "100svh"
    }

    apply()
    vv?.addEventListener("resize", apply)
    vv?.addEventListener("scroll", apply)
    window.addEventListener("resize", apply)
    const mql = window.matchMedia("(max-width: 639px)")
    mql.addEventListener("change", apply)
    return () => {
      vv?.removeEventListener("resize", apply)
      vv?.removeEventListener("scroll", apply)
      window.removeEventListener("resize", apply)
      mql.removeEventListener("change", apply)
      clear()
    }
  }, [enabled, ref])
}
