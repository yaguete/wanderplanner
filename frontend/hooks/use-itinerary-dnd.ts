"use client"

import { useEffect, useRef, type RefObject } from "react"
import {
  buildSlots,
  isNoOpMove,
  resolveDropTarget,
  toMoveParams,
  type DragOrigin,
  type MeasuredDay,
  type MeasuredItem,
  type MoveParams,
  type Slot,
} from "@/lib/itinerary-dnd"

const FINE_THRESHOLD_PX = 6
const TOUCH_LONG_PRESS_MS = 350
const TOUCH_CANCEL_PX = 8
const AUTO_SCROLL_EDGE_PX = 48
const AUTO_SCROLL_MAX_PX = 14
const IGNORE_SELECTOR =
  'button, a[data-no-drag], input, textarea, select, [role="checkbox"], [role="slider"]'

type DragSession = {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  li: HTMLElement
  ul: HTMLElement | null
  origin: DragOrigin
  slots: Slot[]
  snapshotScroll: number
  activated: boolean
  longPressTimer: number | null
  isTouch: boolean
  raf: number
}

function cssVarPx(name: string): number {
  const probe = document.createElement("div")
  probe.style.position = "absolute"
  probe.style.visibility = "hidden"
  probe.style.height = `var(${name})`
  document.documentElement.appendChild(probe)
  const h = probe.getBoundingClientRect().height
  probe.remove()
  return h
}

function measureDays(root: HTMLElement): MeasuredDay[] {
  const days: MeasuredDay[] = []
  root.querySelectorAll<HTMLElement>("[data-day-id]").forEach((section) => {
    const dayId = section.getAttribute("data-day-id")
    if (!dayId) return
    const r = section.getBoundingClientRect()
    const items: MeasuredItem[] = []
    section.querySelectorAll<HTMLElement>("[data-flip-id]").forEach((li) => {
      const id = li.getAttribute("data-flip-id")
      if (!id) return
      const ir = li.getBoundingClientRect()
      items.push({ id, top: ir.top, bottom: ir.bottom })
    })
    days.push({ dayId, top: r.top, bottom: r.bottom, items })
  })
  return days
}

function originFromLi(li: HTMLElement): DragOrigin | null {
  const itemId = li.getAttribute("data-flip-id")
  const dayEl = li.closest<HTMLElement>("[data-day-id]")
  const dayId = dayEl?.getAttribute("data-day-id")
  if (!itemId || !dayId || !dayEl) return null
  const items = [...dayEl.querySelectorAll<HTMLElement>("[data-flip-id]")]
  const index = items.indexOf(li)
  if (index < 0) return null
  return { dayId, itemId, index }
}

function scrollTopOf(scrollEl: HTMLElement | null): number {
  if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight + 1) {
    return scrollEl.scrollTop
  }
  return window.scrollY
}

