/**
 * Decisión pura de un swipe entre pestañas (Fuentes en móvil).
 *
 * Observe-only: el hook no hace preventDefault ni monta un carrusel con
 * overflow-x — en `/trips` móvil el scroller es el documento, y un eje
 * `hidden`/`auto` en un contenedor anidado se come el gesto y deja fija
 * la barra de direcciones.
 *
 * `dx < 0` = dedo hacia la izquierda → pestaña siguiente (como pasar página).
 * `dx > 0` = dedo hacia la derecha → pestaña anterior.
 */

export type TabSwipeDirection = "next" | "prev"
export type TabSwipeIntent = TabSwipeDirection | "ignore"

/** Recorrido horizontal mínimo para no confundirlo con un tap. */
export const TAB_SWIPE_MIN_DX = 64

/**
 * |dx| tiene que ser estrictamente mayor que esto × |dy|. Un diagonal
 * 64×32 no cuenta: el documento tiene que poder scrollear en paz.
 */
export const TAB_SWIPE_DOMINANCE = 2

/** Zona de los gestos nativos de atrás (iOS a la izquierda, algunos Android a la derecha). */
export const TAB_SWIPE_EDGE_GUARD = 24

export function tabSwipeIntent({
  dx,
  dy,
  startX,
  viewportWidth,
}: {
  dx: number
  dy: number
  startX: number
  viewportWidth: number
}): TabSwipeIntent {
  if (Math.abs(dx) < TAB_SWIPE_MIN_DX) return "ignore"
  if (Math.abs(dx) <= TAB_SWIPE_DOMINANCE * Math.abs(dy)) return "ignore"
  if (dx > 0 && startX < TAB_SWIPE_EDGE_GUARD) return "ignore"
  if (dx < 0 && startX > viewportWidth - TAB_SWIPE_EDGE_GUARD) return "ignore"
  return dx < 0 ? "next" : "prev"
}

export function tabAfterSwipe<T extends string>(
  items: readonly { id: T }[],
  current: T,
  direction: TabSwipeDirection,
): T | null {
  const index = items.findIndex((item) => item.id === current)
  if (index < 0) return null
  const next = direction === "next" ? index + 1 : index - 1
  return items[next]?.id ?? null
}
