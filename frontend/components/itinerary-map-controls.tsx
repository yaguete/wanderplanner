"use client"

/**
 * Cromo del mapa (dropdowns + preferencias) **sin** mapbox-gl.
 * El canvas GL vive en `itinerary-map-view.tsx` y se carga con `next/dynamic`
 * al pasar a Mapa: si esto se importara desde ahí, Lista pagaría 1.7 MB de parseo.
 */
import { useRef } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const MAP_MODE_KEY = "wp-map-mode"
const PLACES_LINE_STYLE_KEY = "wp-map-places-line"

export type MapViewMode = "transport" | "places"
export type PlacesLineStyle = "straight" | "road"

const MAP_MODE_LABELS: Record<MapViewMode, string> = {
  places: "Recorrido",
  transport: "Desplazamientos",
}

const PLACES_LINE_STYLE_LABELS: Record<PlacesLineStyle, string> = {
  straight: "Línea recta",
  road: "Ajustar a carretera",
}

/** Preferencia guardada; por defecto Recorrido. Seguro en SSR (sin localStorage). */
export function readStoredMapMode(): MapViewMode {
  if (typeof window === "undefined") return "places"
  try {
    const v = localStorage.getItem(MAP_MODE_KEY)
    if (v === "transport") return "transport"
    if (v === "places") return "places"
    return "places"
  } catch {
    return "places"
  }
}

export function persistMapMode(mode: MapViewMode): void {
  try {
    localStorage.setItem(MAP_MODE_KEY, mode)
  } catch {
    // ignore
  }
}

export function readStoredPlacesLineStyle(): PlacesLineStyle {
  if (typeof window === "undefined") return "straight"
  try {
    return localStorage.getItem(PLACES_LINE_STYLE_KEY) === "road" ? "road" : "straight"
  } catch {
    return "straight"
  }
}

export function persistPlacesLineStyle(style: PlacesLineStyle): void {
  try {
    localStorage.setItem(PLACES_LINE_STYLE_KEY, style)
  } catch {
    // ignore
  }
}

/** Trazado del recorrido: línea recta o carretera. Mismo cromo que Recorrido. */
export function PlacesLineStyleDropdown({
  value,
  loading = false,
  title,
  onChange,
}: {
  value: PlacesLineStyle
  loading?: boolean
  title?: string
  onChange: (next: PlacesLineStyle) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors",
            "text-muted-foreground hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label="Trazado del recorrido"
          title={title}
        >
          {loading ? "Calculando…" : PLACES_LINE_STYLE_LABELS[value]}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10.5rem]">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => {
            if (v === "straight" || v === "road") onChange(v)
          }}
        >
          <DropdownMenuRadioItem value="straight" className="text-xs">
            {PLACES_LINE_STYLE_LABELS.straight}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="road" className="text-xs">
            {PLACES_LINE_STYLE_LABELS.road}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Dropdown de modo del mapa (mismo cromo que Cancelabilidad). */
export function MapModeDropdown({
  value,
  onChange,
}: {
  value: MapViewMode
  onChange: (next: MapViewMode) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors",
            "text-muted-foreground hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label="Modo del mapa"
        >
          {MAP_MODE_LABELS[value]}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10.5rem]">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => {
            if (v === "places" || v === "transport") onChange(v)
          }}
        >
          <DropdownMenuRadioItem value="places" className="text-xs">
            Recorrido
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="transport" className="text-xs">
            Desplazamientos
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type MapDayOption = {
  id: string
  dayNumber: number
  heading: string
  mappableCount: number
}

const MAP_DAY_ALL = "all"

/** Dropdown de día de la ruta (lista y mapa; mismo cromo que Recorrido / Desplazamientos). */
export function MapDayDropdown({
  days,
  value,
  onChange,
  ariaLabel = "Filtrar por día",
}: {
  days: MapDayOption[]
  value: string | null
  onChange: (next: string | null) => void
  ariaLabel?: string
}) {
  const selected = days.find((d) => d.id === value)
  const triggerLabel = selected ? `Día ${selected.dayNumber}` : "Ruta completa"
  const radioValue = value ?? MAP_DAY_ALL
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return
        requestAnimationFrame(() => {
          const checked = contentRef.current?.querySelector<HTMLElement>(
            '[role="menuitemradio"][data-state="checked"]',
          )
          if (!checked) return
          checked.focus()
          checked.scrollIntoView({ block: "center" })
        })
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors",
            "text-muted-foreground hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={ariaLabel}
        >
          {triggerLabel}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={contentRef}
        align="start"
        className="max-h-[min(60vh,22rem)] max-w-[min(22rem,80vw)] overflow-y-auto"
      >
        <DropdownMenuRadioGroup
          value={radioValue}
          onValueChange={(v) => onChange(v === MAP_DAY_ALL ? null : v)}
        >
          <DropdownMenuRadioItem value={MAP_DAY_ALL} className="text-xs">
            Ruta completa
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {days.map((day) => (
            <DropdownMenuRadioItem
              key={day.id}
              value={day.id}
              title={day.heading}
              className={cn("text-xs", day.mappableCount === 0 && "opacity-60")}
            >
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="min-w-0 truncate">{day.heading}</span>
                <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground">
                  {day.mappableCount}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type ItineraryMapPoint = {
  id: string
  name: string
  type: "stay" | "activity" | "food" | "hub" | "endpoint"
  dayNumber: number
  region?: string | null
  coords?: { lng: number; lat: number } | null
  /** Solo hubs: llegada (fin de ida) o salida (inicio de vuelta). */
  hubRole?: "arrival" | "departure"
  /** Vértices de apertura/cierre de un stay con spanDays. */
  spanRole?: "open" | "close"
  spanAnchorId?: string
}
