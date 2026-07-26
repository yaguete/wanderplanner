"use client"

import { useEffect, useRef, type CSSProperties } from "react"
import { Plus, SendHorizontal, Sparkles, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

/** Offset desde la derecha cuando «Mi viaje» está abierto (right-2 + ancho panel + gap). */
export const PLAN_PANEL_RIGHT_OFFSET =
  "calc(0.5rem + min(560px, calc(100vw - 2rem)) + 0.75rem)"

type AssistantPanelLayerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** En desktop, desplaza el chat a la izquierda del panel Mi viaje. */
  shiftForPlan?: boolean
}

export function AssistantPanelLayer({
  open,
  onOpenChange,
  shiftForPlan = false,
}: AssistantPanelLayerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!open) return
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div
      id="inspiration-assistant-panel"
      role="dialog"
      aria-modal={isMobile ? true : undefined}
      aria-label="Asistente de viaje"
      className={cn(
        "absolute z-40 flex min-h-0 flex-col overflow-hidden bg-background",
        "inset-0 border-t border-border",
        /* Mismo footprint que «Mi viaje» en desktop: top/bottom/right-2 + ancho 560 */
        "sm:inset-auto sm:top-2 sm:bottom-2 sm:w-[min(560px,calc(100vw-2rem))]",
        "sm:rounded-xl sm:border sm:shadow-[0_16px_48px_rgba(0,0,0,0.14)]",
        "duration-200 animate-in fade-in-0 slide-in-from-bottom-2",
        shiftForPlan ? "sm:right-[var(--plan-panel-offset)]" : "sm:right-2",
      )}
      style={
        shiftForPlan
          ? ({ "--plan-panel-offset": PLAN_PANEL_RIGHT_OFFSET } as CSSProperties)
          : undefined
      }
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          Asistente del viaje
        </p>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Cerrar asistente"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 bg-muted/20 p-4">
        <p className="max-w-[270px] text-xs leading-relaxed text-muted-foreground">
          Pregúntame sobre tus fuentes o sobre la ruta que estás preparando.
        </p>
      </div>

      <div className="shrink-0 border-t border-border bg-background p-3">
        <div className="flex items-center gap-2 rounded-full border border-border bg-background p-1.5 shadow-sm">
          <button
            type="button"
            disabled
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground"
            aria-label="Adjuntar archivo"
          >
            <Plus className="h-4 w-4" />
          </button>
          <Input
            ref={inputRef}
            placeholder="Disponible próximamente"
            className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            aria-label="Asistente no disponible todavía"
            disabled
          />
          <button
            type="button"
            disabled
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
            aria-label="Enviar mensaje"
          >
            <SendHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          El asistente estará disponible próximamente
        </p>
      </div>
    </div>
  )
}
