"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
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
import { isMobileViewport } from "@/hooks/use-mobile"
import {
  geocodeRegionAnchor,
  haversineKm,
  resolvePermanentCoords,
  seedGeocodeCache,
  suggestPlacesResult,
  type GeocodeSuggestion,
  type LngLat,
} from "@/lib/mapbox"
import {
  rankPlaceSuggestions,
  type PlaceSuggestKind,
} from "@/lib/place-suggest-rank"
import {
  bboxForAnchor,
  emptyScopeMessage,
  type PlaceSearchAnchor,
  type PlaceSearchScope,
} from "@/lib/place-search-purpose"
import { formatKm } from "@/lib/map-route-geometry"
import { getCountryByCode } from "@/lib/countries"

const SUGGEST_DEBOUNCE_MS = 300
const SUGGEST_MIN_CHARS = 3

export type AdjustLocationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  itemType?: PlaceSuggestKind
  proximity?: [number, number] | null
  countryCodes?: string[]
  destinationHint?: string | null
  onConfirm: (place: { label: string; coords: LngLat }) => void
}

export function AdjustLocationDialog({
  open,
  onOpenChange,
  itemName,
  itemType = "activity",
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
  const [saving, setSaving] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<{
    label: string
    coords: LngLat
  } | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [scope, setScope] = useState<PlaceSearchScope>("anchored")
  const [destAnchor, setDestAnchor] = useState<PlaceSearchAnchor | null>(null)
  const [status, setStatus] = useState<"idle" | "empty" | "error">("idle")
  const genRef = useRef(0)

  const proximityRef = useRef<[number, number] | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countriesKey = useMemo(
    () =>
      countryCodes
        .map((c) => c.trim().toLowerCase())
        .filter((c) => c.length === 2)
        .sort()
        .join(","),
    [countryCodes],
  )

  useEffect(() => {
    if (!open) return
    setPlaceQuery(itemName)
    setSuggestions([])
    setSelectedPlace(null)
    setListOpen(false)
    setSuggestLoading(false)
    setSaving(false)
    setScope("anchored")
    setStatus("idle")
    setDestAnchor(null)
    genRef.current += 1
    proximityRef.current = proximity
    const dest = destinationHint?.trim()
    const codes = countriesKey ? countriesKey.split(",") : []
    if (dest) {
      void geocodeRegionAnchor(dest, {
        countryCodes: codes.length ? codes : undefined,
      }).then((anchor) => {
        if (!anchor) return
        const next: PlaceSearchAnchor = {
          id: `dest:${dest}`,
          label: dest,
          featureType: anchor.featureType,
          coords: anchor.coord,
          countryCode: null,
          bbox: null,
        }
        setDestAnchor(next)
        if (!proximityRef.current) {
          proximityRef.current = [anchor.coord.lng, anchor.coord.lat]
        }
      })
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
    setStatus("idle")
    const gen = ++genRef.current
    debounceRef.current = setTimeout(() => {
      const ac = new AbortController()
      abortRef.current = ac
      const codes = countriesKey ? countriesKey.split(",") : []
      void suggestPlacesResult(q, {
        proximity: proximityRef.current,
        countryCodes: scope === "anywhere" ? undefined : (codes.length ? codes : undefined),
        limit: 6,
        signal: ac.signal,
        purpose: "site",
        bbox: scope === "anchored" && destAnchor ? bboxForAnchor(destAnchor) : null,
        anchored: scope === "anchored" && Boolean(destAnchor),
        anywhere: scope === "anywhere",
      })
        .then((result) => {
          if (ac.signal.aborted || gen !== genRef.current) return
          if (!result.ok) {
            if (result.reason === "aborted") return
            setSuggestions([])
            setStatus("error")
            setSuggestLoading(false)
            setListOpen(true)
            return
          }
          const withCenter = result.items.filter((s): s is GeocodeSuggestion => s.center != null)
          setSuggestions(rankPlaceSuggestions(withCenter, q, itemType))
          setStatus(withCenter.length === 0 ? "empty" : "idle")
          setListOpen(true)
          setSuggestLoading(false)
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
  }, [placeQuery, open, countriesKey, selectedPlace, itemType, scope, destAnchor])

  const codesForResolve = countriesKey ? countriesKey.split(",") : []

  const handleSelectSuggestion = (s: GeocodeSuggestion) => {
    const gen = ++genRef.current
    setSelectedPlace({ label: s.text, coords: s.center })
    setPlaceQuery(s.text)
    setSuggestions([])
    setListOpen(false)
    seedGeocodeCache(s.placeName, s.center, codesForResolve)
    void resolvePermanentCoords(s.placeName, s.center, { countryCodes: codesForResolve }).then(
      (coords) => {
        if (gen !== genRef.current) return
        if (coords === s.center) return
        setSelectedPlace((prev) => (prev?.label === s.text ? { ...prev, coords } : prev))
      },
    )
  }

  const canSave =
    Boolean(selectedPlace) || placeQuery.trim().length >= SUGGEST_MIN_CHARS

  const handleSubmit = () => {
    if (selectedPlace) {
      onConfirm(selectedPlace)
      onOpenChange(false)
      return
    }
    const q = placeQuery.trim()
    if (q.length < SUGGEST_MIN_CHARS || saving) return
    setSaving(true)
    const submitGen = ++genRef.current
    const codes = codesForResolve.length ? codesForResolve : undefined
    void suggestPlacesResult(q, {
      proximity: proximityRef.current,
      countryCodes: codes,
      limit: 6,
      purpose: "site",
      bbox: scope === "anchored" && destAnchor ? bboxForAnchor(destAnchor) : null,
      anchored: scope === "anchored" && Boolean(destAnchor),
      anywhere: scope === "anywhere",
    })
      .then(async (result) => {
        if (submitGen !== genRef.current) return
        if (!result.ok) {
          setStatus("error")
          return
        }
        const ranked = rankPlaceSuggestions(
          result.items.filter((s): s is GeocodeSuggestion => s.center != null),
          q,
          itemType,
        )
        const first = ranked[0]
        if (!first) {
          setStatus("empty")
          return
        }
        const coords = await resolvePermanentCoords(first.placeName, first.center, {
          countryCodes: codes,
        })
        if (submitGen !== genRef.current) return
        onConfirm({ label: first.text, coords })
        onOpenChange(false)
      })
      .finally(() => {
        setSaving(false)
      })
  }

  const pinLngLat: LngLat | null = proximity
    ? { lng: proximity[0], lat: proximity[1] }
    : proximityRef.current
      ? { lng: proximityRef.current[0], lat: proximityRef.current[1] }
      : null

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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder="p. ej. Alhambra, Granada"
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
                className="max-h-48 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
                role="listbox"
              >
                {suggestions.map((s) => {
                  const km = pinLngLat ? haversineKm(pinLngLat, s.center) : null
                  const subtitle = suggestionPlaceSubtitle(s)
                  return (
                    <li key={s.id} role="option">
                      <button
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectSuggestion(s)}
                      >
                        <span className="flex w-full items-baseline justify-between gap-2">
                          <span className="font-medium text-foreground">{s.text}</span>
                          {km != null ? (
                            <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                              {formatKm(km)}
                            </span>
                          ) : null}
                        </span>
                        {subtitle ? (
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {subtitle}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
            {listOpen && status === "empty" && !suggestLoading ? (
              <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm">
                <p className="text-muted-foreground">
                  {scope === "anchored" && destAnchor
                    ? emptyScopeMessage(destAnchor.label)
                    : "Sin resultados."}
                </p>
                {scope === "anchored" && destAnchor ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 px-2 text-[11px]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setScope("anywhere")}
                  >
                    Buscar en cualquier sitio
                  </Button>
                ) : null}
              </div>
            ) : null}
            {listOpen && status === "error" && !suggestLoading ? (
              <p className="text-xs text-destructive" role="alert">
                No se pudieron cargar sugerencias. Puedes seguir escribiendo a mano.
              </p>
            ) : null}
            {scope === "anywhere" && destAnchor ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-0 text-[11px] text-muted-foreground"
                onClick={() => setScope("anchored")}
              >
                Volver a la zona de {destAnchor.label}
              </Button>
            ) : null}
            {selectedPlace ? (
              <p className="text-xs text-muted-foreground">Ubicación fijada en el mapa.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Escribe una dirección y pulsa Guardar, o elige una sugerencia.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSave || saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** País o place_name: distingue Granada (ES) de Grenada (GD) cuando el título es el mismo. */
function suggestionPlaceSubtitle(s: GeocodeSuggestion): string | null {
  if (s.placeName && s.placeName !== s.text) return s.placeName
  const code = s.countryCode?.trim()
  if (!code) return null
  const name = getCountryByCode(code.toUpperCase())?.name
  if (name && name.toLowerCase() !== s.text.toLowerCase()) return name
  try {
    const en = new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase())
    if (en && en.toLowerCase() !== s.text.toLowerCase()) return en
  } catch {
    // runtime sin DisplayNames
  }
  return code.toUpperCase()
}
