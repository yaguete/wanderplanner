'use client'

import type { TripDay } from "@/types/itinerary"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Plus } from "lucide-react"
import { useState } from "react"

interface DayPickerPopoverProps {
  tripDays: TripDay[]
  onSelect: (dayId: string) => void
  children?: React.ReactNode
}

export default function DayPickerPopover({ tripDays, onSelect, children }: DayPickerPopoverProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (dayId: string) => {
    onSelect(dayId)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <button className="shrink-0 border border-border rounded-full w-7 h-7 flex items-center justify-center hover:bg-muted transition-colors">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-2">
        {tripDays.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">
            Create your first day in Your Trips
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-muted-foreground px-2 py-1">Add to day</p>
            {tripDays.map((day) => (
              <button
                key={day.id}
                onClick={() => handleSelect(day.id)}
                className="text-left text-sm px-2 py-1.5 rounded-md hover:bg-muted transition-colors truncate"
              >
                Day {day.dayNumber}{day.title ? ` — ${day.title}` : ""}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
