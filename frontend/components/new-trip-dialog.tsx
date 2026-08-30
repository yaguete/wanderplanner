"use client"

import { useEffect, useId, useRef, useState } from "react"
import { es } from "date-fns/locale"
import { CalendarIcon, Loader2, MapPin } from "lucide-react"
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
import { isMobileViewport } from "@/hooks/use-mobile"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  endDateFromStartAndNumDays,
  formatDayDate,
  formatTripDates,
  toISODate,
} from "@/lib/trip-dates"
import {
  geocodeFreeText,
  resolvePermanentCoords,
  seedGeocodeCache,
  suggestPlaces,
  type GeocodeSuggestion,
} from "@/lib/mapbox"
import { decideOriginOnSubmit } from "@/lib/trip-origin-resolve"
import type { TripOrigin } from "@/types/itinerary"

const SUGGEST_DEBOUNCE_MS = 300
const SUGGEST_MIN_CHARS = 3

const COMMON_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "MXN", "ARS", "BRL"] as const

export type NewTripData = {
  name: string
  /** Siguen existiendo en el modelo por compatibilidad; en la UI ya no se pide a la creación. */
  countries: string[]
  startDate: string | null
  endDate: string | null
  numDays: number | null
  expectations: string | null
  origin: TripOrigin | null
  numTravelers: number | null
  currency?: string
}

export type TripFormInitial = {
  name: string
  startDate: string | null
  endDate: string | null
  numDays: number | null
  expectations: string | null
  origin: TripOrigin | null
  numTravelers: number | null
  currency: string
}

