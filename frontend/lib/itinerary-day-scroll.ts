/**
 * Salto a un día de la Ruta (desde el calendario u otros sitios).
 * `data-day-id` vive en la raíz de `DaySection`.
 */

const HIGHLIGHT_MS = 1200

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

export function scrollDaySectionIntoView(root: ParentNode, dayId: string): void {
  const escaped =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(dayId)
      : dayId
  const el = root.querySelector(`[data-day-id="${escaped}"]`)
  if (!(el instanceof HTMLElement)) return
  const reduce = prefersReducedMotion()
  el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" })
  if (reduce) return
  el.dataset.dayHighlight = ""
  window.setTimeout(() => {
    delete el.dataset.dayHighlight
  }, HIGHLIGHT_MS)
}
