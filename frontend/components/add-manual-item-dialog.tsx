"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Loader2, MapPin } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { isMobileViewport } from "@/hooks/use-mobile"
import { ITEM_LABELS, ITEM_TYPE_ICONS } from "@/lib/item-styles"
import { isSyntheticSourceId, MANUAL_SOURCE_ID } from "@/lib/item-provenance"
import {
  geocodeFreeText,
  resolvePermanentCoords,
  seedGeocodeCache,
  suggestPlaces,
  type GeocodeSuggestion,
  type LngLat,
} from "@/lib/mapbox"
import type {
  ItemType,
  RouteMode,
  TransportRoute,
  TripTaskState,
  UserDay,
  UserDayItem,
} from "@/types/itinerary"
import { formatDayPickerLabel } from "@/lib/day-heading"
import { dateISOForDayIndex, formatDayDateShort } from "@/lib/trip-dates"
import {
  emptyEndpoint,
  TransportRouteForm,
  type TransportRouteFormValue,
} from "@/components/transport-route-form"
import {
  hasFiniteLngLat,
  itemTakesCalendarSpan,
  parseSpanDays,
  spanDaysForWrite,
} from "@/lib/item-span"
import { stayDiscoveryHrefs } from "@/lib/stay-discovery"
import { bookingOmitsStayDates } from "@/lib/booking-dates"
import { activityDiscoveryHrefs } from "@/lib/activity-search"
import { taskPatchFromManualDraft, type ManualTaskDraft } from "@/lib/manual-item-task"
import { PartnerSearchLink } from "@/components/partner-search-link"
import { ManualFlightSearch } from "@/components/manual-flight-search"
import {
  draftFromTaskState,
  emptyManualTaskDraft,
  ManualItemTaskFields,
} from "@/components/manual-item-task-fields"

const ITEM_TYPES: ItemType[] = ["activity", "stay", "food", "transport"]

const NAME_PLACEHOLDERS: Record<ItemType, string> = {
  activity: "p. ej. Crucero por el Danubio",
  stay: "p. ej. Hostel One Budapest",
  food: "p. ej. Restaurante Casa Paco",
  transport: "p. ej. Tren a Viena",
}

const DAY_FIELD_LABELS: Record<ItemType, string> = {
  activity: "Día / comienzo",
  stay: "Entrada / Check-in",
  food: "Día",
  transport: "Día",
}

const SUGGEST_DEBOUNCE_MS = 300
const SUGGEST_MIN_CHARS = 3

export type AddManualItemDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  days: UserDay[]
  /** Día preseleccionado al abrir (p. ej. desde empty state). */
  initialDayId?: string | null
  /** Tipo preseleccionado (p. ej. desde pestaña Actividades / Alojamientos). */
  initialType?: ItemType | null
  countryCodes?: string[]
  /** Texto libre del destino del viaje para proximity / bias. */
  destinationHint?: string | null
  /** Fecha de inicio del viaje; sin ella el selector no muestra el paréntesis. */
  startDate?: string | null
  numTravelers?: number | null
  currency?: string
  existingTask?: TripTaskState | null
  onSubmit: (
    item: UserDayItem,
    dayId: string,
    taskPatch?: Partial<TripTaskState> | null,
  ) => void
  /** Alta de traslado desde el mismo diálogo (el tipo sigue visible). */
  onSubmitTransport?: (data: {
    dayId: string
    route: Omit<TransportRoute, "leg"> & {
      from: TransportRoute["from"]
      to: TransportRoute["to"]
    }
    detail: string | null
    vendor: string | null
    taskPatch?: Partial<TripTaskState> | null
  }) => void
  /** Si está, el formulario edita este ítem (conserva id y procedencia). */
  existingItem?: UserDayItem | null
  existingDayId?: string | null
}

