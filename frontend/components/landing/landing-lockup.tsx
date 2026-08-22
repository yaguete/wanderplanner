"use client"

import { useLayoutEffect, useRef } from "react"
import { BrandLockup } from "@/components/brand-mark"
import type { LandingTone } from "./landing-tone"

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
export function LandingLockup({
  tone = "light",
  href = "/",
  label,
  markSrc,
  wordmarkClassName,
  wordmarkInk,
  wordmarkHand,
}: {
  tone?: LandingTone
  href?: string
  label?: string
  markSrc?: string
  wordmarkClassName?: string
  wordmarkInk?: "brand" | "black"
  wordmarkHand?: boolean
}) {
  const elRef = useRef<HTMLAnchorElement>(null)

  useLayoutEffect(() => {
    const flying =
      elRef.current ?? document.querySelector<HTMLAnchorElement>(".landing-flying-lockup")
    const root = document.documentElement

    const syncHeaderBlur = () => {
      root.classList.toggle(SCROLLED_CLASS, window.scrollY > BLUR_AFTER_PX)
    }

    if (!flying || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
      syncHeaderBlur()
      window.addEventListener("scroll", syncHeaderBlur, { passive: true })
      return () => {
        root.classList.remove(SCROLLED_CLASS)
        window.removeEventListener("scroll", syncHeaderBlur)
      }
    }

    root.classList.add(ARMED_CLASS)

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
      // Y a ritmo del h1 (flujo del documento) hasta atracar en el header.
      const y = Math.max(to.top, from0.top - window.scrollY)
      const travel = Math.max(from0.top - to.top, 1)
      const p = smoothstep(clamp01(window.scrollY / travel))
      // Ardilla fuera en la segunda mitad del trayecto (al hacerse pequeña / atracar).
      const markOut = smoothstep(clamp01((p - 0.4) / 0.6))
      const x = from0.left + (to.left - from0.left) * p
      // Escala contra el lockup completo (offsetWidth ignora el scale del hero).
      // El destino es solo el wordmark; no usar to.width.
      const s = (from0.width / Math.max(fromEl.offsetWidth, 1)) * (1 - p) + p
      flying.style.transform = `translate(${x}px, ${y}px) scale(${s})`
      flying.style.setProperty("--landing-lockup-p", String(markOut))
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
    <a
      ref={elRef}
      href={href}
      className="landing-flying-lockup fixed left-0 top-0 z-50 origin-top-left will-change-transform"
      aria-label={label ? `${label} — inicio` : "WanderPlanner — inicio"}
    >
      <BrandLockup
        variant={tone === "negative" ? "negative" : "color"}
        label={label}
        markSrc={markSrc}
        wordmarkClassName={wordmarkClassName}
        wordmarkInk={wordmarkInk}
        wordmarkHand={wordmarkHand}
      />
    </a>
  )
}
