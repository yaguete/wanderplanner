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
import { Textarea } from "@/components/ui/textarea"
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
  expectations: string | null
}

export type TripFormInitial = {
  name: string
  startDate: string | null
  endDate: string | null
  numDays: number | null
  expectations: string | null
}

function parseLocalYMD(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

type NewTripDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: "create" | "edit"
  /** Valores iniciales en modo edición. */
  initial?: TripFormInitial | null
  /**
   * Días reales del itinerario (`trip.days.length`).
   * Si el usuario pide menos, se muestra error y no se guarda.
   */
  itineraryDayCount?: number
  /** Devuelve `{ error }` para mantener el diálogo abierto con el mensaje. */
  onSubmit: (data: NewTripData) => void | { error: string }
}

export function NewTripDialog({
  open,
  onOpenChange,
  mode = "create",
  initial = null,
  itineraryDayCount,
  onSubmit,
}: NewTripDialogProps) {
  const id = useId()
  const [name, setName] = useState("")
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [datePopOpen, setDatePopOpen] = useState(false)
  const [numDays, setNumDays] = useState("")
  const [expectations, setExpectations] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const numDaysTouchedRef = useRef(false)

  const nameId = `${id}-name`
  const datesId = `${id}-dates`
  const daysId = `${id}-days`
  const expectationsId = `${id}-expectations`
  const isEdit = mode === "edit"

  useEffect(() => {
    if (!open) return
    setFormError(null)
    setDatePopOpen(false)

    if (isEdit && initial) {
      setName(initial.name)
      setNumDays(initial.numDays != null ? String(initial.numDays) : "")
      setExpectations(initial.expectations ?? "")
      numDaysTouchedRef.current = true
      if (initial.startDate && initial.endDate) {
        setDateRange({
          from: parseLocalYMD(initial.startDate),
          to: parseLocalYMD(initial.endDate),
        })
      } else {
        setDateRange(undefined)
      }
    } else {
      setName("")
      setDateRange(undefined)
      setNumDays("")
      setExpectations("")
      numDaysTouchedRef.current = false
    }
    // Solo al abrir: evita pisar ediciones si `initial` cambia de identidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open
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
    setFormError(null)

    let start: string | null = null
    let end: string | null = null
    if (dateRange?.from && dateRange.to) {
      start = toISODate(dateRange.from)
      end = toISODate(dateRange.to)
    }
    const n = numDays.trim() ? parseInt(numDays, 10) : null
    const resolvedDays = n != null && !Number.isNaN(n) && n > 0 ? n : null

    if (
      isEdit &&
      resolvedDays != null &&
      itineraryDayCount != null &&
      resolvedDays < itineraryDayCount
    ) {
      const excess = itineraryDayCount - resolvedDays
      setFormError(
        `Tu itinerario tiene ${itineraryDayCount} días. Elimina ${excess} día${excess === 1 ? "" : "s"} desde el panel del viaje antes de reducir el número aquí.`,
      )
      return
    }

    const result = onSubmit({
      name: name.trim(),
      countries: [],
      startDate: start,
      endDate: end,
      numDays: resolvedDays,
      expectations: expectations.trim() ? expectations.trim() : null,
    })
    if (result && "error" in result) {
      setFormError(result.error)
    }
  }

  const rangeLabel =
    dateRange?.from && dateRange.to
      ? formatTripDates(toISODate(dateRange.from), toISODate(dateRange.to))
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {isEdit ? "Editar viaje" : "Nuevo viaje"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Actualiza el nombre, las fechas, los días o qué esperas del viaje."
              : "Crea un proyecto para consolidar fuentes de blogueros y revistas. El destino concreto irá emergiendo de los artículos que incorpores."}
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
            <p className="text-xs text-muted-foreground">
              Sirve de pista para portada y mapa hasta que tengas fuentes con región.
            </p>
          </div>
          <div className="space-y-2">
            <Label id={datesId}>¿Cuándo te gustaría ir?</Label>
            <Popover open={datePopOpen} onOpenChange={setDatePopOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-9 w-full justify-start text-left font-normal",
                    !rangeLabel && "text-muted-foreground",
                  )}
                  id={datesId}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  {rangeLabel ?? "Selecciona un rango aproximado (opcional)"}
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
                <div className="flex justify-end gap-2 border-t p-2">
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDatePopOpen(false)}
                  >
                    Aceptar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Periodo aproximado, no tiene que coincidir con el número de días del viaje.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={daysId}>¿Cuántos días te gustaría estar de viaje?</Label>
            <Input
              id={daysId}
              type="number"
              min={1}
              value={numDays}
              onChange={(e) => {
                numDaysTouchedRef.current = true
                setFormError(null)
                setNumDays(e.target.value)
              }}
              placeholder="5"
            />
            <p className="text-xs text-muted-foreground">
              {isEdit
                ? "Si reduces este número por debajo de los días que ya tienes en el itinerario, deberás borrar días ahí primero."
                : "Define cuántos días se abren en el itinerario; al elegir un rango de fechas, se sugiere aquí si aún no lo has escrito tú."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={expectationsId}>¿Qué esperas de este viaje?</Label>
            <Textarea
              id={expectationsId}
              value={expectations}
              onChange={(e) => setExpectations(e.target.value)}
              placeholder="Ver animales, disfrutar de la familia, plan de descanso, etc."
              rows={3}
              className="min-h-[80px] resize-y text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Ayuda al asistente a afinar recomendaciones según tus prioridades.
            </p>
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {isEdit ? "Guardar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
