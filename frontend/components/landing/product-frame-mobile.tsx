"use client"

import { Children, useCallback, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Carrusel a un panel del mockup (solo &lt; lg). Scroll-snap nativo + puntos.
 * El padre del frame es pointer-events-none; aquí se reactiva el gesto.
 */
export function ProductFrameMobile({ children }: { children: ReactNode }) {
  const slides = Children.toArray(children)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el || el.clientWidth === 0) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    setActive(Math.min(slides.length - 1, Math.max(0, next)))
  }, [slides.length])

  const goTo = (index: number) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" })
  }

  return (
    <div className="pointer-events-auto lg:hidden">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, index) => (
          <div key={index} className="w-full shrink-0 snap-center">
            {slide}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1.5 py-2.5">
        {slides.map((_, index) => (
          <button
            key={index}
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => goTo(index)}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-200",
              index === active ? "w-4 bg-foreground" : "w-1.5 bg-foreground/25",
            )}
          />
        ))}
      </div>
    </div>
  )
}
