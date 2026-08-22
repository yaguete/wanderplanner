"use client"

import { useEffect, useState, type KeyboardEventHandler } from "react"
import { cn } from "@/lib/utils"
import { parseCostInput } from "@/lib/task-labels"

export type CostInputProps = {
  value: number | null
  currency: string
  onChange: (next: number | null) => void
  /** `change` (default) persiste en cada pulsación; `blur` al salir o Enter. */
  commit?: "change" | "blur"
  ariaLabel?: string
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  className?: string
  inputClassName?: string
  /** Marca el input para que Enter salte al siguiente hueco de la cuenta. */
  jumpOnEnter?: boolean
}

export function CostInput({
  value,
  currency,
  onChange,
  commit = "change",
  ariaLabel = "Coste total",
  onKeyDown,
  className,
  inputClassName,
  jumpOnEnter = false,
}: CostInputProps) {
  const [draft, setDraft] = useState(() => (value == null ? "" : String(value)))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (focused) return
    setDraft(value == null ? "" : String(value))
  }, [value, focused])

  const suffix = currency.trim().toUpperCase() || "EUR"
  const showPlaceholder = !focused && draft === ""

  const commitDraft = (raw: string) => {
    if (raw.trim() === "") {
      onChange(null)
      return
    }
    const parsed = parseCostInput(raw)
    if (parsed != null) onChange(parsed)
  }

  return (
    <label className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <input
        type="text"
        inputMode="decimal"
        value={showPlaceholder ? "" : draft}
        placeholder="—"
        aria-label={ariaLabel}
        data-wp-budget-amount={jumpOnEnter ? "" : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          if (commit === "blur") {
            if (draft.trim() === "") {
              onChange(null)
              setDraft("")
              return
            }
            const parsed = parseCostInput(draft)
            if (parsed != null) {
              onChange(parsed)
              setDraft(String(parsed))
            } else {
              setDraft(value == null ? "" : String(value))
            }
            return
          }
          setDraft(value == null ? "" : String(value))
        }}
        onChange={(e) => {
          const raw = e.target.value
          setDraft(raw)
          if (commit === "change") commitDraft(raw)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (commit === "blur") {
              if (draft.trim() === "") {
                onChange(null)
              } else {
                const parsed = parseCostInput(draft)
                if (parsed != null) onChange(parsed)
              }
            }
            if (jumpOnEnter) {
              e.preventDefault()
              const all = Array.from(
                document.querySelectorAll<HTMLInputElement>("[data-wp-budget-amount]"),
              )
              const i = all.indexOf(e.currentTarget)
              all[i + 1]?.focus()
            }
          }
          onKeyDown?.(e)
        }}
        className={cn(
          "h-7 w-[4.75rem] rounded-md bg-transparent px-1.5",
          "text-right text-xs tabular-nums text-foreground outline-none",
          "placeholder:text-muted-foreground/70",
          "hover:bg-muted/50",
          "focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring",
          "transition-colors",
          inputClassName,
        )}
      />
      <span className="tabular-nums">{suffix}</span>
    </label>
  )
}