function parseLocalYMD(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function parseTravelers(raw: string): number | null {
  const n = raw.trim() ? parseInt(raw, 10) : null
  return n != null && !Number.isNaN(n) && n >= 1 ? Math.floor(n) : null
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
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [datePopOpen, setDatePopOpen] = useState(false)
  const [numDays, setNumDays] = useState("")
  const [expectations, setExpectations] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [originError, setOriginError] = useState<string | null>(null)
  const [numTravelers, setNumTravelers] = useState("")
  const [currency, setCurrency] = useState("EUR")

  const [originQuery, setOriginQuery] = useState("")
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [selectedOrigin, setSelectedOrigin] = useState<TripOrigin | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestionsRef = useRef<GeocodeSuggestion[]>([])

  const nameId = `${id}-name`
  const datesId = `${id}-dates`
  const daysId = `${id}-days`
  const originId = `${id}-origin`
  const travelersId = `${id}-travelers`
  const currencyId = `${id}-currency`
  const expectationsId = `${id}-expectations`
  const isEdit = mode === "edit"

  useEffect(() => {
    suggestionsRef.current = suggestions
  }, [suggestions])

  useEffect(() => {
    if (!open) return
    setFormError(null)
    setOriginError(null)
    setDatePopOpen(false)
    setSuggestions([])
    setListOpen(false)
    setSuggestLoading(false)
    setSubmitting(false)

    if (isEdit && initial) {
      setName(initial.name)
      setNumDays(initial.numDays != null ? String(initial.numDays) : "")
      setExpectations(initial.expectations ?? "")
      setStartDate(initial.startDate ? parseLocalYMD(initial.startDate) : undefined)
      setNumTravelers(initial.numTravelers != null ? String(initial.numTravelers) : "")
      setCurrency(initial.currency?.trim() ? initial.currency.trim().toUpperCase() : "EUR")
      const origin = initial.origin
      setSelectedOrigin(origin)
      setOriginQuery(origin?.label ?? "")
    } else {
      setName("")
      setStartDate(undefined)
      setNumDays("")
      setExpectations("")
      setNumTravelers("")
      setCurrency("EUR")
      setSelectedOrigin(null)
      setOriginQuery("")
    }
    // Solo al abrir: evita pisar ediciones si `initial` cambia de identidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open
  }, [open])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()

    const q = originQuery.trim()
    if (selectedOrigin && q === selectedOrigin.label) {
      setSuggestions([])
      setSuggestLoading(false)
      return
    }
    if (q.length < SUGGEST_MIN_CHARS) {
      setSuggestions([])
      setSuggestLoading(false)
      return
    }

    setSuggestLoading(true)
    debounceRef.current = setTimeout(() => {
      const ac = new AbortController()
      abortRef.current = ac
      // No filtrar por trip.countries: el origen suele ser distinto del destino.
      void suggestPlaces(q, {
        limit: 6,
        signal: ac.signal,
      })
        .then((list) => {
          if (ac.signal.aborted) return
          setSuggestions(list)
          setListOpen(true)
          setSuggestLoading(false)
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return
          if (err instanceof DOMException && err.name === "AbortError") return
          setSuggestions([])
          setSuggestLoading(false)
        })
    }, SUGGEST_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [originQuery, open, selectedOrigin])

  const canSubmit = name.trim().length > 0 && !submitting

  const parsedDays = (() => {
    const n = numDays.trim() ? parseInt(numDays, 10) : null
    return n != null && !Number.isNaN(n) && n > 0 ? n : null
  })()

  const startISO = startDate ? toISODate(startDate) : null
  const derivedEnd =
    startISO && parsedDays != null
      ? endDateFromStartAndNumDays(startISO, parsedDays)
      : null
  const rangeLabel =
    startISO && derivedEnd ? formatTripDates(startISO, derivedEnd) : null

  const currencyOptions = (() => {
    const base = [...COMMON_CURRENCIES]
    const current = currency.trim().toUpperCase()
    if (current && !base.includes(current as (typeof COMMON_CURRENCIES)[number])) {
      return [current, ...base]
    }
    return base
  })()

  const handleSelectSuggestion = (s: GeocodeSuggestion) => {
    const origin: TripOrigin = {
      label: s.text,
      countryCode: s.countryCode,
      coords: s.center,
    }
    setSelectedOrigin(origin)
    setOriginQuery(s.text)
    setSuggestions([])
    setListOpen(false)
    setOriginError(null)
    seedGeocodeCache(s.placeName, s.center)
    // `s.center` es del dataset temporal y `trip.origin` se persiste: pedimos la
    // permanente por detrás. Si no llega, se guarda la temporal como siempre.
    void resolvePermanentCoords(s.placeName, s.center).then((coords) => {
      if (coords === s.center) return
      setSelectedOrigin((prev) => (prev?.label === s.text ? { ...prev, coords } : prev))
    })
  }

  const handleOriginChange = (value: string) => {
    setOriginQuery(value)
    setSelectedOrigin(null)
    setListOpen(true)
    setOriginError(null)
  }

  const tryAutoselectOnBlur = () => {
    window.setTimeout(() => {
      setListOpen(false)
      if (selectedOrigin) return
      const q = originQuery.trim()
      if (!q) return
      const list = suggestionsRef.current
      if (list.length === 0) return
      const first = list[0]!
      // En blur el match por prefijo es visible: el campo se actualiza a la vista.
      if (
        first.text.toLowerCase() === q.toLowerCase() ||
        first.placeName.toLowerCase().startsWith(q.toLowerCase())
      ) {
        handleSelectSuggestion(first)
      }
    }, 150)
  }

  const resolveOriginForSubmit = async (): Promise<
    | { ok: true; origin: TripOrigin | null }
    | { ok: false; error: string; allowSkip: boolean }
  > => {
    const q = originQuery.trim()
    if (!q) return { ok: true, origin: null }

    // Si ya hay selección confirmada con el texto actual, no hace falta geocode.
    if (selectedOrigin && selectedOrigin.label === q) {
      return { ok: true, origin: selectedOrigin }
    }

    const suggestions = suggestionsRef.current
    // Solo llamar a geocode si no hay candidatos visibles (cascada 2).
    const geocodeCoords =
      suggestions.length === 0 ? await geocodeFreeText(q) : null

    const decision = decideOriginOnSubmit({
      query: q,
      selected: selectedOrigin,
      suggestions,
      geocodeCoords,
    })

    switch (decision.kind) {
      case "empty":
        return { ok: true, origin: null }
      case "confirmed":
        setSelectedOrigin(decision.origin)
        setOriginQuery(decision.origin.label)
        return { ok: true, origin: decision.origin }
      case "needs_confirm":
        setSelectedOrigin(decision.origin)
        setOriginQuery(decision.displayLabel)
        if (decision.placeNameForCache) {
          seedGeocodeCache(decision.placeNameForCache, decision.origin.coords)
        }
        return {
          ok: false,
          error: `Origen propuesto: «${decision.displayLabel}». Confírmalo pulsando Crear de nuevo, elige otra opción del desplegable, o continúa sin origen.`,
          allowSkip: true,
        }
      case "unresolved":
        return {
          ok: false,
          error:
            "No encontramos ese lugar. Elige una opción del desplegable o continúa sin origen.",
          allowSkip: true,
        }
    }
  }

  const buildPayload = (origin: TripOrigin | null): NewTripData => {
    const start = startISO
    const end =
      start && parsedDays != null
        ? endDateFromStartAndNumDays(start, parsedDays)
        : null

    return {
      name: name.trim(),
      countries: [],
      startDate: start,
      endDate: end,
      numDays: parsedDays,
      expectations: expectations.trim() ? expectations.trim() : null,
      origin,
      numTravelers: parseTravelers(numTravelers),
      currency,
    }
  }

  const handleSubmit = async (opts?: { skipOrigin?: boolean }) => {
    if (!canSubmit) return
    setFormError(null)
    setOriginError(null)

    const resolvedDays = parsedDays

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

    setSubmitting(true)
    try {
      let origin: TripOrigin | null = null
      if (opts?.skipOrigin) {
        setOriginQuery("")
        setSelectedOrigin(null)
        origin = null
      } else {
        const resolved = await resolveOriginForSubmit()
        if (!resolved.ok) {
          setOriginError(resolved.error)
          return
        }
        origin = resolved.origin
      }

      const result = onSubmit(buildPayload(origin))
      if (result && "error" in result) {
        setFormError(result.error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullscreenOnMobile
        hideClose
        className="sm:max-h-[min(90vh,40rem)] sm:max-w-lg"
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-10 pt-6">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {isEdit ? "Editar viaje" : "Nuevo viaje"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Actualiza el nombre, el origen, las fechas, los días o qué esperas del viaje. Podrás cambiar esta información en cualquier momento."
                : "Crea un viaje y consolida las fuentes de blogueros y revistas. No hace falta que nos digas el destino: irá emergiendo de los artículos y referencias que incorpores."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={nameId}>Nombre del viaje</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="p. ej. Semana santa 2026 · Alpujarra"
              autoFocus={!isMobileViewport()}
            />
            <p className="text-xs text-muted-foreground">
              Pon el nombre que quieras que aparezca en la portada.
            </p>
          </div>

          <div className="relative space-y-2">
            <Label htmlFor={originId}>¿Desde dónde viajas?</Label>
            <div className="relative">
              <MapPin
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id={originId}
                value={originQuery}
                onChange={(e) => handleOriginChange(e.target.value)}
                onFocus={() => {
                  if (suggestions.length > 0) setListOpen(true)
                }}
                onBlur={tryAutoselectOnBlur}
                placeholder="p. ej. Lugo, España"
                className="pl-8"
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={listOpen && suggestions.length > 0}
              />
              {suggestLoading ? (
                <Loader2
                  className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
                  aria-hidden
                />
              ) : null}
            </div>
            {listOpen && suggestions.length > 0 ? (
              <ul
                className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
                role="listbox"
              >
                {suggestions.map((s) => (
                  <li key={s.id} role="option">
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectSuggestion(s)}
                    >
                      <span className="font-medium text-foreground">{s.text}</span>
                      {s.placeName !== s.text ? (
                        <span className="line-clamp-1 text-xs text-muted-foreground">
                          {s.placeName}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {originError ? (
              <div className="space-y-1.5" role="alert">
                <p className="text-sm text-destructive">{originError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSubmit({ skipOrigin: true })}
                >
                  Continuar sin origen
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Introduce un punto de partida o elige una opción del desplegable (opcional).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={travelersId}>¿Cuántas personas viajáis?</Label>
            <Input
              id={travelersId}
              type="number"
              min={1}
              value={numTravelers}
              onChange={(e) => setNumTravelers(e.target.value)}
              placeholder="Introduce un número"
            />
            <p className="text-xs text-muted-foreground">
              Si lo indicas calcularemos el coste por persona en las tareas del viaje.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={daysId}>¿Cuántos días vas a estar de viaje?</Label>
            <Input
              id={daysId}
              type="number"
              min={1}
              value={numDays}
              onChange={(e) => {
                setFormError(null)
                setNumDays(e.target.value)
              }}
              placeholder="Introduce un número"
            />
            <p className="text-xs text-muted-foreground">
              Son el número de días que con el que iniciaremos tu panel de viaje (podrás quitar o añadir días en cualquier momento).
            </p>
          </div>
          <div className="space-y-2 [overflow-anchor:none]">
            <Label id={datesId}>¿Qué día te gustaría empezar tu viaje?</Label>
            <Popover open={datePopOpen} onOpenChange={setDatePopOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-9 w-full justify-start text-left font-normal",
                    !rangeLabel && !startDate && "text-muted-foreground",
                  )}
                  id={datesId}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  {rangeLabel
                    ? rangeLabel
                    : startDate
                      ? formatDayDate(toISODate(startDate)) ?? toISODate(startDate)
                      : "Selecciona la fecha de inicio"}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0"
                align="start"
                side="bottom"
                sticky="always"
              >
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  numberOfMonths={1}
                  locale={es}
                  className="p-2"
                />
                <div className="flex justify-end gap-2 border-t p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStartDate(undefined)
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
            Si también has indicado el número de días, podremos calcular las fechas de tu viaje (podrás cambiarlo en cualquier momento). Esta información nos permitirá hacerte sugerencias y recomendaciones mucho más precisas.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={expectationsId}>¿Qué esperas de este viaje?</Label>
            <Textarea
              id={expectationsId}
              value={expectations}
              onChange={(e) => setExpectations(e.target.value)}
              placeholder="p. ej. Ver animales, disfrutar de la familia, plan de descanso, etc."
              rows={3}
              className="min-h-[80px] resize-y text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Afinaremos las recomendaciones e información que te proporcionaremos, según tus prioridades.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={currencyId}>Divisa del viaje</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id={currencyId} className="w-full">
                <SelectValue placeholder="EUR" />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Elige la divisa en la que quieres que se muestren los costes de tu viaje.
              Cambiarla no convierte importes ni el techo ya apuntados.
            </p>
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
        </div>
        <DialogFooter className="shrink-0 bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                {isEdit ? "Guardando…" : "Creando…"}
              </>
            ) : isEdit ? (
              "Guardar"
            ) : (
              "Crear viaje"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
