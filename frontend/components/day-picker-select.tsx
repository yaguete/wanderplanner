"use client"

import { useEffect, useRef } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  dayHasSourceItem,
  firstDayIdWithoutSourceItem,
  formatDayPickerHint,
  formatDayPickerLabel,
  getDayUserDescription,
} from "@/lib/day-heading"
import { dateISOForDayIndex, formatDayDateShort } from "@/lib/trip-dates"
import type { UserDay } from "@/types/itinerary"

export function DayPickerSelect({
  id,
  label,
  days,
  startDate = null,
  value,
  onValueChange,
  sourceItemId = null,
  onAddDay,
  disabled = false,
  occupiedHint = null,
  disableDay,
  selectNewlyAddedDays = true,
}: {
  id: string
  label: string
  days: UserDay[]
  startDate?: string | null
  value: string
  onValueChange: (dayId: string) => void
  sourceItemId?: string | null
  onAddDay?: () => void
  disabled?: boolean
  occupiedHint?: string | null
  disableDay?: (day: UserDay, index: number) => boolean
  /** Si crece `days.length`, selecciona el último día. Default true. */
  selectNewlyAddedDays?: boolean
}) {
  const prevLength = useRef(days.length)
  useEffect(() => {
    if (selectNewlyAddedDays && days.length > prevLength.current) {
      const last = days[days.length - 1]
      if (last) onValueChange(last.id)
    }
    prevLength.current = days.length
  }, [days, onValueChange, selectNewlyAddedDays])

  useEffect(() => {
    if (!sourceItemId) return
    const free = firstDayIdWithoutSourceItem(days, sourceItemId)
    const occupied = Boolean(
      value && days.some((d) => d.id === value && dayHasSourceItem(d, sourceItemId)),
    )
    if (occupied || !value) {
      const next = free ?? ""
      if (next !== value) onValueChange(next)
    }
  }, [days, sourceItemId, value, onValueChange])

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {days.length > 0 ? (
        <Select
          value={value || undefined}
          onValueChange={onValueChange}
          disabled={disabled}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Elige un día" />
          </SelectTrigger>
          <SelectContent>
            {days.map((day, index) => {
              const alreadyHere = sourceItemId
                ? dayHasSourceItem(day, sourceItemId)
                : false
              const blocked = alreadyHere || Boolean(disableDay?.(day, index))
              const hint = formatDayPickerHint({
                description: getDayUserDescription(day.label),
                itemCount: day.items.length,
              })
              const optionLabel = formatDayPickerLabel(
                index,
                formatDayDateShort(dateISOForDayIndex(startDate, index)),
              )
              return (
                <SelectItem
                  key={day.id}
                  value={day.id}
                  textValue={optionLabel}
                  hint={hint}
                  alreadyHere={alreadyHere}
                  disabled={blocked}
                >
                  {optionLabel}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-sm text-muted-foreground">Este viaje aún no tiene días.</p>
      )}
      {occupiedHint ? (
        <p className="text-sm text-muted-foreground">{occupiedHint}</p>
      ) : null}
      {onAddDay ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 text-muted-foreground"
          onClick={onAddDay}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Añadir día
        </Button>
      ) : null}
    </div>
  )
}
