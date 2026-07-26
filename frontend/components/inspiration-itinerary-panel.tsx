'use client'

import type {
  Reference,
  ItineraryDay,
  Transport,
  Accommodation,
  Restaurant,
  Activity,
  TripDay,
  TripItem,
  TripItemKind,
} from "@/types/itinerary"
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
  Lightbulb,
  Loader2,
  Landmark,
  Ship,
  Plane,
  Train,
  Car,
} from "lucide-react"
import DayPickerPopover from "@/components/day-picker-popover"

interface InspirationItineraryPanelProps {
  reference: Reference | null
  isLoading: boolean
  tripDays: TripDay[]
  onAddItem: (dayId: string, item: TripItem) => void
}

export default function InspirationItineraryPanel({
  reference,
  isLoading,
  tripDays,
  onAddItem,
}: InspirationItineraryPanelProps) {
  if (isLoading && !reference) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!reference) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          Select a reference to see its itinerary.
        </p>
      </div>
    )
  }

  const { days, general_tips } = reference.itinerary

  const makeAddHandler = (kind: TripItemKind, name: string, subtitle: string | null) =>
    (dayId: string) => {
      onAddItem(dayId, {
        id: crypto.randomUUID(),
        kind,
        name,
        subtitle,
        sourceRefId: reference.id,
      })
    }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4">
        <Accordion type="multiple" defaultValue={days.map((d) => `day-${d.day}`)}>
          {days.map((day) => (
            <DayItem
              key={day.day}
              day={day}
              tripDays={tripDays}
              makeAddHandler={makeAddHandler}
            />
          ))}
        </Accordion>

        {general_tips && (
          <div className="mt-4 p-3 rounded-md bg-muted/50 flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium mb-1">General tips</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{general_tips}</p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
            <span className="text-sm text-muted-foreground">Loading more...</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Day accordion item ─────────────────────────────────────────────────────────

type MakeAddHandler = (kind: TripItemKind, name: string, subtitle: string | null) => (dayId: string) => void

function DayItem({
  day,
  tripDays,
  makeAddHandler,
}: {
  day: ItineraryDay
  tripDays: TripDay[]
  makeAddHandler: MakeAddHandler
}) {
  return (
    <AccordionItem value={`day-${day.day}`}>
      <AccordionTrigger className="text-sm hover:no-underline">
        <span>
          <span className="font-semibold">Day {day.day}</span>
          {day.title && <span className="text-muted-foreground font-normal ml-2">{day.title}</span>}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="flex flex-col gap-2 pb-2">
          {(day.transport ?? []).map((t, i) => (
            <TransportCard key={`t-${i}`} item={t} tripDays={tripDays} makeAddHandler={makeAddHandler} />
          ))}
          {(day.accommodations ?? []).map((a, i) => (
            <AccommodationCard key={`a-${i}`} item={a} tripDays={tripDays} makeAddHandler={makeAddHandler} />
          ))}
          {(day.restaurants ?? []).map((r, i) => (
            <RestaurantCard key={`r-${i}`} item={r} tripDays={tripDays} makeAddHandler={makeAddHandler} />
          ))}
          {(day.activities ?? []).map((a, i) => (
            <ActivityCard key={`ac-${i}`} item={a} tripDays={tripDays} makeAddHandler={makeAddHandler} />
          ))}
          {day.tips && (
            <div className="flex items-start gap-2 px-1 pt-1">
              <Lightbulb className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-xs text-muted-foreground">{day.tips}</span>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

// ── Shared card shell ──────────────────────────────────────────────────────────

function ItemCard({
  icon,
  name,
  subtitle,
  action,
  addButton,
}: {
  icon: React.ReactNode
  name: string
  subtitle?: string | null
  action?: React.ReactNode
  addButton?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 bg-white border border-border rounded-xl p-3">
      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {addButton}
        {action}
      </div>
    </div>
  )
}

function OutlineButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="shrink-0 border border-border rounded-full px-3 py-1 text-xs font-medium hover:bg-muted transition-colors">
      {children}
    </button>
  )
}

// ── Item cards ─────────────────────────────────────────────────────────────────

interface CardProps {
  tripDays: TripDay[]
  makeAddHandler: MakeAddHandler
}

function TransportCard({ item, tripDays, makeAddHandler }: { item: Transport } & CardProps) {
  const icons: Record<string, React.ReactNode> = {
    flight: <Plane className="h-5 w-5 text-muted-foreground" />,
    ferry: <Ship className="h-5 w-5 text-muted-foreground" />,
    train: <Train className="h-5 w-5 text-muted-foreground" />,
    car: <Car className="h-5 w-5 text-muted-foreground" />,
  }
  const icon = icons[item.type] ?? <Bus className="h-5 w-5 text-muted-foreground" />
  const subtitle = [
    item.from && item.to ? `${item.from} → ${item.to}` : null,
    item.notes,
  ].filter(Boolean).join(" · ")
  const name = item.type.charAt(0).toUpperCase() + item.type.slice(1)

  return (
    <ItemCard
      icon={icon}
      name={name}
      subtitle={subtitle || null}
      action={<OutlineButton>Details</OutlineButton>}
      addButton={<DayPickerPopover tripDays={tripDays} onSelect={makeAddHandler("transport", name, subtitle || null)} />}
    />
  )
}

function AccommodationCard({ item, tripDays, makeAddHandler }: { item: Accommodation } & CardProps) {
  return (
    <ItemCard
      icon={<Hotel className="h-5 w-5 text-muted-foreground" />}
      name={item.name}
      subtitle={item.notes}
      action={
        <button className="shrink-0 bg-black text-white rounded-full px-3 py-1 text-xs font-medium hover:bg-black/80 transition-colors">
          Book
        </button>
      }
      addButton={<DayPickerPopover tripDays={tripDays} onSelect={makeAddHandler("accommodation", item.name, item.notes)} />}
    />
  )
}

function RestaurantCard({ item, tripDays, makeAddHandler }: { item: Restaurant } & CardProps) {
  return (
    <ItemCard
      icon={<Utensils className="h-5 w-5 text-muted-foreground" />}
      name={item.name}
      subtitle={item.notes}
      action={<OutlineButton>Details</OutlineButton>}
      addButton={<DayPickerPopover tripDays={tripDays} onSelect={makeAddHandler("restaurant", item.name, item.notes)} />}
    />
  )
}

function ActivityCard({ item, tripDays, makeAddHandler }: { item: Activity } & CardProps) {
  const hasSubs = item.sub_activities && item.sub_activities.length > 0

  if (!hasSubs) {
    return (
      <ItemCard
        icon={<Landmark className="h-5 w-5 text-muted-foreground" />}
        name={item.name}
        subtitle={item.notes}
        action={<OutlineButton>Details</OutlineButton>}
        addButton={<DayPickerPopover tripDays={tripDays} onSelect={makeAddHandler("activity", item.name, item.notes)} />}
      />
    )
  }

  return (
    <div className="bg-white border border-border rounded-xl p-3">
      {/* Parent row */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Landmark className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.name}</p>
          {item.notes && <p className="text-xs text-muted-foreground truncate">{item.notes}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <DayPickerPopover tripDays={tripDays} onSelect={makeAddHandler("activity", item.name, item.notes)} />
          <OutlineButton>Details</OutlineButton>
        </div>
      </div>
      {/* Timeline sub-activities */}
      <div className="relative ml-[23px] mt-1 pl-7 flex flex-col gap-3 py-2">
        <div aria-hidden className="absolute left-0 bottom-0 w-0.5 bg-muted z-0" style={{ top: 19 }} />
        {item.sub_activities!.map((sub, i) => {
          const isLast = i === item.sub_activities!.length - 1
          return (
            <div key={`sub-${i}`} className="relative">
              <div className="absolute top-1.5 z-10 w-2.5 h-2.5 rounded-full bg-gray-300 ring-2 ring-white" style={{ left: "calc(-1.75rem - 4px)" }} />
              {isLast && (
                <div aria-hidden className="absolute z-[1] bg-white" style={{ left: "calc(-1.75rem - 2px)", width: 6, top: 16, bottom: -8 }} />
              )}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{sub.name}</p>
                  {sub.notes && <p className="text-xs text-muted-foreground mt-0.5">{sub.notes}</p>}
                </div>
                <DayPickerPopover tripDays={tripDays} onSelect={makeAddHandler("activity", sub.name, sub.notes)} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
