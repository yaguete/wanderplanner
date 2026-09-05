"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
import { cn } from "@/lib/utils"
import { ITEM_COLORS, ITEM_LABELS, ITEM_TYPE_ICONS } from "@/lib/item-styles"
import { isSyntheticSourceId, MANUAL_SOURCE_ID } from "@/lib/item-provenance"
import { geocodeFreeText } from "@/lib/mapbox"
import {
  PlaceSuggestInput,
  type SelectedPlace,
} from "@/components/place-suggest-input"
import { DayPickerSelect } from "@/components/day-picker-select"
import { firstDayIdWithoutSourceItem } from "@/lib/day-heading"
import type {
  ItemType,
  RouteMode,
  TransportRoute,
  TripTaskState,
  UserDay,
  UserDayItem,
} from "@/types/itinerary"
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
import { joinStayPlace, splitStayPlace } from "@/lib/stay-discovery"
import { bookingOmitsStayDates } from "@/lib/booking-dates"
import { itemDiscoveryLinks } from "@/lib/item-discovery-links"
import {
  draftFromTaskState,
  emptyManualTaskDraft,
  taskPatchFromManualDraft,
  type ManualTaskDraft,
} from "@/lib/manual-item-task"
import { PartnerSearchLink } from "@/components/partner-search-link"
import { ManualFlightSearch } from "@/components/manual-flight-search"
import { ManualItemTaskFields } from "@/components/manual-item-task-fields"
import type { OutboundSurface } from "@/lib/funnel-analytics"

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

function allDaysOccupiedHint(type: ItemType): string {
  switch (type) {
    case "stay":
      return "Este alojamiento ya está añadido a todos los días de tu viaje."
    case "activity":
      return "Esta actividad ya está añadida a todos los días de tu viaje."
    case "food":
      return "Este restaurante ya está añadido a todos los días de tu viaje."
    case "transport":
      return "Este traslado ya está añadido a todos los días de tu viaje."
  }
}

