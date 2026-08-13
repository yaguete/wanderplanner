"use client"

import { useLayoutEffect, useRef } from "react"
import Link from "next/link"
import { BrandLockup } from "@/components/brand-mark"

const RANGE_PX = 240
const ARMED_CLASS = "landing-lockup-armed"
const SCROLLED_CLASS = "landing-header-scrolled"
const BLUR_AFTER_PX = 12

function clamp01(n: number) {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

/** Logo único: grande sobre el h1 → pequeño en el header. Incluye Firefox. */
export function LandingLockup() {
  const elRef = useRef<HTMLAnchorElement>(null)

  useLayoutEffect(() => {
    const flying = elRef.current
    const root = document.documentElement

    const syncHeaderBlur = () => {
      root.classList.toggle(SCROLLED_CLASS, window.scrollY > BLUR_AFTER_PX)
    }

    if (!flying || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (flying) flying.hidden = true
      syncHeaderBlur()
      window.addEventListener("scroll", syncHeaderBlur, { passive: true })
      return () => {
        root.classList.remove(SCROLLED_CLASS)
        window.removeEventListener("scroll", syncHeaderBlur)
      }
    }

    const fromEl = document.querySelector<HTMLElement>("[data-landing-lockup-from]")
    const toEl = document.querySelector<HTMLElement>("[data-landing-lockup-to]")
    if (!fromEl || !toEl) {
      flying.hidden = true
      syncHeaderBlur()
      window.addEventListener("scroll", syncHeaderBlur, { passive: true })
      return () => {
        root.classList.remove(SCROLLED_CLASS)
        window.removeEventListener("scroll", syncHeaderBlur)
      }
    }

    root.classList.add(ARMED_CLASS)
    flying.hidden = false

    const from0 = { left: 0, top: 0, width: 1 }

    const captureFrom = () => {
      const r = fromEl.getBoundingClientRect()
      from0.left = r.left
      from0.top = r.top + window.scrollY
      from0.width = Math.max(r.width, 1)
    }

    let raf = 0
    const paint = () => {
      raf = 0
      syncHeaderBlur()
      const to = toEl.getBoundingClientRect()
      const p = smoothstep(clamp01(window.scrollY / RANGE_PX))
      const x = from0.left + (to.left - from0.left) * p
      const y = from0.top + (to.top - from0.top) * p
      const s = (from0.width / Math.max(to.width, 1)) * (1 - p) + p
      flying.style.transform = `translate(${x}px, ${y}px) scale(${s})`
    }

    captureFrom()
    paint()
    void document.fonts?.ready.then(() => {
      captureFrom()
      paint()
    })

    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(paint)
    }
    const onResize = () => {
      captureFrom()
      onScroll()
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize)
    return () => {
      root.classList.remove(ARMED_CLASS)
      root.classList.remove(SCROLLED_CLASS)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <Link
      ref={elRef}
      href="/"
      hidden
      className="fixed left-0 top-0 z-50 origin-top-left will-change-transform"
      aria-label="WanderPlanner — inicio"
    >
      <BrandLockup />
    </Link>
  )
}