export function AddManualItemDialog({
  open,
  onOpenChange,
  days,
  initialDayId = null,
  initialType = null,
  countryCodes = [],
  destinationHint = null,
  startDate = null,
  numTravelers = null,
  currency = "EUR",
  existingTask = null,
  onSubmit,
  onSubmitTransport,
  existingItem = null,
  existingDayId = null,
}: AddManualItemDialogProps) {
  const id = useId()
  const [type, setType] = useState<ItemType>("activity")
  const [name, setName] = useState("")
  const [dayId, setDayId] = useState("")
  const [detail, setDetail] = useState("")
  const [placeQuery, setPlaceQuery] = useState("")
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<{
    label: string
    coords: LngLat
  } | null>(null)
  const [listOpen, setListOpen] = useState(false)
  /** El autocompletado solo busca si el usuario ha tocado el campo. */
  const [placeFieldActive, setPlaceFieldActive] = useState(false)
  const [nights, setNights] = useState(1)
  const [transportCanSubmit, setTransportCanSubmit] = useState(false)
  const [taskDraft, setTaskDraft] = useState<ManualTaskDraft>(emptyManualTaskDraft)
  const [liveTransportMode, setLiveTransportMode] = useState<RouteMode | null>(null)

  const proximityRef = useRef<[number, number] | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const placeBlurRef = useRef<number | null>(null)
  const costRef = useRef<number | null>(null)

  const nameId = `${id}-name`
  const dayFieldId = `${id}-day`
  const placeId = `${id}-place`
  const detailId = `${id}-detail`
  const nightsId = `${id}-nights`
  const transportFormId = `${id}-transport`

  const selectedDayIndex = Math.max(0, days.findIndex((d) => d.id === dayId))
  const maxNights = Math.max(1, days.length - selectedDayIndex)
  const editing = existingItem != null
  const addingTransport = type === "transport" && !editing
  const durationKind = itemTakesCalendarSpan(type)
  const showDiscovery =
    !existingItem || isSyntheticSourceId(existingItem.sourceId)

  useEffect(() => {
    if (!open) return
    const seed = existingItem
    setType(seed?.type ?? initialType ?? "activity")
    setName(seed?.name ?? "")
    setDetail(seed?.detail?.trim() ?? "")
    setPlaceQuery(seed?.region?.trim() ?? "")
    setSuggestions([])
    setSelectedPlace(
      seed && hasFiniteLngLat(seed.coords)
        ? {
            label: seed.region?.trim() || seed.name,
            coords: seed.coords,
          }
        : null,
    )
    setListOpen(false)
    setPlaceFieldActive(false)
    setSuggestLoading(false)
    if (placeBlurRef.current != null) {
      window.clearTimeout(placeBlurRef.current)
      placeBlurRef.current = null
    }
    setNights(parseSpanDays(seed?.spanDays) ?? 1)
    setTransportCanSubmit(false)
    setLiveTransportMode(null)
    const seededDraft = draftFromTaskState(existingTask)
    setTaskDraft(seededDraft)
    costRef.current = seededDraft.cost
    const preferred =
      (seed && existingDayId && days.some((d) => d.id === existingDayId) && existingDayId) ||
      (initialDayId && days.some((d) => d.id === initialDayId) && initialDayId) ||
      days[0]?.id ||
      ""
    setDayId(preferred)

    proximityRef.current = null
    const dest = destinationHint?.trim()
    const codes = countryCodes.filter((c) => c.trim().length === 2)
    if (dest) {
      void geocodeFreeText(dest, { countryCodes: codes.length ? codes : undefined }).then((p) => {
        proximityRef.current = p
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open
  }, [open])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()

    if (!placeFieldActive) {
      setSuggestLoading(false)
      return
    }

    const q = placeQuery.trim()
    if (selectedPlace && q === selectedPlace.label) {
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
      const codes = countryCodes.filter((c) => c.trim().length === 2)
      void suggestPlaces(q, {
        proximity: proximityRef.current,
        countryCodes: codes.length ? codes : undefined,
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
  }, [placeQuery, open, countryCodes, selectedPlace, placeFieldActive])

  useEffect(() => {
    if (!durationKind) return
    setNights((n) => Math.min(Math.max(1, n), maxNights))
  }, [durationKind, maxNights])

  const canSubmit = name.trim().length > 0 && dayId.length > 0 && days.some((d) => d.id === dayId)

  const handleSelectSuggestion = (s: GeocodeSuggestion) => {
    setSelectedPlace({ label: s.text, coords: s.center })
    setPlaceQuery(s.text)
    setSuggestions([])
    setListOpen(false)
    seedGeocodeCache(s.placeName, s.center, countryCodes)
    // `s.center` es del dataset temporal y no se puede guardar. Pedimos la
    // permanente por detrás; si no llega, se guarda la temporal como siempre.
    void resolvePermanentCoords(s.placeName, s.center, { countryCodes }).then((coords) => {
      if (coords === s.center) return
      setSelectedPlace((prev) => (prev?.label === s.text ? { ...prev, coords } : prev))
    })
  }

  const handlePlaceChange = (value: string) => {
    setPlaceFieldActive(true)
    setPlaceQuery(value)
    setSelectedPlace(null)
    setListOpen(true)
  }

  const currentTaskPatch = (persistEmpty: boolean) =>
    taskPatchFromManualDraft(
      { ...taskDraft, cost: costRef.current },
      persistEmpty ? { includeCleared: true } : undefined,
    )

  const handleSubmit = () => {
    if (!canSubmit) return
    const item: UserDayItem = existingItem
      ? {
          ...existingItem,
          name: name.trim(),
          detail: detail.trim() ? detail.trim() : null,
          region: selectedPlace?.label ?? (placeQuery.trim() || null),
          coords: selectedPlace?.coords ?? null,
        }
      : {
          id: crypto.randomUUID(),
          sourceItemId: `manual-${crypto.randomUUID()}`,
          sourceId: MANUAL_SOURCE_ID,
          type,
          name: name.trim(),
          detail: detail.trim() ? detail.trim() : null,
          sourceAuthor: "Tú",
          region: selectedPlace?.label ?? (placeQuery.trim() || null),
          coords: selectedPlace?.coords ?? null,
        }
    if (itemTakesCalendarSpan(item.type)) {
      const span = spanDaysForWrite(nights, selectedDayIndex, days.length)
      if (span != null) item.spanDays = span
      else delete item.spanDays
    } else {
      delete item.spanDays
    }
    onSubmit(item, dayId, currentTaskPatch(existingTask != null))
    onOpenChange(false)
  }

  const handleTransportSubmit = (value: TransportRouteFormValue) => {
    if (!dayId || !onSubmitTransport) return
    onSubmitTransport({
      dayId,
      route: {
        from: value.from,
        to: value.to,
        mode: value.mode,
      },
      detail: value.detail,
      vendor: value.vendor,
      taskPatch: currentTaskPatch(false),
    })
    onOpenChange(false)
  }

  const title = editing
    ? `Editar ${ITEM_LABELS[type].toLowerCase()}`
    : type === "stay"
      ? "Añadir alojamiento"
      : type === "activity"
        ? "Añadir actividad"
        : type === "food"
          ? "Añadir restaurante"
          : type === "transport"
            ? "Añadir traslado"
            : "Añadir ítem"

  const stayDestination = selectedPlace?.label?.trim() || placeQuery.trim() || destinationHint?.trim() || ""
  const stayDayIndexes = Array.from(
    { length: Math.min(nights, maxNights) },
    (_, i) => selectedDayIndex + i,
  )
  const stayHrefs =
    showDiscovery && type === "stay"
      ? stayDiscoveryHrefs({
          destination: stayDestination,
          startDate,
          dayIndexes: stayDayIndexes,
          currency,
          numTravelers: numTravelers ?? 1,
          affiliateUrl: existingItem?.affiliateUrl,
          sourceId: existingItem?.sourceId ?? MANUAL_SOURCE_ID,
        })
      : null
  // Los tres cuelgan del mismo destino: o hay buscadores, o hay pista.
  const hasStayLinks = Boolean(
    stayHrefs && (stayHrefs.booking || stayHrefs.airbnb || stayHrefs.homeExchange),
  )
  const activityHrefs =
    showDiscovery && type === "activity"
      ? activityDiscoveryHrefs({
          sourceId: existingItem?.sourceId ?? MANUAL_SOURCE_ID,
          affiliateUrl: existingItem?.affiliateUrl,
          selectedPlaceLabel: selectedPlace?.label ?? null,
          destinationHint,
          addressHint: placeQuery.trim() || null,
          coords: selectedPlace?.coords ?? null,
          startDate,
          dayIndex: selectedDayIndex,
          spanDays: nights,
          numTravelers: numTravelers ?? 1,
        })
      : null

  const dayField = (
    <div className="space-y-2">
      <Label htmlFor={dayFieldId}>
        {addingTransport ? "Día del traslado" : DAY_FIELD_LABELS[type]}
      </Label>
      <Select value={dayId} onValueChange={setDayId}>
        <SelectTrigger id={dayFieldId} className="w-full">
          <SelectValue placeholder="Elige un día" />
        </SelectTrigger>
        <SelectContent>
          {days.map((day, index) => (
            <SelectItem key={day.id} value={day.id}>
              {formatDayPickerLabel(
                index,
                formatDayDateShort(dateISOForDayIndex(startDate, index)),
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const placeField = (
    <div className="relative space-y-2">
      <Label htmlFor={placeId}>Ciudad o dirección (opcional)</Label>
      <div className="relative">
        <MapPin
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={placeId}
          value={placeQuery}
          onChange={(e) => handlePlaceChange(e.target.value)}
          onFocus={() => {
            if (placeBlurRef.current != null) {
              window.clearTimeout(placeBlurRef.current)
              placeBlurRef.current = null
            }
            setPlaceFieldActive(true)
          }}
          onBlur={() => {
            placeBlurRef.current = window.setTimeout(() => {
              placeBlurRef.current = null
              setListOpen(false)
              setPlaceFieldActive(false)
            }, 150)
          }}
          placeholder={type === "stay" ? "Király utca 15, Budapest" : "p. ej. Budapest"}
          className="pl-8"
          autoComplete="off"
          autoFocus={!isMobileViewport()}
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
      {selectedPlace ? (
        <p className="text-xs text-muted-foreground">
          {type === "stay" || type === "activity"
            ? "Ubicación fijada en el mapa."
            : "Ubicación guardada."}
        </p>
      ) : durationKind && nights >= 2 ? (
        <p className="text-xs text-muted-foreground">
          Sin una dirección concreta no ancla la jornada en el mapa.
        </p>
      ) : null}
    </div>
  )

  const durationField = durationKind ? (
    <div className="space-y-2">
      <Label htmlFor={nightsId}>{type === "stay" ? "Noches" : "Días"}</Label>
      <Input
        id={nightsId}
        type="number"
        inputMode="numeric"
        min={1}
        max={maxNights}
        value={nights}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10)
          if (!Number.isFinite(n)) {
            setNights(1)
            return
          }
          setNights(Math.min(Math.max(1, n), maxNights))
        }}
      />
      <p className="text-xs text-muted-foreground">
        {maxNights === 1
          ? type === "stay"
            ? "El viaje acaba este día: 1 noche."
            : "El viaje acaba este día: 1 día."
          : type === "stay"
            ? `Hasta ${maxNights} desde el día de entrada.`
            : `Hasta ${maxNights} desde el día de inicio. Se muestra esos días en la Ruta.`}
      </p>
    </div>
  ) : null

  const budgetFields = (
    <ManualItemTaskFields
      type={addingTransport ? "transport" : type}
      routeMode={addingTransport ? liveTransportMode : existingItem?.route?.mode}
      currency={currency}
      draft={taskDraft}
      onChange={(next) => {
        costRef.current = next.cost
        setTaskDraft(next)
      }}
    />
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullscreenOnMobile
        hideClose
        className={addingTransport ? "sm:max-w-lg" : "sm:max-w-md"}
      >
        <DialogHeader className="shrink-0 space-y-1.5 px-6 py-4 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {title}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? durationKind
                ? "Cambia el nombre, el día, el lugar o la duración."
                : "Cambia el nombre, el día o el lugar."
              : addingTransport
                ? "Define origen, destino y medio de transporte si lo sabes."
                : "Añade a tu viaje elementos que no encuentras en tus fuentes."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 pb-10">
          {!editing ? (
          <div className="space-y-2">
            <Label>Tipo</Label>
            <div
              className="grid grid-cols-4 gap-1.5"
              role="radiogroup"
              aria-label="Tipo de elemento"
            >
              {ITEM_TYPES.map((t) => {
                const Icon = ITEM_TYPE_ICONS[t]
                const selected = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setType(t)}
                    className={cn(
                      "inline-flex min-w-0 flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-center transition-colors sm:px-2 sm:py-2",
                      selected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="relative flex h-7 w-7 items-center justify-center">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="text-[10px] font-medium leading-tight sm:text-[11px]">{ITEM_LABELS[t]}</span>
                  </button>
                )
              })}
            </div>
          </div>
          ) : null}

          {addingTransport ? (
            <>
              {dayField}
              <TransportRouteForm
                formId={transportFormId}
                initial={{
                  from: emptyEndpoint(),
                  to: emptyEndpoint(),
                  mode: "undecided",
                  vendor: "",
                  detail: "",
                }}
                fromLabel="Origen"
                toLabel="Destino"
                onValidityChange={setTransportCanSubmit}
                onLiveContext={({ mode }) => setLiveTransportMode(mode)}
                onSubmit={handleTransportSubmit}
                renderAfterDestination={({ from, to, mode }) => (
                  <ManualFlightSearch
                    from={from}
                    to={to}
                    mode={mode}
                    trip={{
                      startDate,
                      numDays: days.length,
                      numTravelers: numTravelers ?? 1,
                    }}
                    dayIndex={selectedDayIndex}
                    days={days}
                  />
                )}
              />
              {budgetFields}
            </>
          ) : (
            <>
          {placeField}

          {dayField}

          {durationField}

          {type === "stay" && stayHrefs ? (
            <div className="space-y-1.5">
              {hasStayLinks ? (
                <div className="flex flex-wrap items-center gap-2">
                  <PartnerSearchLink
                    href={stayHrefs.booking}
                    label="Buscar en Booking.com"
                  />
                  <PartnerSearchLink
                    href={stayHrefs.airbnb}
                    label="Buscar en Airbnb"
                    affiliate="none"
                  />
                  <PartnerSearchLink
                    href={stayHrefs.homeExchange}
                    label="Buscar en HomeExchange"
                    affiliate="none"
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Escribe una ciudad para buscar alojamiento.
                </p>
              )}
              {hasStayLinks && bookingOmitsStayDates(startDate, stayDayIndexes) ? (
                <p className="text-[11px] text-muted-foreground">
                  Sin fechas en el viaje, o con el check-in ya pasado, los
                  buscadores abren el destino sin fechas.
                </p>
              ) : null}
            </div>
          ) : null}

          {type === "activity" && showDiscovery ? (
            <div className="flex flex-wrap items-center gap-2">
              <PartnerSearchLink
                href={activityHrefs?.civitatis ?? null}
                label="Buscar en Civitatis"
                disabledHint={
                  activityHrefs?.civitatis
                    ? null
                    : "Elige una ciudad del desplegable para buscar en Civitatis."
                }
              />
              <PartnerSearchLink
                href={activityHrefs?.getYourGuide ?? null}
                label="Buscar en GetYourGuide"
                disabledHint={
                  activityHrefs?.getYourGuide
                    ? null
                    : "Escribe un destino para buscar en GetYourGuide."
                }
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={nameId}>Nombre</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={NAME_PLACEHOLDERS[type]}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={detailId}>Nota (opcional)</Label>
            <Textarea
              id={detailId}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Horario, reserva, tip…"
              rows={3}
              className="min-h-[80px] resize-y text-sm"
            />
          </div>

          {budgetFields}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {addingTransport ? (
            <Button
              type="submit"
              form={transportFormId}
              disabled={!transportCanSubmit || !dayId}
            >
              Añadir al plan
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {editing ? "Guardar" : "Añadir al plan"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
