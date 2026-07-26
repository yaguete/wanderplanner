"use client"

import { useId, useEffect, useState, useRef } from "react"
import type { DateRange } from "react-day-picker"
import { es } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
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
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { daysBetweenInclusive, formatTripDates, toISODate } from "@/lib/trip-dates"

export type NewTripData = {
  name: string
  /** Siguen existiendo en el modelo por compatibilidad; en la UI ya no se pide a la creación. */
  countries: string[]
  startDate: string | null
  endDate: string | null
  numDays: number | null
}

type NewTripDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (data: NewTripData) => void
}

export function NewTripDialog({ open, onOpenChange, onCreate }: NewTripDialogProps) {
  const id = useId()
  const [name, setName] = useState("")
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [datePopOpen, setDatePopOpen] = useState(false)
  const [numDays, setNumDays] = useState("")
  const numDaysTouchedRef = useRef(false)

  const nameId = `${id}-name`
  const datesId = `${id}-dates`
  const daysId = `${id}-days`

  useEffect(() => {
    if (open) {
      setName("")
      setDateRange(undefined)
      setDatePopOpen(false)
      setNumDays("")
      numDaysTouchedRef.current = false
    }
  }, [open])

  useEffect(() => {
    if (!dateRange?.from || !dateRange.to) return
    if (numDaysTouchedRef.current) return
    const s = toISODate(dateRange.from)
    const e = toISODate(dateRange.to)
    const n = daysBetweenInclusive(s, e)
    if (n != null) setNumDays(String(n))
  }, [dateRange])

  const canSubmit = name.trim().length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    let start: string | null = null
    let end: string | null = null
    if (dateRange?.from && dateRange.to) {
      start = toISODate(dateRange.from)
      end = toISODate(dateRange.to)
    }
    const n = numDays.trim() ? parseInt(numDays, 10) : null
    onCreate({
      name: name.trim(),
      countries: [],
      startDate: start,
      endDate: end,
      numDays: n != null && !Number.isNaN(n) && n > 0 ? n : null,
    })
  }

  const rangeLabel =
    dateRange?.from && dateRange.to
      ? formatTripDates(toISODate(dateRange.from), toISODate(dateRange.to))
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">Nuevo viaje</DialogTitle>
          <DialogDescription>
            Crea un proyecto para consolidar fuentes de blogueros y revistas. El destino concreto irá
            emergiendo de los artículos que incorpores.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={nameId}>Nombre del viaje</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="p. ej. Semana santa 2026 · Alpujarra"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Sirve de pista para portada y mapa hasta que tengas fuentes con región.</p>
          </div>
          <div className="space-y-2">
            <Label id={datesId}>¿Cuándo te gustaría ir? (opcional)</Label>
            <Popover open={datePopOpen} onOpenChange={setDatePopOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn("h-9 w-full justify-start text-left font-normal", !rangeLabel && "text-muted-foreground")}
                  id={datesId}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  {rangeLabel ?? "Selecciona un rango aproximado"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  locale={es}
                  className="p-2"
                />
                <div className="flex justify-end border-t p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDateRange(undefined)
                    }}
                  >
                    Limpiar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">Periodo aproximado, no tiene que coincidir con el número de días del viaje.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={daysId}>¿Cuántos días te gustaría estar de viaje? (opcional)</Label>
            <Input
              id={daysId}
              type="number"
              min={1}
              value={numDays}
              onChange={(e) => {
                numDaysTouchedRef.current = true
                setNumDays(e.target.value)
              }}
              placeholder="5"
            />
            <p className="text-xs text-muted-foreground">
              Define cuántos días se abren en el itinerario; al elegir un rango de fechas, se sugiere aquí si aún no lo has
              escrito tú.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
