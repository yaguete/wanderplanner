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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { isMobileViewport } from "@/hooks/use-mobile"
import { ITEM_LABELS, ITEM_TYPE_ICONS } from "@/lib/item-styles"
import { MANUAL_SOURCE_ID } from "@/lib/item-provenance"
import {
  geocodeFreeText,
  seedGeocodeCache,
  suggestPlaces,
  type GeocodeSuggestion,
  type LngLat,
} from "@/lib/mapbox"
import type { ItemType, UserDay, UserDayItem } from "@/types/itinerary"
import { getDayUserDescription } from "@/lib/day-heading"

const ITEM_TYPES: ItemType[] = ["activity", "stay", "food", "transport"]

const NAME_PLACEHOLDERS: Record<ItemType, string> = {
  activity: "p. ej. Crucero por el Danubio",
  stay: "p. ej. Hostel One Budapest",
  food: "p. ej. Restaurante Casa Paco",
  transport: "p. ej. Tren a Viena",
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
  onSubmit: (item: UserDayItem, dayId: string) => void
  /** Transporte delega al diálogo de ruta estructurada (T4B.3 §9.6). */
  onRequestTransport?: (dayId: string) => void
}

export function AddManualItemDialog({
  open,
  onOpenChange,
  days,
  initialDayId = null,
  initialType = null,
  countryCodes = [],
  destinationHint = null,
  onSubmit,
  onRequestTransport,
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

  const proximityRef = useRef<[number, number] | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const nameId = `${id}-name`
  const dayFieldId = `${id}-day`
  const placeId = `${id}-place`
  const detailId = `${id}-detail`

  useEffect(() => {
    if (!open) return
    setType(initialType ?? "activity")
    setName("")
    setDetail("")
    setPlaceQuery("")
    setSuggestions([])
    setSelectedPlace(null)
    setListOpen(false)
    setSuggestLoading(false)
    const preferred =
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

  const canSubmit = name.trim().length > 0 && dayId.length > 0 && days.some((d) => d.id === dayId)

  const handleSelectSuggestion = (s: GeocodeSuggestion) => {
    setSelectedPlace({ label: s.text, coords: s.center })
    setPlaceQuery(s.text)
    setSuggestions([])
    setListOpen(false)
    seedGeocodeCache(s.placeName, s.center, countryCodes)
  }

  const handlePlaceChange = (value: string) => {
    setPlaceQuery(value)
    setSelectedPlace(null)
    setListOpen(true)
  }

  const handleSubmit = () => {
    if (!canSubmit) return
    const item: UserDayItem = {
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
    onSubmit(item, dayId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullscreenOnMobile hideClose className="sm:max-w-md">
        <DialogHeader className="shrink-0 space-y-1.5 px-6 py-4 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Añadir ítem
          </DialogTitle>
          <DialogDescription>
            Añade a tu viaje elementos que no encuentras en tus fuentes.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 pb-10">
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
                      if (t === "transport" && onRequestTransport) {
                        const targetDay =
                          dayId ||
                          (initialDayId && days.some((d) => d.id === initialDayId) && initialDayId) ||
                          days[0]?.id ||
                          ""
                        if (targetDay) {
                          onRequestTransport(targetDay)
                          onOpenChange(false)
                          return
                        }
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

          <div className="space-y-2">
            <Label htmlFor={nameId}>Nombre</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={NAME_PLACEHOLDERS[type]}
              autoFocus={!isMobileViewport()}
            />
          </div>

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
                  if (suggestions.length > 0) setListOpen(true)
                }}
                onBlur={() => {
                  // Delay so click on suggestion registers.
                  window.setTimeout(() => setListOpen(false), 150)
                }}
                placeholder="p. ej. Budapest"
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
            {selectedPlace ? (
              <p className="text-xs text-muted-foreground">
                {type === "stay" || type === "activity"
                  ? "Ubicación fijada en el mapa."
                  : "Ubicación guardada."}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={dayFieldId}>Día</Label>
            <Select value={dayId} onValueChange={setDayId}>
              <SelectTrigger id={dayFieldId} className="w-full">
                <SelectValue placeholder="Elige un día" />
              </SelectTrigger>
              <SelectContent>
                {days.map((day, index) => {
                  const desc = getDayUserDescription(day.label)
                  const label = desc ? `Día ${index + 1} · ${desc}` : `Día ${index + 1}`
                  return (
                    <SelectItem key={day.id} value={day.id}>
                      {label}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={detailId}>Nota (opcional)</Label>
            <Input
              id={detailId}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Horario, reserva, tip…"
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            Añadir al plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
