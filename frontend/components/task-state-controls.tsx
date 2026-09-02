"use client"

import { Check, ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const chipClass = (active: boolean) =>
  cn(
    "inline-flex min-h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "bg-background font-semibold text-foreground shadow-sm ring-1 ring-border"
      : "font-medium text-muted-foreground hover:text-foreground",
  )

/** Toggle unido Reservado | Pagado. Pulsar el activo lo deja sin tocar (`null`). */
export function BookingStatusToggle({
  value,
  onChange,
}: {
  value: "pending" | "booked" | "paid" | "notNeeded" | null
  onChange: (next: "booked" | "paid" | null) => void
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5"
      role="group"
      aria-label="Estado de reserva"
    >
      <button
        type="button"
        aria-pressed={value === "booked"}
        onClick={() => onChange(value === "booked" ? null : "booked")}
        className={chipClass(value === "booked")}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            value === "booked" ? "bg-muted-foreground" : "bg-muted-foreground/30",
          )}
          aria-hidden
        />
        Reservado
      </button>
      <button
        type="button"
        aria-pressed={value === "paid"}
        onClick={() => onChange(value === "paid" ? null : "paid")}
        className={chipClass(value === "paid")}
      >
        {value === "paid" ? (
          <Check className="h-3 w-3 shrink-0 text-success" strokeWidth={2.4} aria-hidden />
        ) : (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden />
        )}
        Pagado
      </button>
    </div>
  )
}

export function CancellableDropdown({
  value,
  onChange,
}: {
  value: boolean | null
  onChange: (next: boolean | null) => void
}) {
  const radioValue = value === true ? "yes" : value === false ? "no" : "unset"
  const triggerLabel =
    value === true ? "Cancelable" : value === false ? "No cancelable" : "Cancelabilidad"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors",
            "text-muted-foreground hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value != null && "text-foreground",
          )}
          aria-label="Cancelabilidad"
        >
          {triggerLabel}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10.5rem]">
        <DropdownMenuRadioGroup
          value={radioValue}
          onValueChange={(v) => {
            if (v === "yes") onChange(true)
            else if (v === "no") onChange(false)
            else onChange(null)
          }}
        >
          <DropdownMenuRadioItem value="yes" className="text-xs">
            Cancelable
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="no" className="text-xs">
            No cancelable
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="unset" className="text-xs">
            Sin indicar
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ReservationNeededChips({
  value,
  onChange,
}: {
  value: boolean | null
  onChange: (next: boolean | null) => void
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5"
      role="group"
      aria-label="¿Hay que reservar?"
    >
      <button
        type="button"
        aria-pressed={value === true}
        onClick={() => onChange(value === true ? null : true)}
        className={chipClass(value === true)}
      >
        Hay que reservar
      </button>
      <button
        type="button"
        aria-pressed={value === false}
        onClick={() => onChange(value === false ? null : false)}
        className={chipClass(value === false)}
      >
        No hace falta
      </button>
    </div>
  )
}

/** Reservado | No reservado. Siempre hay uno marcado mientras el grupo está visible. */
export function BookedOrNotChips({
  booked,
  onChange,
}: {
  booked: boolean
  onChange: (booked: boolean) => void
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5"
      role="group"
      aria-label="¿Ya está reservado?"
    >
      <button
        type="button"
        aria-pressed={booked}
        onClick={() => onChange(true)}
        className={chipClass(booked)}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            booked ? "bg-muted-foreground" : "bg-muted-foreground/30",
          )}
          aria-hidden
        />
        Reservado
      </button>
      <button
        type="button"
        aria-pressed={!booked}
        onClick={() => onChange(false)}
        className={chipClass(!booked)}
      >
        No reservado
      </button>
    </div>
  )
}
