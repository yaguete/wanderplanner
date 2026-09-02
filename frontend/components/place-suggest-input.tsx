"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Loader2, MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isMobileViewport } from "@/hooks/use-mobile"
import {
  resolvePermanentCoords,
  seedGeocodeCache,
  suggestPlaces,
  type GeocodeSuggestion,
  type LngLat,
} from "@/lib/mapbox"

const SUGGEST_DEBOUNCE_MS = 300
const SUGGEST_MIN_CHARS = 3

export type SelectedPlace = {
  label: string
  coords: LngLat
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
}) {
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [fieldActive, setFieldActive] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blurRef = useRef<number | null>(null)
  const proximityRef = useRef(proximity)
  proximityRef.current = proximity
  const selectGenRef = useRef(0)

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

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()

    if (!fieldActive) {
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
  }, [value, countryCodes, selected, fieldActive, proxKey])

  const handleSelect = (s: GeocodeSuggestion) => {
    const gen = ++selectGenRef.current
    onSelect({ label: s.text, coords: s.center })
    setSuggestions([])
    setListOpen(false)
    seedGeocodeCache(s.placeName, s.center, countryCodes)
    void resolvePermanentCoords(s.placeName, s.center, { countryCodes }).then((coords) => {
      if (gen !== selectGenRef.current) return
      if (coords === s.center) return
      onSelect({ label: s.text, coords })
    })
  }

  return (
    <div className="relative space-y-2">
      <Label htmlFor={id}>{label}</Label>
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
          }}
          onBlur={() => {
            blurRef.current = window.setTimeout(() => {
              blurRef.current = null
              setListOpen(false)
              setFieldActive(false)
            }, 150)
          }}
          placeholder={placeholder}
          className="pl-8"
          autoComplete="off"
          autoFocus={autoFocus && !isMobileViewport()}
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
      {hint}
    </div>
  )
}
