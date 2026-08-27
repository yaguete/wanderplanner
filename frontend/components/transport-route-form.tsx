"use client"

/**
 * Formulario compartido de extremos + medio + hubs (T4B.3 §9.2).
 * No conoce Trip, legs ni tareas: solo datos de formulario.
 * Hubs por extremo: loading/resultados independientes; solo tras acción explícita.
 *
 * Duración / `spanDays`: un tramo A→B no dura noches. El campo Noches del
 * alta manual es solo stay. Enganche futuro (coche de alquiler): un tramo
 * no modela «tengo el coche N días»; eso sería otro tipo de ítem, no
 * alargar este formulario.
 */
import { useEffect, useId, useRef, useState } from "react"
import { Loader2, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  resolvePermanentCoords,
  seedGeocodeCache,
  suggestPlaces,
  searchTransportHubs,
  clearTransportHubCache,
  type GeocodeSuggestion,
  type TransportHubSuggestion,
} from "@/lib/mapbox"
import {
  canSpendHub,
  canSpendSuggest,
  createPlaceSearchBudget,
  isPlaceSearchEnabled,
  PLACE_SEARCH_BUDGET_MESSAGE,
  PLACE_SEARCH_DISABLED_MESSAGE,
  recordHub,
  recordSuggest,
  stripPersistMeta,
  toPersistableRoutePlace,
  type PlaceSearchBudget,
} from "@/lib/place-search-guardrails"
import {
  decideHubSearch,
  hubActionLabel,
  hubKindForMode,
  hubLabelForKind,
  isCityOrAddressKind,
  type HubKind,
} from "@/lib/transport-hubs"
import type { RouteMode, RoutePlace } from "@/types/itinerary"
import { isBookableTransportMode } from "@/lib/trip-tasks"
import {
  TRANSPORT_MODE_ICONS,
  TRANSPORT_MODE_OPTIONS,
} from "@/lib/item-styles"

const SUGGEST_DEBOUNCE_MS = 450
const SUGGEST_MIN_CHARS = 3

export type EndpointState = {
  query: string
  selected: RoutePlace | null
  suggestions: GeocodeSuggestion[]
  loading: boolean
  listOpen: boolean
  error: string | null
}

export type TransportRouteFormValue = {
  from: RoutePlace
  to: RoutePlace
  mode: RouteMode | null
  vendor: string | null
  detail: string | null
  /** Ciudad/dirección ancla de salida (para originPatch en legs). */
  cityFrom: RoutePlace | null
  cityTo: RoutePlace | null
}

export type TransportRouteFormProps = {
  initial: {
    from: EndpointState
    to: EndpointState
    mode: RouteMode | "undecided"
    vendor: string
    detail: string
  }
  fromLabel?: string
  toLabel?: string
  fromPlaceholder?: string
  toPlaceholder?: string
  /** Expuesto al padre para submit / validación. */
  formId?: string
  onValidityChange?: (canSubmit: boolean) => void
  onSubmit: (value: TransportRouteFormValue) => void
}

export function emptyEndpoint(seed?: {
  place: RoutePlace | null
  pendingText: string | null
}): EndpointState {
  if (seed?.place) {
    return {
      query: seed.place.label,
      selected: seed.place,
      suggestions: [],
      loading: false,
      listOpen: false,
      error: null,
    }
  }
  return {
    query: seed?.pendingText?.trim() ?? "",
    selected: null,
    suggestions: [],
    loading: false,
    listOpen: false,
    error: null,
  }
}

type HubSideState = {
  hubs: TransportHubSuggestion[]
  loading: boolean
  requested: boolean
  emptyMessage: string | null
  searchedCacheKey: string | null
}

function emptyHubSide(): HubSideState {
  return {
    hubs: [],
    loading: false,
    requested: false,
    emptyMessage: null,
    searchedCacheKey: null,
  }
}