export type AddManualItemDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  days: UserDay[]
  /** Día preseleccionado al abrir (p. ej. desde empty state o `dayHint`). */
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
  /**
   * Ítem de partida: edición de uno ya en el viaje, o semilla al consolidar
   * desde fuente (`userDayItemFromSource`). Conserva id y procedencia.
   */
  seedItem?: UserDayItem | null
  existingDayId?: string | null
  /** `edit` = ya vive en el viaje. Default `add`. */
  mode?: "add" | "edit"
  onAddDay?: () => void
  outboundSurface?: OutboundSurface
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
  seedItem = null,
  existingDayId = null,
  mode = "add",
  onAddDay,
  outboundSurface = "manual_item",
}: AddManualItemDialogProps) {
  const id = useId()
  const [type, setType] = useState<ItemType>("activity")
  const [name, setName] = useState(seedItem?.name ?? "")
  const [dayId, setDayId] = useState("")
  const [detail, setDetail] = useState("")
  const [placeQuery, setPlaceQuery] = useState("")
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null)
  const [addressQuery, setAddressQuery] = useState("")
  const [selectedAddress, setSelectedAddress] = useState<SelectedPlace | null>(null)
  const [tripProximity, setTripProximity] = useState<[number, number] | null>(null)
  const [nights, setNights] = useState(1)
  const [transportCanSubmit, setTransportCanSubmit] = useState(false)
  const [taskDraft, setTaskDraft] = useState<ManualTaskDraft>(emptyManualTaskDraft)
  const [liveTransportMode, setLiveTransportMode] = useState<RouteMode | null>(null)
  const [placeOpen, setPlaceOpen] = useState(false)

  const costRef = useRef<number | null>(null)

  const nameId = `${id}-name`
  const dayFieldId = `${id}-day`
  const placeId = `${id}-place`
  const addressId = `${id}-address`
  const detailId = `${id}-detail`
  const nightsId = `${id}-nights`
  const transportFormId = `${id}-transport`

  const selectedDayIndex = Math.max(0, days.findIndex((d) => d.id === dayId))
  const maxNights = Math.max(1, days.length - selectedDayIndex)
  const seeded = seedItem != null
  const persisted = mode === "edit" && existingDayId != null
  const addingTransport = type === "transport" && !seeded
  const durationKind = itemTakesCalendarSpan(type)
  const splitsPlace = type === "stay" || type === "activity" || type === "food"
  const fromSource = Boolean(seedItem && !isSyntheticSourceId(seedItem.sourceId))
  const fromSourceAdd = fromSource && !persisted
  const TitleIcon = ITEM_TYPE_ICONS[type]
  const alreadyOnSelectedDay =
    fromSourceAdd &&
    seedItem != null &&
    (days.find((d) => d.id === dayId)?.items.some(
      (it) => it.sourceItemId === seedItem.sourceItemId,
    ) ?? false)
  const allDaysOccupied =
    fromSourceAdd &&
    seedItem != null &&
    days.length > 0 &&
    firstDayIdWithoutSourceItem(days, seedItem.sourceItemId) == null

  useEffect(() => {
    if (!open) return
    const seed = seedItem
    const nextType = seed?.type ?? initialType ?? "activity"
    setType(nextType)
    setName(seed?.name ?? "")
    setDetail(seed?.detail?.trim() ?? "")
    const splitPlace =
      nextType === "stay" || nextType === "activity" || nextType === "food"
        ? splitStayPlace(seed?.region)
        : null
    if (splitPlace) {
      setPlaceQuery(splitPlace.city)
      setAddressQuery(splitPlace.address)
      if (splitPlace.address && seed && hasFiniteLngLat(seed.coords)) {
        setSelectedAddress({ label: splitPlace.address, coords: seed.coords })
        setSelectedPlace(null)
      } else if (seed && hasFiniteLngLat(seed.coords)) {
        setSelectedPlace({
          label: splitPlace.city || seed.name,
          coords: seed.coords,
        })
        setSelectedAddress(null)
      } else {
        setSelectedPlace(null)
        setSelectedAddress(null)
      }
    } else {
      setPlaceQuery(seed?.region?.trim() ?? "")
      setAddressQuery("")
      setSelectedAddress(null)
      setSelectedPlace(
        seed && hasFiniteLngLat(seed.coords)
          ? {
              label: seed.region?.trim() || seed.name,
              coords: seed.coords,
            }
          : null,
      )
    }
    setNights(parseSpanDays(seed?.spanDays) ?? 1)
    setTransportCanSubmit(false)
    setLiveTransportMode(null)
    const seededDraft = draftFromTaskState(existingTask)
    setTaskDraft(seededDraft)
    costRef.current = seededDraft.cost
    setPlaceOpen(false)
    const fromSourceSeed =
      Boolean(seed && !isSyntheticSourceId(seed.sourceId)) &&
      !(mode === "edit" && existingDayId != null)
    const preferred = fromSourceSeed
      ? (firstDayIdWithoutSourceItem(days, seed?.sourceItemId) ?? "")
      : (seed && existingDayId && days.some((d) => d.id === existingDayId) && existingDayId) ||
        (initialDayId && days.some((d) => d.id === initialDayId) && initialDayId) ||
        days[0]?.id ||
        ""
    setDayId(preferred)

    setTripProximity(null)
    if (seed && hasFiniteLngLat(seed.coords)) {
      setTripProximity([seed.coords.lng, seed.coords.lat])
    } else {
      const dest = destinationHint?.trim()
      const codes = countryCodes.filter((c) => c.trim().length === 2)
      if (dest) {
        void geocodeFreeText(dest, { countryCodes: codes.length ? codes : undefined }).then((p) => {
          setTripProximity(p)
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open
  }, [open])

  useEffect(() => {
    if (!durationKind) return
    setNights((n) => Math.min(Math.max(1, n), maxNights))
  }, [durationKind, maxNights])

  const canSubmit =
    name.trim().length > 0 &&
    dayId.length > 0 &&
    days.some((d) => d.id === dayId) &&
    !alreadyOnSelectedDay &&
    !allDaysOccupied

  const handleSelectCity = (place: SelectedPlace) => {
    if (selectedPlace && selectedPlace.label !== place.label) {
      setAddressQuery("")
      setSelectedAddress(null)
    }
    setPlaceQuery(place.label)
    setSelectedPlace(place)
  }

  const handleCityChange = (next: string) => {
    setPlaceQuery(next)
    setSelectedPlace(null)
  }

  const handleSelectAddress = (place: SelectedPlace) => {
    setAddressQuery(place.label)
    setSelectedAddress(place)
  }

  const handleAddressChange = (next: string) => {
    setAddressQuery(next)
    setSelectedAddress(null)
  }

  const currentTaskPatch = (persistEmpty: boolean) =>
    taskPatchFromManualDraft(
      { ...taskDraft, cost: costRef.current },
      persistEmpty ? { includeCleared: true } : undefined,
    )

  const handleSubmit = () => {
    if (!canSubmit) return
    const city = selectedPlace?.label ?? placeQuery.trim()
    const address = selectedAddress?.label ?? addressQuery.trim()
    const region = splitsPlace
      ? joinStayPlace(city, address)
      : selectedPlace?.label ?? (placeQuery.trim() || null)
    const coords =
      (splitsPlace ? selectedAddress?.coords : null) ??
      selectedPlace?.coords ??
      null
    const item: UserDayItem = seedItem
      ? {
          ...seedItem,
          name: name.trim(),
          detail: detail.trim() ? detail.trim() : null,
          region,
          coords,
        }
      : {
          id: crypto.randomUUID(),
          sourceItemId: `manual-${crypto.randomUUID()}`,
          sourceId: MANUAL_SOURCE_ID,
          type,
          name: name.trim(),
          detail: detail.trim() ? detail.trim() : null,
          sourceAuthor: "Tú",
          region,
          coords,
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

  const title = persisted
    ? `Editar ${ITEM_LABELS[type].toLowerCase()}`
    : fromSourceAdd && name.trim()
      ? name.trim()
      : type === "stay"
        ? "Añadir alojamiento"
        : type === "activity"
          ? "Añadir actividad"
          : type === "food"
            ? "Añadir restaurante"
            : type === "transport"
              ? "Añadir traslado"
              : "Añadir ítem"

  const descriptionText = persisted
    ? durationKind
      ? "Cambia el nombre, el día, el lugar o la duración."
      : "Cambia el nombre, el día o el lugar."
    : addingTransport
      ? "Define origen, destino y medio de transporte si lo sabes."
      : seeded
        ? type === "stay"
          ? "Elige el día de entrada y, si quieres, reserva o anota el coste."
          : type === "activity"
            ? "Elige el día de inicio y, si quieres, reserva o deja una nota."
            : "Elige el día y, si quieres, deja una nota o el estado de la reserva."
        : "Añade a tu viaje elementos que no encuentras en tus fuentes."

  const stayDestination = selectedPlace?.label?.trim() || placeQuery.trim() || destinationHint?.trim() || ""
  const stayDayIndexes = Array.from(
    { length: Math.min(nights, maxNights) },
    (_, i) => selectedDayIndex + i,
  )
  const discovery = addingTransport
    ? { kind: "none" as const }
    : itemDiscoveryLinks({
        type,
        affiliateUrl: seedItem?.affiliateUrl,
        vendor: seedItem?.vendor,
        sourceId: seedItem?.sourceId ?? MANUAL_SOURCE_ID,
        allowFromSource: fromSource,
        destination: stayDestination,
        selectedPlaceLabel: selectedPlace?.label ?? null,
        destinationHint,
        addressHint: placeQuery.trim() || null,
        coords: selectedAddress?.coords ?? selectedPlace?.coords ?? null,
        startDate,
        dayIndexes: stayDayIndexes,
        dayIndex: selectedDayIndex,
        spanDays: nights,
        currency,
        numTravelers: numTravelers ?? 1,
      })
  const ownStay = discovery.kind === "own" ? discovery.stay : undefined
  const ownActivity = discovery.kind === "own" ? discovery.activity : undefined
  const hasStayLinks = Boolean(
    ownStay && (ownStay.booking || ownStay.airbnb || ownStay.homeExchange),
  )
  const hasActivityLinks = Boolean(
    ownActivity && (ownActivity.civitatis || ownActivity.getYourGuide),
  )

  const dayField = (
    <DayPickerSelect
      id={dayFieldId}
      label={addingTransport ? "Día del traslado" : DAY_FIELD_LABELS[type]}
      days={days}
      startDate={startDate}
      value={dayId}
      onValueChange={setDayId}
      sourceItemId={fromSourceAdd && seedItem ? seedItem.sourceItemId : null}
      onAddDay={onAddDay}
      disabled={allDaysOccupied}
      occupiedHint={allDaysOccupied ? allDaysOccupiedHint(type) : null}
    />
  )

  const addressProximity: [number, number] | null = selectedPlace
    ? [selectedPlace.coords.lng, selectedPlace.coords.lat]
    : tripProximity

  const addressPinHint = selectedAddress ? (
    <p className="text-xs text-muted-foreground">
      {type === "food" ? "Ubicación guardada." : "Ubicación fijada en el mapa."}
    </p>
  ) : durationKind && nights >= 2 && !selectedPlace ? (
    <p className="text-xs text-muted-foreground">
      Sin una dirección concreta no ancla la jornada en el mapa.
    </p>
  ) : null

  const placeField = (
    <PlaceSuggestInput
      id={placeId}
      label={splitsPlace ? "Ciudad" : "Ciudad o dirección (opcional)"}
      value={placeQuery}
      onValueChange={handleCityChange}
      selected={selectedPlace}
      onSelect={handleSelectCity}
      placeholder="p. ej. Budapest"
      proximity={tripProximity}
      countryCodes={countryCodes}
      autoFocus={!seeded}
    />
  )

  const addressField = splitsPlace ? (
    <PlaceSuggestInput
      id={addressId}
      label="Dirección (opcional)"
      value={addressQuery}
      onValueChange={handleAddressChange}
      selected={selectedAddress}
      onSelect={handleSelectAddress}
      placeholder="p. ej. Király utca 15"
      proximity={addressProximity}
      countryCodes={countryCodes}
      hint={addressPinHint}
    />
  ) : null

  const placeSummary = [placeQuery.trim(), addressQuery.trim()].filter(Boolean).join(" · ")
  const placeCollapsible = (
    <Collapsible open={placeOpen} onOpenChange={setPlaceOpen}>
      <div className="rounded-lg border border-border/70 bg-muted/20">
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">
              {splitsPlace ? "Ciudad y dirección" : "Ciudad o dirección"}
            </span>
            {!placeOpen ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {placeSummary || "Opcional"}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              placeOpen && "rotate-180",
            )}
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 px-3 pb-3">
          {placeField}
          {addressField}
        </CollapsibleContent>
      </div>
    </Collapsible>
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
        {`Introduce un número del 1 al ${maxNights} (si necesitas más, añade días a tu viaje)`}
      </p>
    </div>
  ) : null

  const budgetFields = (
    <ManualItemTaskFields
      type={addingTransport ? "transport" : type}
      routeMode={addingTransport ? liveTransportMode : seedItem?.route?.mode}
      currency={currency}
      draft={taskDraft}
      onChange={(next) => {
        costRef.current = next.cost
        setTaskDraft(next)
      }}
    />
  )

  const discoveryBlock =
    discovery.kind === "partner" ? (
      <div className="flex flex-wrap items-center gap-2">
        <PartnerSearchLink
          href={discovery.href}
          label={discovery.label}
          affiliate="partner"
          surface={outboundSurface}
        />
      </div>
    ) : discovery.kind === "own" && ownStay ? (
      <div className="space-y-1.5">
        {hasStayLinks ? (
          <div className="flex flex-wrap items-center gap-2">
            <PartnerSearchLink
              href={ownStay.booking}
              label="Buscar en Booking"
              surface={outboundSurface}
            />
            <PartnerSearchLink
              href={ownStay.airbnb}
              label="Buscar en Airbnb"
              affiliate="none"
              surface={outboundSurface}
            />
            <PartnerSearchLink
              href={ownStay.homeExchange}
              label="Buscar en HomeExchange"
              affiliate="none"
              surface={outboundSurface}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{discovery.hint}</p>
        )}
        {hasStayLinks && bookingOmitsStayDates(startDate, stayDayIndexes) ? (
          <p className="text-[11px] text-muted-foreground">
            Sin fechas en el viaje, o con el check-in ya pasado, los
            buscadores abren el destino sin fechas.
          </p>
        ) : null}
      </div>
    ) : discovery.kind === "own" && ownActivity ? (
      <div className="space-y-1.5">
        {hasActivityLinks ? (
          <div className="flex flex-wrap items-center gap-2">
            <PartnerSearchLink
              href={ownActivity.civitatis}
              label="Buscar en Civitatis"
              surface={outboundSurface}
            />
            <PartnerSearchLink
              href={ownActivity.getYourGuide}
              label="Buscar en GetYourGuide"
              surface={outboundSurface}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{discovery.hint}</p>
        )}
      </div>
    ) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullscreenOnMobile
        hideClose
        className={addingTransport ? "sm:max-w-lg" : "sm:max-w-md"}
      >
        <DialogHeader className="shrink-0 space-y-1.5 px-6 py-4 text-left">
          <DialogTitle className="flex items-start gap-2 text-lg font-semibold leading-snug tracking-tight text-balance">
            {fromSourceAdd ? (
              <>
                <TitleIcon
                  className={cn("mt-0.5 h-5 w-5 shrink-0", ITEM_COLORS[type].text)}
                  aria-hidden
                />
                <span>
                  <span className="sr-only">{ITEM_LABELS[type]}. </span>
                  {title}
                </span>
              </>
            ) : (
              title
            )}
          </DialogTitle>
          <DialogDescription>{descriptionText}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 pb-10">
          {!seeded ? (
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
                    onClick={() => {
                      const simple = t === "activity" || t === "food"
                      const wasSimple = type === "activity" || type === "food"
                      if (simple !== wasSimple) {
                        costRef.current = null
                        setTaskDraft(emptyManualTaskDraft())
                      }
                      setType(t)
                    }}
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
          ) : fromSourceAdd ? (
            <>
          {placeCollapsible}

          {dayField}

          {durationField}

          {discoveryBlock}

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
          ) : (
            <>
          {placeField}

          {dayField}

          {durationField}

          {discoveryBlock}

          <div className="space-y-2">
            <Label htmlFor={nameId}>Nombre</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={NAME_PLACEHOLDERS[type]}
            />
          </div>

          {addressField}

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
              {persisted ? "Guardar" : "Añadir al plan"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
