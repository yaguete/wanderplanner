/**
 * Decisión pura del repliegue de cabecera en scroll.
 *
 * `delta > 0` = el usuario baja por el documento (el contenido sube).
 * Fuentes / Mi viaje en móvil pasan `expandOnScrollUp: false`: el cromo se
 * queda replegado y solo vuelve con el chevron. El asistente y el desktop
 * de Fuentes siguen expandiendo al subir.
 */
export type CollapsingHeaderIntent = "collapse" | "expand" | "ignore"

const DELTA_EPS = 6
const COLLAPSE_MIN_TOP = 64

export function collapsingHeaderIntent({
  top,
  delta,
  expandOnScrollUp,
}: {
  top: number
  delta: number
  expandOnScrollUp: boolean
}): CollapsingHeaderIntent {
  if (Math.abs(delta) < DELTA_EPS) return "ignore"
  if (delta > 0) return top > COLLAPSE_MIN_TOP ? "collapse" : "ignore"
  return expandOnScrollUp ? "expand" : "ignore"
}
