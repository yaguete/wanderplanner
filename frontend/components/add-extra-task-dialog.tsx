"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
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
import { CostInput } from "@/components/cost-input"
import { isMobileViewport } from "@/hooks/use-mobile"
import { TASK_CATEGORY_ICONS } from "@/lib/item-styles"
import { TASK_CATEGORY_LABELS, TASK_CATEGORY_ORDER } from "@/lib/task-labels"
import type { TaskGroupCategory, TripTaskCategory, TripTaskState } from "@/types/itinerary"

export type AddExtraTaskDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: {
    title: string
    category: TripTaskCategory
    state?: Partial<TripTaskState>
  }) => void
  /** Categoría fija al crear (pestaña Básicos → `basic`). */
  defaultCategory?: TripTaskCategory
  showCategoryPicker?: boolean
  showAmount?: boolean
  currency?: string
}

export function AddExtraTaskDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultCategory = "basic",
  showCategoryPicker = false,
  showAmount = false,
  currency = "EUR",
}: AddExtraTaskDialogProps) {
  const id = useId()
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState<TaskGroupCategory>(
    defaultCategory === "paperwork" || defaultCategory === "health"
      ? "other"
      : defaultCategory,
  )
  const [cost, setCost] = useState<number | null>(null)
  const costRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle("")
    setCategory(
      defaultCategory === "paperwork" || defaultCategory === "health"
        ? "other"
        : defaultCategory,
    )
    setCost(null)
    costRef.current = null
  }, [open, defaultCategory])

  const titleId = `${id}-title`
  const canSubmit = title.trim().length > 0

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    onSubmit({
      title: trimmed,
      category: showCategoryPicker ? category : defaultCategory,
      state: showAmount && costRef.current != null ? { cost: costRef.current } : undefined,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullscreenOnMobile hideClose className="sm:max-w-md">
        <DialogHeader className="shrink-0 space-y-1.5 px-6 py-4 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {showAmount ? "Añadir gasto" : "Añadir tarea"}
          </DialogTitle>
          <DialogDescription>
            {showAmount
              ? "Un gasto suelto (visado, SIM, propina…) que no está en la ruta."
              : "Escribe la acción tal como la harías («Contratar seguro de viaje»)."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 pb-10">
            <div className="space-y-2">
              <Label htmlFor={titleId}>{showAmount ? "Concepto" : "Acción"}</Label>
              <Input
                id={titleId}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={showAmount ? "Visado de Estados Unidos" : "Contratar seguro de viaje"}
                autoFocus={!isMobileViewport()}
              />
            </div>
            {showCategoryPicker ? (
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as TaskGroupCategory)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_CATEGORY_ORDER.map((cat) => {
                      const Icon = TASK_CATEGORY_ICONS[cat]
                      return (
                      <SelectItem key={cat} value={cat}>
                        <span className="inline-flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {TASK_CATEGORY_LABELS[cat]}
                        </span>
                      </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {showAmount ? (
              <div className="space-y-2">
                <Label>Importe</Label>
                <CostInput
                  value={cost}
                  currency={currency}
                  onChange={(next) => {
                    costRef.current = next
                    setCost(next)
                  }}
                  commit="blur"
                  ariaLabel="Importe del gasto"
                />
              </div>
            ) : null}
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
