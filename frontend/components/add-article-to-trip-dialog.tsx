"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { AddArticleTripOption, TripFeedEligibility } from "@/lib/reference-feed"
import { cn } from "@/lib/utils"
import { useMemo } from "react"

function eligibilityHint(kind: TripFeedEligibility): string | null {
  if (kind === "duplicate") return "Ya está en este viaje"
  if (kind === "full") return "Este viaje ya tiene 5 fuentes"
  if (kind === "busy") return "Hay una fuente extrayéndose"
  return null
}

export function AddArticleToTripDialog({
  open,
  articleTitle,
  options,
  onOpenChange,
  onPick,
}: {
  open: boolean
  articleTitle: string
  options: AddArticleTripOption[]
  onOpenChange: (open: boolean) => void
  onPick: (tripId: string) => void
}) {
  const hasOk = useMemo(() => options.some((o) => o.eligibility === "ok"), [options])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir a un viaje</DialogTitle>
          <DialogDescription>
            ¿A qué viaje quieres incorporar «{articleTitle}»?
          </DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tienes viajes activos.</p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border">
            {options.map((option) => {
              const disabled = option.eligibility !== "ok"
              const hint = eligibilityHint(option.eligibility)
              return (
                <li key={option.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(option.id)}
                    className={cn(
                      "flex w-full flex-col items-start px-4 py-3 text-left text-sm transition-colors",
                      disabled ? "cursor-not-allowed opacity-60" : "hover:bg-muted/40",
                    )}
                  >
                    <span className="font-medium">{option.name}</span>
                    {hint ? (
                      <span className="mt-0.5 text-[12px] text-muted-foreground">{hint}</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {!hasOk && options.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Ningún viaje puede aceptar este artículo ahora mismo.
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
