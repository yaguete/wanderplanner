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
import {
  geocodeFreeText,
  seedGeocodeCache,
  suggestPlaces,
  type GeocodeSuggestion,
  type LngLat,
} from "@/lib/mapbox"

const SUGGEST_DEBOUNCE_MS = 300
const SUGGEST_MIN_CHARS = 3

export type AdjustLocationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  proximity?: [number, number] | null
  countryCodes?: string[]
  destinationHint?: string | null
  onConfirm: (place: { label: string; coords: LngLat }) => void
}

export function AdjustLocationDialog({
  open,
  onOpenChange,
  itemName,
  proximity = null,
  countryCodes = [],
  destinationHint = null,
  onConfirm,
}: AdjustLocationDialogProps) {
  const id = useId()
  const placeId = `${id}-place`
  const [placeQuery, setPlaceQuery] = useState("")
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<{
    label: string
    coords: LngLat
  } | null>(null)
  const [listOpen, setListOpen] = useState(false)

  const proximityRef = useRef<[number, number] | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    setPlaceQuery(itemName)
    setSuggestions([])
    setSelectedPlace(null)
    setListOpen(false)
    setSuggestLoading(false)
    proximityRef.current = proximity
    if (!proximity) {
      const dest = destinationHint?.trim()
      const codes = countryCodes.filter((c) => c.trim().length === 2)
      if (dest) {
        void geocodeFreeText(dest, { countryCodes: codes.length ? codes : undefined }).then((p) => {
          proximityRef.current = p
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open
  }, [open])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()

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
  }, [placeQuery, open, countryCodes, selectedPlace])

  const handleSelectSuggestion = (s: GeocodeSuggestion) => {
    setSelectedPlace({ label: s.text, coords: s.center })
    setPlaceQuery(s.text)
    setSuggestions([])
    setListOpen(false)
    seedGeocodeCache(s.placeName, s.center, countryCodes)
  }

  const handleSubmit = () => {
    if (!selectedPlace) return
    onConfirm(selectedPlace)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullscreenOnMobile hideClose className="sm:max-w-md">
        <DialogHeader className="shrink-0 space-y-1.5 px-6 py-4 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Ajustar ubicación
          </DialogTitle>
          <DialogDescription>
            Elige el sitio real de {itemName}. Quedará fijado en el mapa.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 pb-10">
          <div className="relative space-y-2">
            <Label htmlFor={placeId}>Lugar o dirección</Label>
            <div className="relative">
              <MapPin
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id={placeId}
                value={placeQuery}
                onChange={(e) => {
                  setPlaceQuery(e.target.value)
                  setSelectedPlace(null)
                  setListOpen(true)
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setListOpen(true)
                }}
                onBlur={() => {
                  window.setTimeout(() => setListOpen(false), 150)
                }}
                placeholder="p. ej. Hofkirche, Innsbruck"
                className="pl-8"
                autoComplete="off"
                autoFocus
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
                className="max-h-48 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
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
              <p className="text-xs text-muted-foreground">Ubicación fijada en el mapa.</p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="shrink-0 bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!selectedPlace}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
