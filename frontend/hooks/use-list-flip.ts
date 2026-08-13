"use client"

import { useCallback, useLayoutEffect, useRef } from "react"
import { captureFlipPositions, playFlipPositions } from "@/lib/list-flip"

/**
 * Captura posiciones en el click (antes del setState) y las anima en el
 * layout effect siguiente. No usa `flushSync` ni View Transitions: el mapa
 * y los otros paneles no se snapshot-ean.
 */
export function useListFlip() {
  const rootRef = useRef<HTMLDivElement>(null)
  const pendingPlay = useRef(false)

  const capture = useCallback(() => {
    captureFlipPositions(rootRef.current)
    pendingPlay.current = true
  }, [])

  // Sin deps: hay que jugar el FLIP en el commit inmediatamente posterior a `capture()`.
  useLayoutEffect(() => {
    if (!pendingPlay.current) return
    pendingPlay.current = false
    playFlipPositions(rootRef.current)
  })

  return { rootRef, capture }
}
