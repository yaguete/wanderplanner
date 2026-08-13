/**
 * FLIP de lista: captura rects antes de mutar, invierte con `transform` tras el commit.
 * Solo `transform` — no toca layout. Si no hay movimiento o el usuario pide menos
 * movimiento, es un no-op.
 */

const ATTR = "data-flip-id"

type Point = { top: number; left: number }

let pending: Map<string, Point> | null = null
/** Invalida un `requestAnimationFrame` de play si llega otro capture/play. */
let playToken = 0

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

export function captureFlipPositions(root: ParentNode | null): void {
  playToken += 1
  if (!root || prefersReducedMotion()) {
    pending = null
    return
  }
  const map = new Map<string, Point>()
  root.querySelectorAll(`[${ATTR}]`).forEach((node) => {
    const id = node.getAttribute(ATTR)
    if (!id) return
    const r = (node as HTMLElement).getBoundingClientRect()
    map.set(id, { top: r.top, left: r.left })
  })
  pending = map.size > 0 ? map : null
}

export function playFlipPositions(root: ParentNode | null): void {
  const first = pending
  pending = null
  if (!first || !root || prefersReducedMotion()) return

  const plays: Array<{ el: HTMLElement; dx: number; dy: number }> = []
  root.querySelectorAll(`[${ATTR}]`).forEach((node) => {
    const id = node.getAttribute(ATTR)
    if (!id) return
    const prev = first.get(id)
    if (!prev) return
    const el = node as HTMLElement
    const last = el.getBoundingClientRect()
    const dx = prev.left - last.left
    const dy = prev.top - last.top
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
    plays.push({ el, dx, dy })
  })
  if (plays.length === 0) return

  const token = ++playToken
  for (const { el, dx, dy } of plays) {
    el.style.transition = "none"
    el.style.transform = `translate(${dx}px, ${dy}px)`
  }

  requestAnimationFrame(() => {
    if (token !== playToken) return
    for (const { el } of plays) {
      el.style.transition = "transform 180ms ease-out"
      el.style.transform = ""
    }
    window.setTimeout(() => {
      if (token !== playToken) return
      for (const { el } of plays) {
        el.style.transition = ""
        el.style.transform = ""
      }
    }, 220)
  })
}
