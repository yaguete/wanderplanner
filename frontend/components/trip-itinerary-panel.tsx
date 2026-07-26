'use client'

import type { TripDay, TripItem, TripItemKind } from "@/types/itinerary"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Utensils,
  Hotel,
  Bus,
  Landmark,
  X,
  Plus,
  Lightbulb,
} from "lucide-react"

interface TripItineraryPanelProps {
  days: TripDay[]
  onAddDay: () => void
  onRemoveItem: (dayId: string, itemId: string) => void
}

const KIND_ICONS: Record<TripItemKind, React.ReactNode> = {
  accommodation: <Hotel className="h-5 w-5 text-muted-foreground" />,
  activity: <Landmark className="h-5 w-5 text-muted-foreground" />,
  restaurant: <Utensils className="h-5 w-5 text-muted-foreground" />,
  transport: <Bus className="h-5 w-5 text-muted-foreground" />,
}

export default function TripItineraryPanel({ days, onAddDay, onRemoveItem }: TripItineraryPanelProps) {
  if (days.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-3">
        <Lightbulb className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground text-center">
          Head to Inspiration to discover places, then add them here.
        </p>
        <button
          onClick={onAddDay}
          className="mt-2 border-2 border-dashed border-muted-foreground/25 rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <Plus className="h-4 w-4 inline mr-1 -mt-0.5" />
          Add your first day
        </button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4">
        <Accordion type="multiple" defaultValue={days.map((d) => d.id)}>
          {days.map((day) => (
            <AccordionItem key={day.id} value={day.id}>
              <AccordionTrigger className="text-sm hover:no-underline">
                <span>
                  <span className="font-semibold">Day {day.dayNumber}</span>
                  {day.title && <span className="text-muted-foreground font-normal ml-2">{day.title}</span>}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {day.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 px-1">
                    No items yet. Use the + button in Inspiration to add places here.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 pb-2">
                    {day.items.map((item) => (
                      <TripItemCard
                        key={item.id}
                        item={item}
                        onRemove={() => onRemoveItem(day.id, item.id)}
                      />
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <button
          onClick={onAddDay}
          className="mt-3 w-full border-2 border-dashed border-muted-foreground/25 rounded-xl py-3 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add day
        </button>
      </div>
    </div>
  )
}

function TripItemCard({ item, onRemove }: { item: TripItem; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-white border border-border rounded-xl p-3">
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
        {KIND_ICONS[item.kind]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.name}</p>
        {item.subtitle && <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>}
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
