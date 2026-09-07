"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react"
import { Loader2, MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { isMobileViewport } from "@/hooks/use-mobile"
import {
  resolvePermanentCoords,
  retrievePlace,
  seedGeocodeCache,
  suggestPlacesResult,
  suggestPlacesSession,
  type LngLat,
  type PlaceSuggestion,
} from "@/lib/mapbox"
import {
  bboxForAnchor,
  coordInAnchorZone,
  displayLabelForPurpose,
  emptyScopeMessage,
  newPlaceSearchSession,
  postalAddressFromSuggestion,
  recordSessionSuggest,
  sessionNeedsRotation,
  type PlaceSearchAnchor,
  type PlaceSearchPurpose,
  type PlaceSearchScope,
  type PlaceSearchSession,
} from "@/lib/place-search-purpose"
import {
  canSpendSuggest,
  canStartSession,
  isPlaceSearchEnabled,
  PLACE_SEARCH_BUDGET_MESSAGE,
  PLACE_SEARCH_DISABLED_MESSAGE,
  recordRetrieve,
  recordSession,
  recordSuggest,
  type PlaceSearchBudget,
} from "@/lib/place-search-guardrails"

const SUGGEST_DEBOUNCE_MS = 300
const SUGGEST_MIN_CHARS = 3

export type SelectedPlace = {
  label: string
  coords: LngLat
  id?: string
  name?: string
  address?: string
  featureType?: string
  countryCode?: string | null
  bbox?: PlaceSearchAnchor["bbox"]
}

export function PlaceSuggestInput({
  id,
  label,
  value,
  onValueChange,
  selected,
  onSelect,
  placeholder,
  proximity,
  countryCodes,
  autoFocus = false,
  hint,
  purpose = "site",
  anchor = null,
  scope = "anchored",
  onScopeChange,
  required = false,
  error = null,
  budgetRef,
  onBudgetNotice,
  sessionRef: sessionRefProp,
  externalSuggestions,
  onExternalSuggestionsConsumed,
  enabled = true,
  onResolvedAnchor,
  showFixedHint = false,
  autoOpenExternal = true,
}: {
  id: string
  label: string
  value: string
  onValueChange: (next: string) => void
  selected: SelectedPlace | null
  onSelect: (place: SelectedPlace) => void
  placeholder: string
  proximity: [number, number] | null
  countryCodes: string[]
  autoFocus?: boolean
  hint?: ReactNode
  purpose?: PlaceSearchPurpose
  anchor?: PlaceSearchAnchor | null
  scope?: PlaceSearchScope
  onScopeChange?: (scope: PlaceSearchScope) => void
  required?: boolean
  error?: string | null
  budgetRef?: MutableRefObject<PlaceSearchBudget>
  onBudgetNotice?: (msg: string | null) => void
  sessionRef?: MutableRefObject<PlaceSearchSession | null>
  externalSuggestions?: PlaceSuggestion[] | null
  onExternalSuggestionsConsumed?: () => void
  enabled?: boolean
  onResolvedAnchor?: (anchor: PlaceSearchAnchor) => void
  showFixedHint?: boolean
  /** Si hay `externalSuggestions` y el campo está vacío, abrir el listado. */
  autoOpenExternal?: boolean
}) {
  const listId = useId()
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [fieldActive, setFieldActive] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [status, setStatus] = useState<"idle" | "empty" | "error" | "out-of-zone">("idle")
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blurRef = useRef<number | null>(null)
  const proximityRef = useRef(proximity)
  proximityRef.current = proximity
  const genRef = useRef(0)
  const internalSession = useRef<PlaceSearchSession | null>(null)
  const sessionRef = sessionRefProp ?? internalSession
  const internalBudget = useRef<PlaceSearchBudget | null>(null)
  const [outOfZoneLabel, setOutOfZoneLabel] = useState<string | null>(null)

  const spendBudget = (): PlaceSearchBudget | null => {
    if (budgetRef) return budgetRef.current
    if (!internalBudget.current) {
      internalBudget.current = {
        suggests: 0,
        sessions: 0,
        retrieves: 0,
        hubs: 0,
        maxSuggests: Number.MAX_SAFE_INTEGER,
        maxSessions: Number.MAX_SAFE_INTEGER,
        maxHubs: Number.MAX_SAFE_INTEGER,
      }
    }
    return internalBudget.current
  }

  const writeBudget = (next: PlaceSearchBudget) => {
    if (budgetRef) budgetRef.current = next
    else internalBudget.current = next
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
      if (blurRef.current != null) window.clearTimeout(blurRef.current)
    }
  }, [])

  const proxKey = proximity
    ? `${proximity[0].toFixed(4)},${proximity[1].toFixed(4)}`
    : ""
  const countriesKey = countryCodes
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c))
    .join(",")
  const anchorKey = anchor?.id ?? ""
  const bboxKey = scope === "anywhere" ? "any" : (anchor ? String(bboxForAnchor(anchor)) : "")

  useEffect(() => {
    if (externalSuggestions && externalSuggestions.length > 0 && !value.trim()) {
      setSuggestions(externalSuggestions)
      setListOpen(autoOpenExternal)
      setStatus("idle")
      setHighlight(0)
    }
  }, [externalSuggestions, value, autoOpenExternal])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()

    if (!enabled || !fieldActive) {
      setSuggestLoading(false)
      return
    }

    const q = value.trim()
    if (selected && q === selected.label) {
      setSuggestions([])
      setSuggestLoading(false)
      return
    }
    if (q.length < SUGGEST_MIN_CHARS) {
      if (!(externalSuggestions && externalSuggestions.length > 0 && q.length === 0)) {
        setSuggestions([])
      }
      setSuggestLoading(false)
      if (q.length === 0 && !(externalSuggestions && externalSuggestions.length > 0)) {
        setStatus("idle")
      }
      return
    }

    const gen = ++genRef.current
    setSuggestLoading(true)
    setStatus("idle")
    debounceRef.current = setTimeout(() => {
      if (!isPlaceSearchEnabled()) {
        onBudgetNotice?.(PLACE_SEARCH_DISABLED_MESSAGE)
        setSuggestLoading(false)
        return
      }
      const budget = spendBudget()
      if (!budget || !canSpendSuggest(budget)) {
        onBudgetNotice?.(PLACE_SEARCH_BUDGET_MESSAGE)
        setSuggestLoading(false)
        return
      }
      const ac = new AbortController()
      abortRef.current = ac
      writeBudget(recordSuggest(budget))

      const useSession = purpose === "city" || purpose === "address" || purpose === "poi"
      const run = async () => {
        const common = {
          proximity: proximityRef.current,
          countryCodes: countriesKey ? countriesKey.split(",") : [],
          limit: 6,
          signal: ac.signal,
          purpose,
          bbox: scope === "anywhere" || !anchor ? null : bboxForAnchor(anchor),
          anchored: Boolean(anchor) && scope === "anchored",
          anywhere: scope === "anywhere",
        }
        if (!useSession) {
          return suggestPlacesResult(q, common)
        }
        let session = sessionRef.current
        if (sessionNeedsRotation(session)) {
          if (!canStartSession(spendBudget()!)) {
            onBudgetNotice?.(PLACE_SEARCH_BUDGET_MESSAGE)
            return { ok: false as const, reason: "disabled" as const }
          }
          session = newPlaceSearchSession()
          sessionRef.current = session
          writeBudget(recordSession(spendBudget()!))
        }
        sessionRef.current = recordSessionSuggest(session!)
        return suggestPlacesSession(q, sessionRef.current.token, common)
      }

      void run()
        .then((result) => {
          if (ac.signal.aborted || gen !== genRef.current) return
          setSuggestLoading(false)
          if (!result.ok) {
            if (result.reason === "aborted") return
            setSuggestions([])
            setStatus("error")
            setListOpen(true)
            return
          }
          setSuggestions(result.items)
          setHighlight(0)
          setStatus(result.items.length === 0 ? "empty" : "idle")
          setListOpen(true)
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted || gen !== genRef.current) return
          if (err instanceof DOMException && err.name === "AbortError") return
          setSuggestions([])
          setSuggestLoading(false)
          setStatus("error")
        })
    }, SUGGEST_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [
    value,
    countriesKey,
    selected,
    fieldActive,
    proxKey,
    purpose,
    anchorKey,
    bboxKey,
    scope,
    enabled,
  ])

  const applyRetrieved = (
    suggestion: PlaceSuggestion,
    retrieved: {
      id: string
      text: string
      placeName: string
      featureType: string
      center: LngLat
      countryCode: string | null
      bbox: PlaceSearchAnchor["bbox"]
    },
    gen: number,
  ) => {
    if (scope === "anchored" && anchor && !coordInAnchorZone(retrieved.center, anchor)) {
      setOutOfZoneLabel(retrieved.text)
      setStatus("out-of-zone")
      setResolving(false)
      return
    }
    const address = postalAddressFromSuggestion({
      text: retrieved.text,
      placeName: retrieved.placeName,
      featureType: retrieved.featureType,
      cityLabel: anchor?.label,
    })
    const label = displayLabelForPurpose(purpose, retrieved, anchor?.label)
    const place: SelectedPlace = {
      id: retrieved.id,
      label,
      name: retrieved.text,
      address,
      coords: retrieved.center,
      featureType: retrieved.featureType,
      countryCode: retrieved.countryCode,
      bbox: retrieved.bbox,
    }
    onSelect(place)
    if (purpose === "city") {
      onResolvedAnchor?.({
        id: retrieved.id,
        label: retrieved.text,
        featureType: retrieved.featureType,
        coords: retrieved.center,
        countryCode: retrieved.countryCode,
        bbox: retrieved.bbox,
      })
    }
    setSuggestions([])
    setListOpen(false)
    setResolving(false)
    onExternalSuggestionsConsumed?.()
    const codes = countryCodes.filter((c) => c.trim().length === 2)
    seedGeocodeCache(retrieved.placeName, retrieved.center, codes)
    void resolvePermanentCoords(retrieved.placeName, retrieved.center, {
      countryCodes: codes,
      proximity: [retrieved.center.lng, retrieved.center.lat],
    }).then((coords) => {
      if (gen !== genRef.current) return
      if (coords === retrieved.center) return
      onSelect({ ...place, coords })
    })
  }

  const handleSelect = (s: PlaceSuggestion) => {
    const gen = ++genRef.current
    setResolving(true)
    setStatus("idle")
    const budget = spendBudget()
    if (budget && s.provider === "searchbox" && !s.center) {
      writeBudget(recordRetrieve(budget))
    }
    void retrievePlace(s)
      .then((result) => {
        if (gen !== genRef.current) return
        if (!result.ok) {
          setResolving(false)
          setStatus("error")
          return
        }
        applyRetrieved(s, result.place, gen)
        if (s.provider === "searchbox") {
          sessionRef.current = newPlaceSearchSession()
        }
      })
      .catch(() => {
        if (gen !== genRef.current) return
        setResolving(false)
        setStatus("error")
      })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!listOpen || suggestions.length === 0) {
      if (e.key === "Escape") setListOpen(false)
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const pick = suggestions[highlight]
      if (pick) handleSelect(pick)
    } else if (e.key === "Escape") {
      e.preventDefault()
      setListOpen(false)
    }
  }

  const showEmpty = listOpen && status === "empty" && !suggestLoading
  const showError = listOpen && status === "error" && !suggestLoading
  const anchoredEmpty = showEmpty && scope === "anchored" && Boolean(anchor) && onScopeChange

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
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onFocus={() => {
            if (blurRef.current != null) {
              window.clearTimeout(blurRef.current)
              blurRef.current = null
            }
            setFieldActive(true)
            if (suggestions.length > 0) setListOpen(true)
          }}
          onBlur={() => {
            blurRef.current = window.setTimeout(() => {
              blurRef.current = null
              setListOpen(false)
              setFieldActive(false)
            }, 150)
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="pl-8"
          autoComplete="off"
          autoFocus={autoFocus && !isMobileViewport()}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listOpen && (suggestions.length > 0 || showEmpty || showError)}
          aria-controls={listId}
          aria-activedescendant={
            listOpen && suggestions[highlight] ? `${listId}-${suggestions[highlight]!.id}` : undefined
          }
        />
        {suggestLoading || resolving ? (
          <Loader2
            className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : null}
      </div>
      {listOpen && suggestions.length > 0 ? (
        <ul
          id={listId}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
          role="listbox"
        >
          {suggestions.map((s, i) => (
            <li key={s.id} id={`${listId}-${s.id}`} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted ${
                  i === highlight ? "bg-muted" : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => handleSelect(s)}
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
      {showEmpty ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-md">
          <p className="text-muted-foreground">
            {scope === "anchored" && anchor
              ? emptyScopeMessage(anchor.label)
              : "Sin resultados."}
          </p>
          {anchoredEmpty ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 h-7 px-2 text-[11px]"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onScopeChange?.("anywhere")
                setFieldActive(true)
                setStatus("idle")
              }}
            >
              Buscar en cualquier sitio
            </Button>
          ) : null}
        </div>
      ) : null}
      {showError ? (
        <p className="text-xs text-destructive" role="alert">
          No se pudieron cargar sugerencias. Puedes seguir escribiendo a mano.
        </p>
      ) : null}
      {status === "out-of-zone" && outOfZoneLabel ? (
        <p className="text-xs text-destructive" role="alert">
          «{outOfZoneLabel}» queda fuera de la zona de {anchor?.label}. Amplía la búsqueda o elige otro.
        </p>
      ) : null}
      {scope === "anywhere" && onScopeChange && anchor ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-0 text-[11px] text-muted-foreground"
          onClick={() => onScopeChange("anchored")}
        >
          Volver a la zona de {anchor.label}
        </Button>
      ) : null}
      {showFixedHint && selected && !error ? (
        <p className="text-xs text-muted-foreground">Ubicación fijada.</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {hint}
    </div>
  )
}
