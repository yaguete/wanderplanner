"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { SlidingIndicator } from "@/hooks/sliding-indicator"
import { useSlidingIndicator } from "@/hooks/use-sliding-indicator"
import { cn } from "@/lib/utils"
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"

export const THEME_MODES = [
  { id: "system", label: "Sistema", Icon: Monitor },
  { id: "light", label: "Claro", Icon: Sun },
  { id: "dark", label: "Oscuro", Icon: Moon },
] as const

export type ThemeModeId = (typeof THEME_MODES)[number]["id"]

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
      {THEME_MODES.map(({ id, label, Icon }) => {
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
            <Icon className="size-3.5" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

export function AppearanceMenuSub() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const value = mounted && theme && THEME_MODES.some((m) => m.id === theme) ? theme : "system"
  const ActiveIcon = THEME_MODES.find((m) => m.id === value)?.Icon ?? Monitor

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ActiveIcon className="h-4 w-4" />
        Apariencia
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={value} onValueChange={setTheme}>
          {THEME_MODES.map(({ id, label }) => (
            <DropdownMenuRadioItem key={id} value={id}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
