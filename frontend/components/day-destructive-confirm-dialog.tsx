"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { itemTypeLabel } from "@/lib/item-styles"
import { isRouteLegItem } from "@/lib/route-legs"
import { cn } from "@/lib/utils"
import type { UserDay, UserDayItem } from "@/types/itinerary"

export type DayDestructiveAction =
  | { kind: "reset"; dayId: string }
  | { kind: "remove"; dayIds: string[] }

function removableItemsInDays(days: UserDay[], dayIds: string[]): UserDayItem[] {
  const ids = new Set(dayIds)
  const items: UserDayItem[] = []
  for (const day of days) {
    if (!ids.has(day.id)) continue
    for (const item of day.items) {
      if (isRouteLegItem(item)) continue
      items.push(item)
    }
  }
  return items
}

function dayNumbers(days: UserDay[], dayIds: string[]): number[] {
  return dayIds
    .map((id) => days.findIndex((d) => d.id === id))
    .filter((i) => i >= 0)
    .map((i) => i + 1)
}

function itemLine(item: UserDayItem): string {
  return `${item.name} (${itemTypeLabel(item.type, item).toLowerCase()})`
}

function copyFor(action: DayDestructiveAction, days: UserDay[]): {
  title: string
  description: string
} {
  const ids = action.kind === "reset" ? [action.dayId] : action.dayIds
  const nums = dayNumbers(days, ids)
  const undo = "Esta acción no se puede deshacer."

  if (action.kind === "reset") {
    const target = nums.length === 1 ? `del Día ${nums[0]}` : "del día"
    return {
      title: "Reiniciar día",
      description: `¿Seguro que quieres eliminar todos los ítems ${target}? ${undo}`,
    }
  }
  if (nums.length > 1) {
    return {
      title: "Eliminar días",
      description: `¿Seguro que quieres eliminar ${nums.length} días? ${undo}`,
    }
  }
  const target = nums.length === 1 ? `el Día ${nums[0]}` : "el día"
  return {
    title: "Eliminar día",
    description: `¿Seguro que quieres eliminar ${target}? ${undo}`,
  }
}

export function DayDestructiveConfirmDialog({
  action,
  days,
  onOpenChange,
  onConfirm,
}: {
  action: DayDestructiveAction | null
  days: UserDay[]
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const items = action
    ? removableItemsInDays(
        days,
        action.kind === "reset" ? [action.dayId] : action.dayIds,
      )
    : []
  const copy = action ? copyFor(action, days) : { title: "", description: "" }

  return (
    <AlertDialog open={!!action} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {items.length > 0 ? (
          <ul className="max-h-52 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-foreground">
            {items.map((item) => (
              <li key={item.id}>{itemLine(item)}</li>
            ))}
          </ul>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            onClick={onConfirm}
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
