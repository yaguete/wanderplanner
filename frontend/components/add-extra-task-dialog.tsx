"use client"

import { useEffect, useId, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isMobileViewport } from "@/hooks/use-mobile"
import type { TripTaskCategory } from "@/types/itinerary"

export type AddExtraTaskDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: { title: string; category: TripTaskCategory }) => void
  /** Categoría fija al crear (pestaña Básicos → `basic`). */
  defaultCategory?: TripTaskCategory
}

export function AddExtraTaskDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultCategory = "basic",
}: AddExtraTaskDialogProps) {
  const id = useId()
  const [title, setTitle] = useState("")

  useEffect(() => {
    if (!open) return
    setTitle("")
  }, [open])

  const titleId = `${id}-title`
  const canSubmit = title.trim().length > 0

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onSubmit({ title: trimmed, category: defaultCategory })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullscreenOnMobile hideClose className="sm:max-w-md">
        <DialogHeader className="shrink-0 space-y-1.5 px-6 py-4 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Añadir tarea
          </DialogTitle>
          <DialogDescription>
            Escribe la acción tal como la harías («Contratar seguro de viaje»).
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 pb-10">
            <div className="space-y-2">
              <Label htmlFor={titleId}>Acción</Label>
              <Input
                id={titleId}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contratar seguro de viaje"
                autoFocus={!isMobileViewport()}
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Añadir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
