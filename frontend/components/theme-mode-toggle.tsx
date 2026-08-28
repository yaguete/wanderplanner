"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Monitor, Moon, Smartphone, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { SlidingIndicator } from "@/hooks/sliding-indicator"
import { useSlidingIndicator } from "@/hooks/use-sliding-indicator"
import { cn } from "@/lib/utils"
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"

export const THEME_MODES = [
  { id: "system", label: "Sistema" },
  { id: "light", label: "Claro" },
  { id: "dark", label: "Oscuro" },
] as const

export type ThemeModeId = (typeof THEME_MODES)[number]["id"]

/** Sistema: teléfono en viewport móvil, monitor en desktop. */
function AppearanceGlyph({
  id,
  className,
}: {
  id: ThemeModeId
  className?: string
}) {
  if (id === "light") return <Sun className={className} aria-hidden />
  if (id === "dark") return <Moon className={className} aria-hidden />
  return (
    <>
      <Smartphone className={cn(className, "md:hidden")} aria-hidden />
      <Monitor className={cn(className, "hidden md:block")} aria-hidden />
    </>
  )
}

export function ThemeModeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const active = mounted && theme && THEME_MODES.some((m) => m.id === theme) ? theme : ""
  const { containerRef, box, ready } = useSlidingIndicator(active, THEME_MODES.length)

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label="Apariencia"
      className={cn(
        "relative inline-flex items-center rounded-full border border-border p-0.5",
        className,
      )}
    >
      {mounted && ready ? (
        <SlidingIndicator box={box} ready={ready} variant="circle" />
      ) : null}
      {THEME_MODES.map(({ id, label }) => {
        const checked = active === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            data-indicator-target
            data-indicator-active={checked ? "true" : undefined}
            onClick={() => setTheme(id)}
            className={cn(
              "relative z-10 flex size-8 items-center justify-center rounded-full",
              "text-muted-foreground outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring",
              checked && "text-foreground",
            )}
          >
            <AppearanceGlyph id={id} className="size-3.5" />
          </button>
        )
      })}
    </div>
  )
}

export function AppearanceMenuFold({
  expand,
  open,
  onOpenChange,
}: {
  expand: "down" | "up"
  open: boolean
  onOpenChange: (open: boolean | ((prev: boolean) => boolean)) => void
}) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const value = mounted && theme && THEME_MODES.some((m) => m.id === theme) ? theme : "system"
  const Chevron = expand === "up" ? ChevronUp : ChevronDown

  const trigger = (
    <DropdownMenuItem
      aria-expanded={open}
      onSelect={(event) => event.preventDefault()}
      onClick={() => onOpenChange((prev) => !prev)}
    >
      <AppearanceGlyph id={value} className="h-4 w-4" />
      Apariencia
      <Chevron
        className={cn(
          "ml-auto h-4 w-4 text-muted-foreground transition-transform",
          open && "rotate-180",
        )}
        aria-hidden
      />
    </DropdownMenuItem>
  )

  const options = open ? (
    <DropdownMenuRadioGroup value={value} onValueChange={setTheme}>
      {THEME_MODES.map(({ id, label }) => (
        <DropdownMenuRadioItem
          key={id}
          value={id}
          className="text-[11px] leading-snug text-muted-foreground data-[state=checked]:text-foreground"
        >
          {label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  ) : null

  return (
    <>
      {expand === "up" ? options : null}
      {trigger}
      {expand === "down" ? options : null}
    </>
  )
}
