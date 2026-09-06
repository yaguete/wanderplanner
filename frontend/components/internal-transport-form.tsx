"use client"

/**
 * Cuerpo compartido del transporte interno (alta genérica y diálogo dedicado).
 * Dueño de medio, uso del coche, días y borrador de tarea. No anida <form>.
 */
import { useEffect, useId, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react"
import { DayPickerSelect } from "@/components/day-picker-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { ManualFlightSearch } from "@/components/manual-flight-search"
import { ManualItemTaskFields } from "@/components/manual-item-task-fields"
import { PartnerSearchLink } from "@/components/partner-search-link"
import {
  CarUsePicker,
  emptyEndpoint,
  EndpointField,
  TransportModePicker,
  TransportRouteForm,
  usePlaceSuggest,
  type EndpointState,
  type TransportModeChoice,
  type TransportRouteFormHandle,
} from "@/components/transport-route-form"
import { isSyntheticSourceId } from "@/lib/item-provenance"
import { rentalFormDiscoveryLinks } from "@/lib/item-discovery-links"
import {
  draftFromTaskState,
  emptyManualTaskDraft,
  taskPatchFromManualDraft,
  type ManualTaskDraft,
} from "@/lib/manual-item-task"
import { parseSpanDays } from "@/lib/item-span"
import {
  createPlaceSearchBudget,
  isPlaceSearchEnabled,
  PLACE_SEARCH_DISABLED_MESSAGE,
  stripPersistMeta,
  toPersistableRoutePlace,
  type PlaceSearchBudget,
} from "@/lib/place-search-guardrails"
import { seedTransportForm, type UpsertTransportRoutePayload } from "@/lib/transport-routes"
import { parseCostInput } from "@/lib/task-labels"
import {
  isCarRentalItem,
  isOwnedCarItem,
  rentalCoverageDays,
  rentalDropoffPlace,
  rentalMaxPickupIndex,
  rentalMinReturnIndex,
  rentalReturnIndex,
  rentalRouteFromPickup,
} from "@/lib/transport-kind"
import type {
  RouteCarUse,
  RouteMode,
  TransportRoute,
  TripTaskState,
  UserDay,
  UserDayItem,
} from "@/types/itinerary"

export type InternalTransportSubmitResult = { ok: true } | { ok: false; error?: string }

type BranchKey = "transfer" | "owned" | "rental"

type BranchDraft = {
  detail: string
  task: ManualTaskDraft
  dayId: string
  returnDayId?: string
  company?: string
  pickup?: EndpointState
  dropoff?: EndpointState
  sameCityDropoff?: boolean
}

export function InternalTransportForm({
  formId,
  days,
  startDate = null,
  initialDayId = null,
  existingItem = null,
  existingTask = null,
  currency,
  numTravelers = null,
  allowRental = true,
  onAddDay,
  onValidityChange,
  onSubmit,
  showDiscovery,
}: {
  formId: string
  days: UserDay[]
  startDate?: string | null
  initialDayId?: string | null
  existingItem?: UserDayItem | null
  existingTask?: TripTaskState | null
  currency: string
  numTravelers?: number | null
  allowRental?: boolean
  onAddDay?: () => void
  onValidityChange?: (canSubmit: boolean) => void
  onSubmit: (data: UpsertTransportRoutePayload) => InternalTransportSubmitResult | void
  showDiscovery?: boolean
}) {
  const pickupFieldId = useId()
  const dropoffFieldId = useId()
  const sameCityId = useId()
  const pickupDayIdField = useId()
  const returnDayIdField = useId()
  const transferDayIdField = useId()
  const companyId = useId()
  const noteId = useId()
  const routeFormRef = useRef<TransportRouteFormHandle>(null)
  const budgetRef = useRef<PlaceSearchBudget>(createPlaceSearchBudget())
  const pickupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pickupAbortRef = useRef<AbortController | null>(null)
  const dropoffDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropoffAbortRef = useRef<AbortController | null>(null)
  const draftsRef = useRef<Partial<Record<BranchKey, BranchDraft>>>({})

  const seed = seedTransportForm(existingItem)
  const preferredDay =
    (initialDayId && days.some((d) => d.id === initialDayId) && initialDayId) ||
    days[0]?.id ||
    ""
  const existingRental = Boolean(existingItem && isCarRentalItem(existingItem))
  const existingOwned = Boolean(existingItem && isOwnedCarItem(existingItem))
  const legacyCar =
    Boolean(existingItem?.route?.mode === "car" && !existingItem.route.carUse) &&
    !existingRental &&
    !existingOwned

  const [modeChoice, setModeChoice] = useState<TransportModeChoice>(() =>
    existingItem ? seed.mode : "unselected",
  )
  const [carUse, setCarUse] = useState<RouteCarUse | null>(() =>
    allowRental ? seed.carUse : null,
  )
  const [dayId, setDayId] = useState(() => {
    if (!existingRental) return preferredDay
    const maxPickup = rentalMaxPickupIndex(days.length)
    const idx = days.findIndex((d) => d.id === preferredDay)
    if (idx >= 0 && idx <= maxPickup) return preferredDay
    return maxPickup >= 0 ? days[maxPickup]!.id : ""
  })
  const [returnDayId, setReturnDayId] = useState(() => {
    if (!existingRental) return preferredDay
    const maxPickup = rentalMaxPickupIndex(days.length)
    let pickupIndex = days.findIndex((d) => d.id === preferredDay)
    if (pickupIndex < 0 || pickupIndex > maxPickup) pickupIndex = maxPickup
    if (pickupIndex < 0) return ""
    const coverage = parseSpanDays(existingItem?.spanDays) ?? 1
    const minReturn = rentalMinReturnIndex(pickupIndex)
    const idx = Math.max(rentalReturnIndex(pickupIndex, coverage), minReturn)
    return days[idx]?.id ?? days[minReturn]?.id ?? ""
  })
  const [pickup, setPickup] = useState<EndpointState>(() =>
    emptyEndpoint({
      place: existingRental ? seed.from : null,
      pendingText: existingRental ? null : seed.pendingFromText,
    }),
  )
  const existingDropoff = existingRental ? rentalDropoffPlace(existingItem?.route) : null
  const [sameCityDropoff, setSameCityDropoff] = useState(() => existingDropoff == null)
  const [dropoff, setDropoff] = useState<EndpointState>(() =>
    emptyEndpoint({ place: existingDropoff, pendingText: null }),
  )
  const [company, setCompany] = useState(() => (existingRental ? seed.vendor : ""))
  const [detail, setDetail] = useState(seed.detail)
  const [taskDraft, setTaskDraft] = useState<ManualTaskDraft>(() =>
    draftFromTaskState(existingTask),
  )
  const costRef = useRef<number | null>(taskDraft.cost)
  const [transferCanSubmit, setTransferCanSubmit] = useState(false)
  const [searchNotice, setSearchNotice] = useState<string | null>(
    isPlaceSearchEnabled() ? null : PLACE_SEARCH_DISABLED_MESSAGE,
  )

  const discovery =
    showDiscovery ?? (!existingItem || isSyntheticSourceId(existingItem.sourceId))

  const rentalActive =
    allowRental && modeChoice === "car" && carUse === "rental"
  const ownedActive = modeChoice === "car" && carUse === "owned"
  const needsCarUse =
    allowRental && modeChoice === "car" && carUse == null && !legacyCar
  const modeReady = modeChoice !== "unselected"
  const branch: BranchKey | null = !modeReady
    ? null
    : rentalActive
      ? "rental"
      : ownedActive
        ? "owned"
        : needsCarUse
          ? null
          : "transfer"

  const routeProbe: Pick<TransportRoute, "mode" | "carUse" | "leg"> | null = rentalActive
    ? { mode: "car", carUse: "rental" }
    : ownedActive
      ? { mode: "car", carUse: "owned" }
      : modeChoice === "unselected" || modeChoice === "undecided"
        ? { mode: null }
        : { mode: modeChoice }

  const pickupIndex = days.findIndex((d) => d.id === dayId)
  const returnIndex = days.findIndex((d) => d.id === returnDayId)
  const pickupDayValid =
    pickupIndex >= 0 && pickupIndex <= rentalMaxPickupIndex(days.length)
  const returnDayValid = pickupDayValid && returnIndex > pickupIndex
  const rentalDetailsOpen = rentalActive && pickupDayValid

  const canSubmit = rentalActive
    ? Boolean(
        pickup.selected &&
          pickupDayValid &&
          returnDayValid &&
          (sameCityDropoff || dropoff.selected),
      )
    : modeReady &&
      !needsCarUse &&
      pickupDayValid &&
      transferCanSubmit

  useEffect(() => {
    onValidityChange?.(canSubmit)
  }, [canSubmit, onValidityChange])

  usePlaceSuggest({
    endpoint: pickup,
    setEndpoint: setPickup,
    debounceRef: pickupDebounceRef,
    abortRef: pickupAbortRef,
    budgetRef,
    setSearchNotice,
    enabled: rentalActive,
  })

  usePlaceSuggest({
    endpoint: dropoff,
    setEndpoint: setDropoff,
    debounceRef: dropoffDebounceRef,
    abortRef: dropoffAbortRef,
    budgetRef,
    setSearchNotice,
    enabled: rentalActive && rentalDetailsOpen && !sameCityDropoff,
  })

  useEffect(() => {
    if (rentalActive) return
    pickupAbortRef.current?.abort()
    dropoffAbortRef.current?.abort()
  }, [rentalActive])

  useEffect(() => {
    if (!sameCityDropoff) return
    dropoffAbortRef.current?.abort()
  }, [sameCityDropoff])

  const snapshotBranch = (key: BranchKey) => {
    draftsRef.current[key] = {
      detail,
      task: { ...taskDraft, cost: costRef.current },
      dayId,
      returnDayId,
      company,
      pickup,
      dropoff,
      sameCityDropoff,
    }
  }

  const restoreBranch = (key: BranchKey, fromKey: BranchKey | null) => {
    const saved = draftsRef.current[key]
    if (saved) {
      setDetail(saved.detail)
      setTaskDraft(saved.task)
      costRef.current = saved.task.cost
      setDayId(saved.dayId)
      if (saved.returnDayId) setReturnDayId(saved.returnDayId)
      if (saved.company != null) setCompany(saved.company)
      if (saved.pickup) setPickup(saved.pickup)
      if (saved.dropoff) setDropoff(saved.dropoff)
      if (saved.sameCityDropoff != null) setSameCityDropoff(saved.sameCityDropoff)
      return
    }
    const keepCostAndNote =
      (key === "owned" || key === "rental") &&
      (fromKey === "owned" || fromKey === "rental")
    setTaskDraft(
      keepCostAndNote
        ? { ...emptyManualTaskDraft(), cost: costRef.current }
        : emptyManualTaskDraft(),
    )
    if (!keepCostAndNote) costRef.current = null
    if (key === "rental" && !existingRental) {
      setDayId("")
      setReturnDayId("")
    } else {
      setDayId((current) => current || preferredDay)
    }
  }

  const switchBranch = (next: BranchKey | null) => {
    if (branch && branch !== next) snapshotBranch(branch)
    if (next && next !== branch) restoreBranch(next, branch)
  }

  const handleModeChange = (next: RouteMode | "undecided") => {
    const nextBranch: BranchKey | null =
      next === "car" && allowRental && carUse === "rental"
        ? "rental"
        : next === "car" && carUse === "owned"
          ? "owned"
          : next === "car" && allowRental && carUse == null && !legacyCar
            ? null
            : "transfer"
    switchBranch(nextBranch)
    setModeChoice(next)
    if (next !== "car") setCarUse(null)
  }

  const handleCarUseChange = (next: RouteCarUse) => {
    switchBranch(next === "rental" ? "rental" : "owned")
    setCarUse(next)
  }

  const handlePickupDayChange = (nextId: string) => {
    setDayId(nextId)
    const nextPickup = days.findIndex((d) => d.id === nextId)
    const minReturn = rentalMinReturnIndex(nextPickup)
    const curReturn = days.findIndex((d) => d.id === returnDayId)
    if (nextPickup >= 0 && (curReturn < 0 || curReturn < minReturn)) {
      setReturnDayId(days[minReturn]?.id ?? "")
    }
  }

  const persistEndpointPlace = (
    endpoint: EndpointState,
    setEndpoint: Dispatch<SetStateAction<EndpointState>>,
  ) => {
    if (!endpoint.selected) {
      setEndpoint((s) => ({
        ...s,
        error: "Elige una ciudad del desplegable.",
      }))
      return null
    }
    return stripPersistMeta(toPersistableRoutePlace(endpoint.selected, endpoint.selected))
  }

  const currentTaskPatch = (persistEmpty: boolean) =>
    taskPatchFromManualDraft(
      { ...taskDraft, cost: costRef.current },
      persistEmpty ? { includeCleared: true } : undefined,
    )

  const flushCostDraft = (form: HTMLFormElement) => {
    const input = form.querySelector<HTMLInputElement>(
      'input[aria-label="Coste"], input[aria-label="Coste total"]',
    )
    if (!input) return
    const raw = input.value.trim()
    costRef.current = raw === "" ? null : (parseCostInput(raw) ?? costRef.current)
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canSubmit || !dayId) return
    if (rentalActive && !allowRental) return
    flushCostDraft(e.currentTarget)

    let payload: UpsertTransportRoutePayload | null = null
    if (rentalActive) {
      const city = persistEndpointPlace(pickup, setPickup)
      if (!city || !pickupDayValid || returnIndex <= pickupIndex) return
      const dropoffCity = sameCityDropoff
        ? null
        : persistEndpointPlace(dropoff, setDropoff)
      if (!sameCityDropoff && !dropoffCity) return
      payload = {
        dayId,
        returnDayId,
        itemId: existingItem?.id,
        route: rentalRouteFromPickup(city, dropoffCity),
        vendor: company.trim() || null,
        detail: detail.trim() || null,
        taskPatch: currentTaskPatch(Boolean(existingTask)),
      }
    } else {
      const value = routeFormRef.current?.tryGetValue()
      if (!value) return
      payload = {
        dayId,
        itemId: existingItem?.id,
        route: {
          from: value.from,
          to: value.to,
          mode: value.mode,
          ...(ownedActive && value.mode === "car" ? { carUse: "owned" as const } : {}),
        },
        vendor: value.vendor,
        detail: detail.trim() || null,
        taskPatch: currentTaskPatch(Boolean(existingTask)),
      }
    }
    onSubmit(payload)
  }

  const routeFormInitial = {
    from: emptyEndpoint({ place: seed.from, pendingText: seed.pendingFromText }),
    to: emptyEndpoint({ place: seed.to, pendingText: seed.pendingToText }),
    mode: (modeChoice === "unselected" ? "undecided" : modeChoice) as RouteMode | "undecided",
    vendor: existingRental ? "" : seed.vendor,
    detail: "",
  }

  const dayIndex = Math.max(0, pickupIndex)
  const rentalDiscovery = rentalActive
    ? rentalFormDiscoveryLinks({
        affiliateUrl: existingItem?.affiliateUrl,
        vendor: company || existingItem?.vendor,
        sourceId: existingItem?.sourceId,
        destination: pickup.selected?.label ?? pickup.query ?? "",
        startDate: startDate ?? null,
        pickupIndex: Math.max(0, pickupIndex),
        spanDays:
          pickupDayValid && returnDayValid
            ? rentalCoverageDays(pickupIndex, returnIndex)
            : 1,
      })
    : { kind: "none" as const }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <TransportModePicker value={modeChoice} onChange={handleModeChange} />

      {modeChoice === "car" && allowRental ? (
        <CarUsePicker value={carUse} onChange={handleCarUseChange} />
      ) : null}

      {rentalActive ? (
        <>
          {searchNotice ? (
            <p className="rounded-md border border-warning-border bg-warning-surface px-2.5 py-2 text-xs text-warning-foreground">
              {searchNotice}
            </p>
          ) : null}
          <EndpointField
            id={pickupFieldId}
            label="Ciudad de recogida"
            endpoint={pickup}
            setEndpoint={setPickup}
            placeholder="p. ej. Edimburgo"
            required
          />
          <DayPickerSelect
            id={pickupDayIdField}
            label="Día de recogida"
            days={days}
            startDate={startDate}
            value={dayId}
            onValueChange={handlePickupDayChange}
            selectNewlyAddedDays={false}
            disableDay={(_, index) => index > rentalMaxPickupIndex(days.length)}
          />
          {days.length < 2 ? (
            <p className="text-sm text-destructive">
              El alquiler necesita al menos dos días en el viaje.
            </p>
          ) : null}
          {rentalDetailsOpen ? (
            <>
              <DayPickerSelect
                id={returnDayIdField}
                label="Día de devolución"
                days={days}
                startDate={startDate}
                value={returnDayId}
                onValueChange={setReturnDayId}
                selectNewlyAddedDays={false}
                disableDay={(_, index) => pickupIndex < 0 || index <= pickupIndex}
              />
              {!returnDayValid ? (
                <p className="text-sm text-destructive">
                  Elige un día de devolución posterior a la recogida.
                </p>
              ) : null}
              <div className="space-y-2">
                <label
                  htmlFor={sameCityId}
                  className="flex items-start gap-2.5 text-left text-sm leading-snug"
                >
                  <Checkbox
                    id={sameCityId}
                    checked={sameCityDropoff}
                    onCheckedChange={(value) => {
                      const checked = value === true
                      setSameCityDropoff(checked)
                      if (checked) {
                        dropoffAbortRef.current?.abort()
                        setDropoff((s) => ({
                          ...s,
                          listOpen: false,
                          suggestions: [],
                          loading: false,
                          error: null,
                        }))
                      }
                    }}
                    className="mt-0.5"
                  />
                  <span>Devolución en la misma ciudad de recogida</span>
                </label>
                {!sameCityDropoff ? (
                  <EndpointField
                    id={dropoffFieldId}
                    label="Ciudad de entrega"
                    endpoint={dropoff}
                    setEndpoint={setDropoff}
                    placeholder="p. ej. Glasgow"
                    required
                  />
                ) : null}
              </div>
              {rentalDiscovery.kind === "partner" ? (
                <PartnerSearchLink
                  href={rentalDiscovery.href}
                  label={rentalDiscovery.label}
                  surface="manual_item"
                  affiliate="partner"
                />
              ) : rentalDiscovery.kind === "own" ? (
                <PartnerSearchLink
                  href={rentalDiscovery.carRental?.discovercars ?? null}
                  label="Buscar en DiscoverCars"
                  surface="manual_item"
                  affiliate="own"
                />
              ) : null}
              <div className="space-y-2">
                <Label htmlFor={companyId}>Nombre de la compañía de alquiler (opcional)</Label>
                <Input
                  id={companyId}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="p. ej. Hertz, Sixt…"
                />
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {modeReady && !needsCarUse && !rentalActive ? (
        <DayPickerSelect
          id={transferDayIdField}
          label="Día del traslado"
          days={days}
          startDate={startDate}
          value={dayId}
          onValueChange={setDayId}
          onAddDay={onAddDay}
        />
      ) : null}

      {modeReady ? (
        <div className={needsCarUse || rentalActive ? "hidden" : undefined}>
          <TransportRouteForm
            ref={routeFormRef}
            embedded
            showModePicker={false}
            hideNotes
            paused={needsCarUse || rentalActive}
            mode={modeChoice}
            onModeChange={handleModeChange}
            initial={routeFormInitial}
            fromLabel="Origen"
            toLabel="Destino"
            onValidityChange={setTransferCanSubmit}
            onSubmit={() => {}}
            renderAfterDestination={
              discovery && !rentalActive
                ? ({ from, to, mode }) => (
                    <ManualFlightSearch
                      from={from}
                      to={to}
                      mode={mode}
                      trip={{
                        startDate,
                        numDays: days.length,
                        numTravelers: numTravelers ?? 1,
                      }}
                      dayIndex={dayIndex}
                      days={days}
                    />
                  )
                : undefined
            }
          />
        </div>
      ) : null}

      {modeReady && !needsCarUse && (!rentalActive || rentalDetailsOpen) ? (
        <>
          <div className="space-y-2">
            <Label htmlFor={noteId}>
              {rentalActive ? "Nota (opcional)" : "Referencia o nota (opcional)"}
            </Label>
            <Textarea
              id={noteId}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={
                rentalActive ? "Horario de recogida, extras…" : "Número de reserva, horario…"
              }
              rows={3}
              className="min-h-[80px] resize-y text-sm"
            />
          </div>
          <ManualItemTaskFields
            type="transport"
            route={routeProbe}
            currency={currency}
            draft={taskDraft}
            onChange={(next) => {
              costRef.current = next.cost
              setTaskDraft(next)
            }}
          />
        </>
      ) : null}

      <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
        Guardar
      </button>
    </form>
  )
}