export function TransportRouteForm({
  initial,
  fromLabel = "Origen",
  toLabel = "Destino",
  fromPlaceholder = "p. ej. Barcelona",
  toPlaceholder = "p. ej. Granada",
  formId,
  onValidityChange,
  onSubmit,
}: TransportRouteFormProps) {
  const id = useId()
  const [from, setFrom] = useState<EndpointState>(initial.from)
  const [to, setTo] = useState<EndpointState>(initial.to)
  const [mode, setMode] = useState<RouteMode | "undecided">(initial.mode)
  const [vendor, setVendor] = useState(initial.vendor)
  const [detail, setDetail] = useState(initial.detail)
  const [hubFrom, setHubFrom] = useState<HubSideState>(emptyHubSide)
  const [hubTo, setHubTo] = useState<HubSideState>(emptyHubSide)
  const [searchNotice, setSearchNotice] = useState<string | null>(
    isPlaceSearchEnabled() ? null : PLACE_SEARCH_DISABLED_MESSAGE,
  )
  const budgetRef = useRef<PlaceSearchBudget>(createPlaceSearchBudget())

  const fromAbortRef = useRef<AbortController | null>(null)
  const toAbortRef = useRef<AbortController | null>(null)
  const hubFromAbortRef = useRef<AbortController | null>(null)
  const hubToAbortRef = useRef<AbortController | null>(null)
  const fromDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cityFromRef = useRef<RoutePlace | null>(
    initial.from.selected && isCityOrAddressKind(initial.from.selected.kind)
      ? initial.from.selected
      : null,
  )
  const cityToRef = useRef<RoutePlace | null>(
    initial.to.selected && isCityOrAddressKind(initial.to.selected.kind)
      ? initial.to.selected
      : null,
  )

  const hubKind = hubKindForMode(mode)
  const canSubmit = Boolean(from.selected && to.selected)

  useEffect(() => {
    onValidityChange?.(canSubmit)
  }, [canSubmit, onValidityChange])

  usePlaceSuggest({
    endpoint: from,
    setEndpoint: setFrom,
    debounceRef: fromDebounceRef,
    abortRef: fromAbortRef,
    budgetRef,
    setSearchNotice,
  })
  usePlaceSuggest({
    endpoint: to,
    setEndpoint: setTo,
    debounceRef: toDebounceRef,
    abortRef: toAbortRef,
    budgetRef,
    setSearchNotice,
  })

  // Al cambiar de modo: restaurar anclas de ciudad para la próxima búsqueda de hubs.
  const handleModeChange = (next: RouteMode | "undecided") => {
    setMode(next)
    setHubFrom(emptyHubSide())
    setHubTo(emptyHubSide())
    hubFromAbortRef.current?.abort()
    hubToAbortRef.current?.abort()
  }

  const runHubSearch = async (which: "from" | "to", opts?: { force?: boolean }) => {
    const selected = which === "from" ? from.selected : to.selected
    const cityAnchor = which === "from" ? cityFromRef.current : cityToRef.current
    const setHub = which === "from" ? setHubFrom : setHubTo
    const abortRef = which === "from" ? hubFromAbortRef : hubToAbortRef
    const current = which === "from" ? hubFrom : hubTo

    const decision = decideHubSearch({
      mode,
      selected,
      cityAnchor,
      userRequested: true,
    })
    if (!decision.shouldSearch) {
      setHub((s) => ({
        ...s,
        requested: true,
        loading: false,
        hubs: [],
        emptyMessage:
          decision.reason === "already-hub" || decision.reason === "no-hub-mode"
            ? null
            : "Elige primero una ciudad del desplegable.",
      }))
      return
    }

    // Misma clave en esta sesión de modal → reusar (no gastar otra llamada).
    if (
      !opts?.force &&
      current.searchedCacheKey === decision.cacheKey &&
      current.requested &&
      !current.loading
    ) {
      return
    }

    if (opts?.force) {
      clearTransportHubCache(decision.kind, decision.proximity)
    }

    if (!canSpendHub(budgetRef.current)) {
      setSearchNotice(PLACE_SEARCH_BUDGET_MESSAGE)
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    budgetRef.current = recordHub(budgetRef.current)
    setHub({
      hubs: [],
      loading: true,
      requested: true,
      emptyMessage: null,
      searchedCacheKey: decision.cacheKey,
    })

    try {
      const list = await searchTransportHubs(decision.kind, decision.proximity, {
        limit: 10,
        signal: ac.signal,
      })
      if (ac.signal.aborted) return
      const hubLabel = hubLabelForKind(decision.kind)
      setHub({
        hubs: list,
        loading: false,
        requested: true,
        emptyMessage:
          list.length === 0
            ? `No encontramos ${hubLabel} cercano. Se mantiene la ciudad.`
            : null,
        searchedCacheKey: decision.cacheKey,
      })
    } catch (err: unknown) {
      if (ac.signal.aborted) return
      if (err instanceof DOMException && err.name === "AbortError") return
      setHub({
        hubs: [],
        loading: false,
        requested: true,
        emptyMessage: "No se pudieron cargar sugerencias.",
        searchedCacheKey: decision.cacheKey,
      })
    }
  }

  const applyHub = (which: "from" | "to", hub: TransportHubSuggestion) => {
    const place: RoutePlace = {
      label: hub.label,
      coords: hub.center,
      kind: hub.kind,
    }
    // No tocar city*Ref: la proximidad sigue anclada a la ciudad.
    if (which === "from") {
      setFrom({
        query: place.label,
        selected: place,
        suggestions: [],
        loading: false,
        listOpen: false,
        error: null,
      })
      setHubFrom((s) => ({ ...s, hubs: [], emptyMessage: null }))
    } else {
      setTo({
        query: place.label,
        selected: place,
        suggestions: [],
        loading: false,
        listOpen: false,
        error: null,
      })
      setHubTo((s) => ({ ...s, hubs: [], emptyMessage: null }))
    }
  }

  const showVendor = isBookableTransportMode(mode === "undecided" ? null : mode)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!from.selected || !to.selected) {
      if (!from.selected) {
        setFrom((s) => ({ ...s, error: "Elige un origen del desplegable." }))
      }
      if (!to.selected) {
        setTo((s) => ({ ...s, error: "Elige un destino del desplegable." }))
      }
      return
    }

    const persistFrom = stripPersistMeta(
      toPersistableRoutePlace(from.selected, cityFromRef.current),
    )
    const persistTo = stripPersistMeta(
      toPersistableRoutePlace(to.selected, cityToRef.current),
    )

    onSubmit({
      from: persistFrom,
      to: persistTo,
      mode: mode === "undecided" ? null : mode,
      vendor: showVendor ? vendor.trim() || null : null,
      detail: detail.trim() || null,
      cityFrom: cityFromRef.current,
      cityTo: cityToRef.current,
    })
  }

  const showHubActions = Boolean(hubKind && (from.selected || to.selected))

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      {searchNotice ? (
        <p className="rounded-md border border-warning-border bg-warning-surface px-2.5 py-2 text-xs text-warning-foreground">
          {searchNotice}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label>Medio de transporte</Label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Medio de transporte">
          {TRANSPORT_MODE_OPTIONS.map((opt) => {
            const selected = mode === opt.value
            const Icon = TRANSPORT_MODE_ICONS[opt.value]
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => handleModeChange(opt.value)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {opt.label}
              </button>
            )
          })}
        </div>
        {showHubActions ? (
          <p className="text-[11px] text-muted-foreground">
            Puedes refinar cada extremo con {hubLabelForKind(hubKind!)} concreto cuando quieras.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <EndpointField
          id={`${id}-from`}
          label={fromLabel}
          endpoint={from}
          setEndpoint={setFrom}
          placeholder={fromPlaceholder}
          required
          onCitySelected={(place) => {
            cityFromRef.current = place
            setHubFrom(emptyHubSide())
          }}
          onCityCleared={() => {
            cityFromRef.current = null
            setHubFrom(emptyHubSide())
          }}
          onCityCoordsUpgraded={(place) => {
            if (cityFromRef.current?.label === place.label) cityFromRef.current = place
          }}
        />
        <HubSidePanel
          kind={hubKind}
          selected={from.selected}
          state={hubFrom}
          keepLabel={cityFromRef.current?.label ?? from.selected?.label}
          onRequest={() => void runHubSearch("from")}
          onRetry={() => void runHubSearch("from", { force: true })}
          onPick={(h) => applyHub("from", h)}
        />
      </div>

      <div className="space-y-2">
        <EndpointField
          id={`${id}-to`}
          label={toLabel}
          endpoint={to}
          setEndpoint={setTo}
          placeholder={toPlaceholder}
          required
          onCitySelected={(place) => {
            cityToRef.current = place
            setHubTo(emptyHubSide())
          }}
          onCityCleared={() => {
            cityToRef.current = null
            setHubTo(emptyHubSide())
          }}
          onCityCoordsUpgraded={(place) => {
            if (cityToRef.current?.label === place.label) cityToRef.current = place
          }}
        />
        <HubSidePanel
          kind={hubKind}
          selected={to.selected}
          state={hubTo}
          keepLabel={cityToRef.current?.label ?? to.selected?.label}
          onRequest={() => void runHubSearch("to")}
          onRetry={() => void runHubSearch("to", { force: true })}
          onPick={(h) => applyHub("to", h)}
        />
      </div>

      {showVendor ? (
        <div className="space-y-2">
          <Label htmlFor={`${id}-vendor`}>Compañía (opcional)</Label>
          <Input
            id={`${id}-vendor`}
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="p. ej. Renfe, Vueling…"
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`${id}-detail`}>Referencia o nota (opcional)</Label>
        <Input
          id={`${id}-detail`}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Número de reserva, horario…"
        />
      </div>

      {/* Submit lo dispara el footer del Dialog vía form=formId */}
      <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
        Guardar
      </button>
    </form>
  )
}

function HubSidePanel({
  kind,
  selected,
  state,
  keepLabel,
  onRequest,
  onRetry,
  onPick,
}: {
  kind: HubKind | null
  selected: RoutePlace | null
  state: HubSideState
  keepLabel?: string | null
  onRequest: () => void
  onRetry: () => void
  onPick: (h: TransportHubSuggestion) => void
}) {
  if (!kind || !selected) return null
  if (selected.kind === kind) {
    return (
      <p className="text-[11px] text-muted-foreground">
        {kind === "airport" ? "Aeropuerto" : "Estación"} fijado.
      </p>
    )
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-dashed border-border bg-muted/20 p-2.5">
      {keepLabel ? (
        <p className="text-[11px] text-muted-foreground">
          Mantener {keepLabel}
        </p>
      ) : null}
      {!state.requested ? (
        <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={onRequest}>
          {hubActionLabel(kind)}
        </Button>
      ) : null}
      {state.loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Buscando…
        </div>
      ) : null}
      {!state.loading && state.hubs.length > 0 ? (
        <ul className="m-0 list-none space-y-1 p-0">
          {state.hubs.slice(0, 3).map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onPick(h)}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span className="min-w-0 truncate font-medium text-foreground">{h.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {h.distanceKm < 10
                    ? `${h.distanceKm.toFixed(1)} km`
                    : `${Math.round(h.distanceKm)} km`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!state.loading && state.emptyMessage ? (
        <p className="text-[11px] text-muted-foreground">{state.emptyMessage}</p>
      ) : null}
      {state.requested && !state.loading ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={onRetry}
        >
          Buscar de nuevo
        </Button>
      ) : null}
    </div>
  )
}

function EndpointField({
  id,
  label,
  endpoint,
  setEndpoint,
  placeholder,
  required,
  onCitySelected,
  onCityCleared,
  onCityCoordsUpgraded,
}: {
  id: string
  label: string
  endpoint: EndpointState
  setEndpoint: React.Dispatch<React.SetStateAction<EndpointState>>
  placeholder: string
  required?: boolean
  onCitySelected?: (place: RoutePlace) => void
  onCityCleared?: () => void
  /** Llega tarde, con la coordenada permanente. Solo reapunta el ancla; no toca hubs. */
  onCityCoordsUpgraded?: (place: RoutePlace) => void
}) {
  return (
    <div className="relative space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <div className="relative">
        <MapPin
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={id}
          value={endpoint.query}
          onChange={(e) => {
            onCityCleared?.()
            setEndpoint((s) => ({
              ...s,
              query: e.target.value,
              selected: null,
              listOpen: true,
              error: null,
            }))
          }}
          onFocus={() => {
            // Abrir (y disparar suggest si hay texto pendiente) solo con interacción del usuario.
            setEndpoint((s) => ({ ...s, listOpen: true }))
          }}
          onBlur={() => {
            window.setTimeout(() => setEndpoint((s) => ({ ...s, listOpen: false })), 150)
          }}
          placeholder={placeholder}
          className="pl-8"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={endpoint.listOpen && endpoint.suggestions.length > 0}
        />
        {endpoint.loading ? (
          <Loader2
            className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : null}
      </div>
      {endpoint.listOpen && endpoint.suggestions.length > 0 ? (
        <ul
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
          role="listbox"
        >
          {endpoint.suggestions.map((s) => (
            <li key={s.id} role="option" aria-selected={endpoint.selected?.label === s.text}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const place: RoutePlace = {
                    label: s.text,
                    coords: s.center,
                    kind: "city",
                  }
                  onCitySelected?.(place)
                  setEndpoint({
                    query: s.text,
                    selected: place,
                    suggestions: [],
                    loading: false,
                    listOpen: false,
                    error: null,
                  })
                  seedGeocodeCache(s.placeName, s.center)
                  // La coordenada de arriba es del dataset temporal: sirve para la
                  // UI pero no se puede guardar. Pedimos la permanente en segundo
                  // plano y la sustituimos si llega; si no, se persiste la temporal.
                  void resolvePermanentCoords(s.placeName, s.center).then((coords) => {
                    if (coords === s.center) return
                    const upgraded: RoutePlace = { ...place, coords }
                    setEndpoint((prev) =>
                      prev.selected?.kind === "city" && prev.selected.label === place.label
                        ? { ...prev, selected: upgraded }
                        : prev,
                    )
                    onCityCoordsUpgraded?.(upgraded)
                  })
                }}
              >
                <span className="font-medium text-foreground">{s.text}</span>
                {s.placeName !== s.text ? (
                  <span className="line-clamp-1 text-xs text-muted-foreground">{s.placeName}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {endpoint.selected ? (
        <p className="text-xs text-muted-foreground">Ubicación fijada.</p>
      ) : null}
      {endpoint.error ? <p className="text-xs text-destructive">{endpoint.error}</p> : null}
    </div>
  )
}

function usePlaceSuggest({
  endpoint,
  setEndpoint,
  debounceRef,
  abortRef,
  budgetRef,
  setSearchNotice,
}: {
  endpoint: EndpointState
  setEndpoint: React.Dispatch<React.SetStateAction<EndpointState>>
  debounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  abortRef: React.MutableRefObject<AbortController | null>
  budgetRef: React.MutableRefObject<PlaceSearchBudget>
  setSearchNotice: (msg: string | null) => void
}) {
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()

    // No buscar al montar con texto de hint: esperar a que el usuario enfoque o escriba.
    if (!endpoint.listOpen) {
      return
    }

    const q = endpoint.query.trim()
    if (endpoint.selected && q === endpoint.selected.label) {
      return
    }
    if (q.length < SUGGEST_MIN_CHARS) {
      return
    }
    if (!isPlaceSearchEnabled()) {
      setSearchNotice(PLACE_SEARCH_DISABLED_MESSAGE)
      return
    }

    debounceRef.current = setTimeout(() => {
      if (!canSpendSuggest(budgetRef.current)) {
        setSearchNotice(PLACE_SEARCH_BUDGET_MESSAGE)
        return
      }
      const ac = new AbortController()
      abortRef.current = ac
      budgetRef.current = recordSuggest(budgetRef.current)
      setEndpoint((s) => ({ ...s, loading: true }))
      void suggestPlaces(q, { limit: 6, signal: ac.signal })
        .then((list) => {
          if (ac.signal.aborted) return
          setEndpoint((s) => ({
            ...s,
            suggestions: list,
            loading: false,
          }))
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return
          if (err instanceof DOMException && err.name === "AbortError") return
          setEndpoint((s) => ({ ...s, suggestions: [], loading: false }))
        })
    }, SUGGEST_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint.query, endpoint.selected, endpoint.listOpen])
}
