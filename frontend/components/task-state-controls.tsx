"use client"

import { Check } from "lucide-react"
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

export function CancellableChips({
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
      aria-label="Cancelabilidad"
    >
      <button
        type="button"
        aria-pressed={value === true}
        onClick={() => onChange(value === true ? null : true)}
        className={chipClass(value === true)}
      >
        Cancelable
      </button>
      <button
        type="button"
        aria-pressed={value === false}
        onClick={() => onChange(value === false ? null : false)}
        className={chipClass(value === false)}
      >
        No cancelable
      </button>
    </div>
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