function usesWindowScroll(scrollEl: HTMLElement | null): boolean {
  return !scrollEl || scrollEl.scrollHeight <= scrollEl.clientHeight + 1
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

function setDraggingFlag(on: boolean): void {
  if (on) document.documentElement.dataset.wpDragging = "1"
  else delete document.documentElement.dataset.wpDragging
}

function cardOf(li: HTMLElement): HTMLElement | null {
  return li.querySelector("[data-wp-drag-card]")
}

function applyLift(
  li: HTMLElement,
  dx: number,
  dy: number,
): void {
  li.style.transition = "none"
  li.style.willChange = "transform"
  li.style.transform = `translate(${dx}px, ${dy}px)`
  li.style.zIndex = "2"
  // Sombra en la card, no en el <li>: el punto de la timeline queda fuera.
  const card = cardOf(li)
  if (card) {
    card.style.transition = "none"
    card.style.boxShadow =
      "0 10px 24px -8px rgba(0,0,0,0.18), 0 2px 6px -2px rgba(0,0,0,0.08)"
  }
}

function clearLift(li: HTMLElement): void {
  li.style.transition = ""
  li.style.willChange = ""
  li.style.transform = ""
  li.style.zIndex = ""
  li.style.userSelect = ""
  li.style.removeProperty("-webkit-touch-callout")
  const card = cardOf(li)
  if (card) {
    card.style.transition = ""
    card.style.boxShadow = ""
  }
}

function hideLine(line: HTMLElement | null): void {
  if (!line) return
  line.style.display = "none"
  line.style.top = ""
}

function showLine(
  line: HTMLElement,
  root: HTMLElement,
  slot: Slot,
  scrollDelta: number,
): void {
  const rootRect = root.getBoundingClientRect()
  const y = slot.y - scrollDelta - rootRect.top
  line.style.display = "flex"
  line.style.top = `${y}px`
  if (prefersReducedMotion()) line.style.transition = "none"
}

export function useItineraryDnd({
  enabled,
  rootRef,
  scrollRef,
  chromeRef,
  lineRef,
  capture,
  onMove,
}: {
  enabled: boolean
  rootRef: RefObject<HTMLElement | null>
  scrollRef: RefObject<HTMLElement | null>
  chromeRef: RefObject<HTMLElement | null>
  lineRef: RefObject<HTMLElement | null>
  capture: () => void
  onMove: (params: MoveParams) => void
}): void {
  const onMoveRef = useRef(onMove)
  const captureRef = useRef(capture)
  // eslint-disable-next-line react-hooks/refs -- último callback; el effect no debe re-suscribirse.
  onMoveRef.current = onMove
  // eslint-disable-next-line react-hooks/refs -- último callback; el effect no debe re-suscribirse.
  captureRef.current = capture

  useEffect(() => {
    if (!enabled) return
    const root = rootRef.current
    if (!root) return

    let session: DragSession | null = null
    let suppressClick = false
    let touchMoveBlocker: ((e: TouchEvent) => void) | null = null
    let headerPx = 0
    let navPx = 0

    const stopAutoScroll = () => {
      if (session?.raf) {
        cancelAnimationFrame(session.raf)
        session.raf = 0
      }
    }

    const teardownTouchBlocker = () => {
      if (!touchMoveBlocker) return
      document.removeEventListener("touchmove", touchMoveBlocker)
      touchMoveBlocker = null
    }

    const restore = () => {
      if (!session) return
      if (session.longPressTimer != null) {
        window.clearTimeout(session.longPressTimer)
        session.longPressTimer = null
      }
      stopAutoScroll()
      teardownTouchBlocker()
      if (session.activated) {
        try {
          session.li.releasePointerCapture(session.pointerId)
        } catch {
          /* ya soltado */
        }
        if (session.ul) session.ul.style.zIndex = ""
        setDraggingFlag(false)
      }
      clearLift(session.li)
      hideLine(lineRef.current)
      const wasActive = session.activated
      session = null
      if (wasActive) {
        window.setTimeout(() => {
          suppressClick = false
        }, 50)
      }
    }

    const autoScrollStep = (): number => {
      if (!session) return 0
      const y = session.lastY
      const scrollEl = scrollRef.current
      const windowScroll = usesWindowScroll(scrollEl)
      let delta = 0
      if (windowScroll) {
        const chromeBottom =
          chromeRef.current?.getBoundingClientRect().bottom ?? headerPx
        const topLimit = chromeBottom
        const botLimit = window.innerHeight - navPx
        if (y < topLimit + AUTO_SCROLL_EDGE_PX) {
          const t = 1 - Math.max(0, y - topLimit) / AUTO_SCROLL_EDGE_PX
          delta = -AUTO_SCROLL_MAX_PX * Math.min(1, Math.max(0, t))
        } else if (y > botLimit - AUTO_SCROLL_EDGE_PX) {
          const t = 1 - Math.max(0, botLimit - y) / AUTO_SCROLL_EDGE_PX
          delta = AUTO_SCROLL_MAX_PX * Math.min(1, Math.max(0, t))
        }
        if (delta) window.scrollBy(0, delta)
      } else if (scrollEl) {
        const r = scrollEl.getBoundingClientRect()
        if (y < r.top + AUTO_SCROLL_EDGE_PX) {
          const t = 1 - Math.max(0, y - r.top) / AUTO_SCROLL_EDGE_PX
          delta = -AUTO_SCROLL_MAX_PX * Math.min(1, Math.max(0, t))
        } else if (y > r.bottom - AUTO_SCROLL_EDGE_PX) {
          const t = 1 - Math.max(0, r.bottom - y) / AUTO_SCROLL_EDGE_PX
          delta = AUTO_SCROLL_MAX_PX * Math.min(1, Math.max(0, t))
        }
        if (delta) scrollEl.scrollTop += delta
      }
      return delta
    }

    const paint = () => {
      if (!session?.activated) return
      const dx = session.lastX - session.startX
      const dy = session.lastY - session.startY
      applyLift(session.li, dx, dy)
      const scrollDelta =
        scrollTopOf(scrollRef.current) - session.snapshotScroll
      const target = resolveDropTarget(session.slots, session.lastY + scrollDelta)
      const line = lineRef.current
      if (!target || !line) {
        hideLine(line)
        return
      }
      const params = toMoveParams(target, session.origin)
      if (isNoOpMove(params, session.origin)) {
        hideLine(line)
        return
      }
      const slot = session.slots.find(
        (s) => s.dayId === target.dayId && s.index === target.index,
      )
      if (!slot) {
        hideLine(line)
        return
      }
      showLine(line, root, slot, scrollDelta)
    }

    const tick = () => {
      if (!session?.activated) return
      autoScrollStep()
      paint()
      session.raf = requestAnimationFrame(tick)
    }

    const activate = () => {
      if (!session || session.activated) return
      session.slots = buildSlots(measureDays(root), session.origin.itemId)
      session.snapshotScroll = scrollTopOf(scrollRef.current)
      session.activated = true
      session.longPressTimer = null
      headerPx = cssVarPx("--wp-header-height")
      navPx = cssVarPx("--wp-nav-clearance")
      setDraggingFlag(true)
      if (session.ul) session.ul.style.zIndex = "10"
      try {
        session.li.setPointerCapture(session.pointerId)
      } catch {
        /* Safari a veces ya ha perdido el puntero */
      }
      if (session.isTouch) {
        touchMoveBlocker = (e: TouchEvent) => {
          e.preventDefault()
        }
        document.addEventListener("touchmove", touchMoveBlocker, {
          passive: false,
        })
        try {
          navigator.vibrate?.(10)
        } catch {
          /* no soportado / denegado */
        }
      }
      suppressClick = true
      paint()
      session.raf = requestAnimationFrame(tick)
    }

    const commit = () => {
      if (!session?.activated) {
        restore()
        return
      }
      const scrollDelta =
        scrollTopOf(scrollRef.current) - session.snapshotScroll
      const target = resolveDropTarget(session.slots, session.lastY + scrollDelta)
      const from = session.origin
      const li = session.li
      if (!target) {
        restore()
        return
      }
      const params = toMoveParams(target, from)
      if (isNoOpMove(params, from)) {
        restore()
        return
      }
      // FLIP: capturar CON el transform del arrastre; limpiar después.
      captureRef.current()
      try {
        li.releasePointerCapture(session.pointerId)
      } catch {
        /* ya soltado */
      }
      if (session.ul) session.ul.style.zIndex = ""
      clearLift(li)
      hideLine(lineRef.current)
      stopAutoScroll()
      teardownTouchBlocker()
      setDraggingFlag(false)
      if (session.longPressTimer != null) {
        window.clearTimeout(session.longPressTimer)
      }
      session = null
      onMoveRef.current(params)
      window.setTimeout(() => {
        suppressClick = false
      }, 50)
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      if (session) return
      const target = event.target
      if (!(target instanceof Element)) return
      const fromHandle = Boolean(target.closest("[data-wp-drag-handle]"))
      if (target.closest(IGNORE_SELECTOR) && !fromHandle) return
      const li = target.closest<HTMLElement>("li[data-wp-draggable]")
      if (!li || !root.contains(li)) return
      const origin = originFromLi(li)
      if (!origin) return

      const isTouch = event.pointerType === "touch"
      // Desktop: solo el asa. En el cuerpo de la card (Booking, etc.) el click gana.
      if (!isTouch && !fromHandle) return

      session = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        li,
        ul: li.closest("ul"),
        origin,
        slots: [],
        snapshotScroll: 0,
        activated: false,
        longPressTimer: null,
        isTouch,
        raf: 0,
      }
      li.style.setProperty("-webkit-touch-callout", "none")
      li.style.userSelect = "none"

      if (isTouch && fromHandle) {
        activate()
      } else if (isTouch) {
        session.longPressTimer = window.setTimeout(() => {
          if (session && !session.activated) activate()
        }, TOUCH_LONG_PRESS_MS)
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return
      session.lastX = event.clientX
      session.lastY = event.clientY
      if (session.activated) {
        event.preventDefault()
        return
      }
      const d = dist(session.startX, session.startY, event.clientX, event.clientY)
      if (session.isTouch) {
        if (d > TOUCH_CANCEL_PX) restore()
        return
      }
      if (d >= FINE_THRESHOLD_PX) activate()
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return
      if (session.activated) commit()
      else restore()
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (!session || event.pointerId !== session.pointerId) return
      restore()
    }

    const onClickCapture = (event: Event) => {
      if (!suppressClick) return
      event.preventDefault()
      event.stopPropagation()
      suppressClick = false
    }

    const onContextMenu = (event: Event) => {
      if (!session) return
      event.preventDefault()
    }

    const onDragStart = (event: Event) => {
      if (!session) return
      event.preventDefault()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && session) restore()
    }

    root.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("pointermove", onPointerMove, { passive: false })
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerCancel)
    document.addEventListener("click", onClickCapture, true)
    root.addEventListener("contextmenu", onContextMenu)
    root.addEventListener("dragstart", onDragStart)
    window.addEventListener("keydown", onKeyDown)

    return () => {
      restore()
      suppressClick = false
      root.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerCancel)
      document.removeEventListener("click", onClickCapture, true)
      root.removeEventListener("contextmenu", onContextMenu)
      root.removeEventListener("dragstart", onDragStart)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [enabled, rootRef, scrollRef, chromeRef, lineRef])
}
