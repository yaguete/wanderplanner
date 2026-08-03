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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  EXTRA_TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
} from "@/lib/task-labels"
import type { TripTaskCategory } from "@/types/itinerary"

export type AddExtraTaskDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: { title: string; category: TripTaskCategory }) => void
  /** Categoría preseleccionada al abrir (pestaña activa). */
  defaultCategory?: TripTaskCategory
}

export function AddExtraTaskDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultCategory = "other",
}: AddExtraTaskDialogProps) {
  const id = useId()
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState<TripTaskCategory>(defaultCategory)

  useEffect(() => {
    if (!open) return
    setTitle("")
    setCategory(defaultCategory)
  }, [open, defaultCategory])

  const titleId = `${id}-title`
  const categoryId = `${id}-category`
  const canSubmit = title.trim().length > 0

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onSubmit({ title: trimmed, category })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir tarea</DialogTitle>
          <DialogDescription>
            Escribe la acción tal como la harías («Reservar visita guiada»).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={titleId}>Acción</Label>
            <Input
              id={titleId}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reservar visita guiada"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={categoryId}>Categoría</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as TripTaskCategory)}
            >
              <SelectTrigger id={categoryId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXTRA_TASK_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {TASK_CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
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
