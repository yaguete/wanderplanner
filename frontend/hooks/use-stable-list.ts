"use client"

import { useRef } from "react"

/**
 * Devuelve la misma referencia mientras los elementos sean los mismos.
 *
 * `getTripSources` construye un array nuevo en cada llamada, así que cualquier
 * `useMemo` o `memo()` aguas abajo se invalida en cada render del provider
 * aunque las fuentes no hayan cambiado. Comparar por elemento es exacto: los
 * objetos `Source` / `Trip` se reemplazan de forma inmutable al mutar.
 */
export function useStableList<T>(next: T[]): T[] {
  const ref = useRef(next)
  const prev = ref.current
  if (prev !== next) {
    const same = prev.length === next.length && prev.every((value, i) => value === next[i])
    if (!same) ref.current = next
  }
  return ref.current
}
