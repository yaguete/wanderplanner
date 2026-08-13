"use client"

import { cn } from "@/lib/utils"

export function SlidingIndicator({
  box,
  ready,
  variant,
}: {
  box: { x: number; y: number; w: number; h: number }
  ready: boolean
  variant: "pill" | "underline"
}) {
  if (!ready || box.w < 1) return null

  if (variant === "underline") {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 z-0 h-0.5 rounded-full bg-primary transition-[transform,width] duration-200 ease-out"
        style={{ transform: `translateX(${box.x}px)`, width: box.w }}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute left-0 top-0 z-0 rounded-md bg-background shadow-sm",
        "transition-[transform,width,height] duration-200 ease-out",
      )}
      style={{
        transform: `translate(${box.x}px, ${box.y}px)`,
        width: box.w,
        height: box.h,
      }}
    />
  )
}
