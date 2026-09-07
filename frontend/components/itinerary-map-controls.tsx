"use client"

/**
 * Cromo de Ruta (dropdowns + preferencias) **sin** mapbox-gl.
 * El canvas GL vive en `itinerary-map-view.tsx` y se carga con `next/dynamic`
 * al pasar a Mapa: si esto se importara desde ahí, Lista pagaría 1.7 MB de parseo.
 */
import { useRef } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ROUTE_ITEM_CATEGORIES,
  ROUTE_ITEM_CATEGORY_LABELS,
  allRouteItemCategoriesSelected,
  parseRouteItemFilter,
  routeItemFilterTriggerLabel,
  toggleAllRouteItemCategories,
  toggleRouteItemCategory,
  type RouteItemCategory,
} from "@/lib/route-item-filter"

const PLACES_LINE_STYLE_KEY = "wp-map-places-line"
const ROUTE_ITEM_FILTER_KEY = "wp-route-item-filter"

export type PlacesLineStyle = "straight" | "road"

export type { RouteItemCategory }

const PLACES_LINE_STYLE_LABELS: Record<PlacesLineStyle, string> = {
  straight: "Línea recta",
  road: "Ajustar a carretera",
}

/** Triggers de día / categoría / trazado: tinta de primer plano, no muted. */
const ROUTE_TOOLBAR_TRIGGER_CLASS = cn(
  "inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-xs font-semibold transition-colors",
  "text-foreground hover:text-foreground/70",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
)

export function readStoredRouteItemFilter(): RouteItemCategory[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(ROUTE_ITEM_FILTER_KEY)
    if (raw == null) return null
    return parseRouteItemFilter(JSON.parse(raw))
  } catch {
    return null
  }
}

export function persistRouteItemFilter(selected: readonly RouteItemCategory[]): void {
  try {
    localStorage.setItem(ROUTE_ITEM_FILTER_KEY, JSON.stringify(selected))
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

/** Trazado del recorrido: línea recta o carretera. */
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
          className={ROUTE_TOOLBAR_TRIGGER_CLASS}
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

/** Multiselector de categorías de la Ruta (lista y mapa). */
export function RouteItemFilterDropdown({
  value,
  onChange,
}: {
  value: ReadonlySet<RouteItemCategory>
  onChange: (next: Set<RouteItemCategory>) => void
}) {
  const allSelected = allRouteItemCategoriesSelected(value)
  const showAllState: boolean | "indeterminate" = allSelected
    ? true
    : value.size === 0
      ? false
      : "indeterminate"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={ROUTE_TOOLBAR_TRIGGER_CLASS}
          aria-label="Filtrar por categoría"
        >
          {routeItemFilterTriggerLabel(value)}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[12rem]">
        <DropdownMenuCheckboxItem
          checked={showAllState}
          onCheckedChange={() => onChange(toggleAllRouteItemCategories(value))}
          onSelect={(e) => e.preventDefault()}
          className="cursor-pointer text-xs"
        >
          Mostrar todo
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {ROUTE_ITEM_CATEGORIES.map((category) => (
          <DropdownMenuCheckboxItem
            key={category}
            checked={value.has(category)}
            onCheckedChange={() => onChange(toggleRouteItemCategory(value, category))}
            onSelect={(e) => e.preventDefault()}
            className="cursor-pointer text-xs"
          >
            {ROUTE_ITEM_CATEGORY_LABELS[category]}
          </DropdownMenuCheckboxItem>
        ))}
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

/** Dropdown de día de la ruta (lista y mapa). */
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
          className={ROUTE_TOOLBAR_TRIGGER_CLASS}
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
