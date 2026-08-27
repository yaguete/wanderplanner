"use client"

/**
 * Mapa del itinerario: dos modos excluyentes.
 * - Desplazamientos: tramos de transporte + anclas de ida/vuelta (T4B.3 §9.12).
 * - Recorrido: lugares (stay/food/activity) en orden, geodésica por defecto.
 * Ciclo de vida: el mapa se instancia una vez; fuentes/marcadores se actualizan.
 */
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePaintTheme } from "@/hooks/use-resolved-theme"
import {
  MAP_STYLE_URL,
  pinPaint,
  placesRouteColor,
  type PaintTheme,
} from "@/lib/item-paint"
import { collectCountryCodesFromHint, getCountryByCode } from "@/lib/countries"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  geocodeName,
  geocodeRegionAnchor,
  getDirections,
  MAPBOX_TOKEN,
  searchPlaceCandidates,
  type LngLat,
} from "@/lib/mapbox"
import {
  geocodeDisplayResult,
  reduceGeocode,
  type GeocodePoint,
  type GeocodeResolved,
  type GeocodeState,
} from "@/lib/map-geocode-state"
import {
  offsetStackedApproximate,
  pickGeocodeOutcome,
  type RegionAnchor,
} from "@/lib/geocode-validate"
import { isIndependentRegionHint } from "@/lib/map-destination"
import { filterByDayScope, type DayScope } from "@/lib/map-day-scope"
import {
  buildPlacesRoute,
  formatKm,
  groupRoadCandidateSubsequences,
  modeAllowsRoadDirections,
  placesRouteToFeatureCollections,
  segmentsToFeatureCollection,
  summarizeTransportKm,
  summarizeUndrawnTransports,
  type ItineraryMapSegment,
  type ItineraryPlace,
  type IncompleteMapTransport,
  type PlacesRouteLeg,
  type TransportDistances,
} from "@/lib/map-route-geometry"
import { routeModeLabel } from "@/lib/route-legs"
import type { RouteMode } from "@/types/itinerary"
import { AdjustLocationDialog } from "@/components/adjust-location-dialog"

mapboxgl.accessToken = MAPBOX_TOKEN

const MAP_MODE_KEY = "wp-map-mode"
/** Recorrido: geodésica vs Directions. */
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
}

export type { ItineraryMapSegment }

function pinShapeSvg(type: ItineraryMapPoint["type"], fill: string, stroke: string, dashed: boolean): string {
  const dash = dashed ? ` stroke-dasharray="3 2"` : ""
  const opacity = dashed ? ` fill-opacity="0.7"` : ""
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="2"${dash}${opacity}`
  if (type === "stay") {
    return `<rect x="2.5" y="2.5" width="23" height="23" rx="5" ${common} />`
  }
  if (type === "food") {
    return `<path d="M14 3.5 L26.5 25 H1.5 Z" stroke-linejoin="round" ${common} />`
  }
  return `<circle cx="14" cy="14" r="12" ${common} />`
}

function renderPinInto(
  el: HTMLElement,
  type: ItineraryMapPoint["type"],
  pinText: string,
  approximate: boolean,
  theme: PaintTheme,
): void {
  const sig = `${type}|${pinText}|${approximate ? "a" : "e"}|${theme}`
  if (el.dataset.pinSig === sig) return
  el.dataset.pinSig = sig
  const colors = pinPaint(type, theme)
  const isEndpoint = type === "endpoint"
  el.className = cn(
    "wp-map-pin relative flex items-center justify-center font-bold text-white",
    isEndpoint ? "h-3.5 w-3.5" : "h-7 w-7",
    pinText.length > 1 ? "text-[10px]" : "text-[12px]",
  )
  el.style.filter = "drop-shadow(0 1px 2px rgb(0 0 0 / .28))"
  el.style.background = "transparent"
  el.style.border = "none"
  const shape = pinShapeSvg(type, colors.fill, colors.border, approximate && !isEndpoint)
  const view = isEndpoint ? "0 0 14 14" : "0 0 28 28"
  const svgClass = "absolute inset-0 h-full w-full"
  const textShift = type === "food" && pinText ? " style=\"transform:translateY(3px)\"" : ""
  const label = pinText
    ? `<span class="relative leading-none"${textShift}>${escapeHtml(pinText)}</span>`
    : ""
  el.innerHTML = `<svg class="${svgClass}" viewBox="${view}" aria-hidden="true">${
    isEndpoint
      ? `<circle cx="7" cy="7" r="5.5" fill="${colors.fill}" stroke="${colors.border}" stroke-width="2" />`
      : shape
  }</svg>${label}`
}

function popupHtml(name: string, label: string, opts?: { adjustId?: string }): string {
  const adjust = opts?.adjustId
    ? `<button type="button" class="wp-map-popup-adjust" data-wp-adjust="${escapeHtml(opts.adjustId)}">haz click para ajustar ubicación</button>`
    : ""
  return `<div class="max-w-[15rem]"><span class="block text-sm text-popover-foreground">${escapeHtml(
    name,
  )}</span><span class="block text-xs text-muted-foreground">${escapeHtml(label)}</span>${adjust}</div>`
}

function pinAriaLabel(name: string, dayNumber: number): string {
  return `${name} — Día ${dayNumber}`
}

function emptySourceData(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] }
}

function setSourceData(
  map: mapboxgl.Map,
  sourceId: string,
  data: GeoJSON.FeatureCollection,
) {
  const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
  if (source) source.setData(data)
}

function ensureMapLayers(map: mapboxgl.Map) {
  if (!map.getSource("transport-segments")) {
    map.addSource("transport-segments", { type: "geojson", data: emptySourceData() })
  }
  if (!map.getSource("places-route")) {
    map.addSource("places-route", { type: "geojson", data: emptySourceData() })
  }
  if (!map.getSource("places-route-long")) {
    map.addSource("places-route-long", { type: "geojson", data: emptySourceData() })
  }

  if (!map.getLayer("transport-segments-line")) {
    map.addLayer({
      id: "transport-segments-line",
      type: "line",
      source: "transport-segments",
      layout: {
        "line-cap": "round",
        "line-join": "round",
        // Recorrido es el modo por defecto.
        visibility: "none",
      },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["get", "width"],
        "line-opacity": 0.9,
        "line-dasharray": [
          "case",
          ["==", ["get", "dash"], ""],
          ["literal", [1, 0]],
          [
            "case",
            ["==", ["get", "mode"], "flight"],
            ["literal", [2, 2]],
            ["==", ["get", "mode"], "train"],
            ["literal", [4, 2]],
            ["==", ["get", "mode"], "bus"],
            ["literal", [1.5, 1.5]],
            ["==", ["get", "mode"], "ferry"],
            ["literal", [3, 2]],
            ["literal", [1, 2]],
          ],
        ],
      },
    })
  }

  if (!map.getLayer("places-route-line")) {
    map.addLayer({
      id: "places-route-line",
      type: "line",
      source: "places-route",
      layout: {
        "line-cap": "round",
        "line-join": "round",
        visibility: "visible",
      },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["get", "width"],
        "line-opacity": 0.9,
      },
    })
  }

  if (!map.getLayer("places-route-long-line")) {
    map.addLayer({
      id: "places-route-long-line",
      type: "line",
      source: "places-route-long",
      layout: {
        "line-cap": "round",
        "line-join": "round",
        visibility: "visible",
      },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["get", "width"],
        "line-opacity": 0.75,
        "line-dasharray": [2, 2],
      },
    })
  }
}

function asGeocodePoint(p: ItineraryMapPoint): GeocodePoint {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    dayNumber: p.dayNumber,
    region: p.region,
    coords: p.coords,
    hubRole: p.hubRole,
  }
}

function pinCoord(r: GeocodeResolved): LngLat {
  return r.displayCoord ?? r.coord
}

function mappableItemType(
  t: ItineraryMapPoint["type"] | undefined,
): "stay" | "activity" | "food" | null {
  if (t === "stay" || t === "activity" || t === "food") return t
  return null
}

export function ItineraryMapView({
  places,
  hubs = [],
  segments = [],
  transportDistances,
  destination,
  countryCodes = [],
  mapMode,
  focusDayNumber = null,
  focusDayLabel = null,
  onMapModeChange,
  onPersistItemCoords,
  incompleteTransports = [],
  onFixTransport,
  placesLineStyle = "straight",
  onPlacesLineStyleChange,
  onPlacesLineLoadingChange,
}: {
  /** Lugares del recorrido: stay / food / activity (sin hubs). Viaje entero. */
  places: ItineraryMapPoint[]
  /** Anclas de llegada/salida para el modo Desplazamientos (ya filtradas). */
  hubs?: ItineraryMapPoint[]
  segments?: ItineraryMapSegment[]
  transportDistances: TransportDistances
  destination: string
  countryCodes?: string[]
  /** Modo controlado desde el panel (dropdown junto a Lista · Calendario · Mapa). */
  mapMode: MapViewMode
  /** Día 1-based, o null = ruta completa. */
  focusDayNumber?: DayScope
  /** Etiqueta corta para el overlay vacío, p. ej. "Día 5". */
  focusDayLabel?: string | null
  onMapModeChange?: (next: MapViewMode) => void
  /** Guarda coords en el ítem (salida de «Ajustar ubicación»). No pisa `region`. */
  onPersistItemCoords?: (itemId: string, coords: LngLat) => void
  incompleteTransports?: IncompleteMapTransport[]
  onFixTransport?: (item: IncompleteMapTransport) => void
  /** Trazado del recorrido (controlado desde el panel). */
  placesLineStyle?: PlacesLineStyle
  onPlacesLineStyleChange?: (next: PlacesLineStyle) => void
  onPlacesLineLoadingChange?: (loading: boolean) => void
}) {
  const mapTheme = usePaintTheme()
  const mapStyleRef = useRef<string>(MAP_STYLE_URL[mapTheme])
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const markersByIdRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const popupDataByIdRef = useRef<
    Map<
      string,
      {
        name: string
        label: string
        adjustable?: boolean
        itemType?: "stay" | "activity" | "food"
      }
    >
  >(new Map())
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null)
  const hoverOpenIdRef = useRef<string | null>(null)
  const hoverCloseTimerRef = useRef<number | null>(null)
  /** Elemento al que están los listeners del bocadillo. `remove()` lo destruye. */
  const popupChromeElRef = useRef<HTMLElement | null>(null)
  const adjustingSetterRef = useRef<
    (
      next: {
        id: string
        name: string
        itemType: "stay" | "activity" | "food"
      } | null,
    ) => void
  >(() => {})
  const [adjusting, setAdjusting] = useState<{
    id: string
    name: string
    itemType: "stay" | "activity" | "food"
  } | null>(null)
  adjustingSetterRef.current = setAdjusting
  const finePointerRef = useRef(false)
  const coordCacheRef = useRef<
    Map<string, { coord: LngLat; precision: "exact" | "approximate"; anchorLabel?: string }>
  >(new Map())
  const mapReadyRef = useRef(false)
  const fittedSignatureRef = useRef<string | null>(null)
  const geocodeRef = useRef<GeocodeState>({ status: "idle" })

  const visiblePlaces = useMemo(
    () => filterByDayScope(places, focusDayNumber),
    [places, focusDayNumber],
  )
  const placesKey = visiblePlaces.map((p) => p.id).join(",")
  const placesContentKey = places
    .map(
      (p) =>
        `${p.id}:${p.name}:${p.coords?.lng ?? ""}:${p.coords?.lat ?? ""}:${p.region ?? ""}`,
    )
    .join("|")
  const countriesKey = [...countryCodes]
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length === 2)
    .sort()
    .join(",")
  const destinationKey = destination.trim()
  /** Clave estable de contenido: evita re-geocodificar por identidad de array. */
  const geocodeInputKey = `${placesContentKey}::${countriesKey}::${destinationKey}`

  const hubsKey = hubs.map((p) => p.id).join(",")
  const segmentsKey = segments
    .map((s) => `${s.itemId}:${s.mode}:${s.from.lng},${s.from.lat}:${s.to.lng},${s.to.lat}`)
    .join("|")

  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [geocode, dispatchGeocode] = useReducer(reduceGeocode, { status: "idle" } as GeocodeState)
  const [roadOverride, setRoadOverride] = useState<Record<string, GeoJSON.LineString>>({})
  const [roadLoadingId, setRoadLoadingId] = useState<string | null>(null)
  const [placesRoadGeometry, setPlacesRoadGeometry] =
    useState<GeoJSON.FeatureCollection<GeoJSON.LineString> | null>(null)
  const [placesRoadKm, setPlacesRoadKm] = useState<number | null>(null)
  const [placesRoadComplete, setPlacesRoadComplete] = useState(false)
  const [placesRoadLoading, setPlacesRoadLoading] = useState(false)
  const [placesRoadKey, setPlacesRoadKey] = useState(placesKey)
  const placesLineGenRef = useRef(0)
  const describeId = useId()
  const describeLabelId = `${describeId}-label`

  useEffect(() => {
    geocodeRef.current = geocode
  }, [geocode])

  useEffect(() => {
    const mql = window.matchMedia("(hover: hover) and (pointer: fine)")
    const sync = () => {
      finePointerRef.current = mql.matches
    }
    sync()
    mql.addEventListener("change", sync)
    return () => mql.removeEventListener("change", sync)
  }, [])

  if (placesRoadKey !== placesKey) {
    setPlacesRoadKey(placesKey)
    placesLineGenRef.current += 1
    setPlacesRoadGeometry(null)
    setPlacesRoadKm(null)
    setPlacesRoadComplete(false)
    setPlacesRoadLoading(false)
  }

  const transportKmSummary = useMemo(
    () => summarizeTransportKm(transportDistances.byMode),
    [transportDistances],
  )
  const undrawnSummary = useMemo(
    () => summarizeUndrawnTransports(transportDistances.undrawn),
    [transportDistances],
  )

  const geocodeResult = geocodeDisplayResult(geocode)

  // Geocodificar por clave de contenido; conservar pines durante refresco.
  useEffect(() => {
    if (!MAPBOX_TOKEN?.trim()) {
      dispatchGeocode({
        type: "error",
        message:
          "Configura NEXT_PUBLIC_MAPBOX_TOKEN en frontend/.env.local (token público pk.…) y reinicia el servidor de desarrollo.",
      })
      return
    }

    const ac = new AbortController()
    // Capturados del render que produjo geocodeInputKey (contenido estable).
    const placesNow = places
    const codesNow = countryCodes
    const destinationNow = destination

    const run = async () => {
      if (ac.signal.aborted) return

      if (placesNow.length === 0) {
        coordCacheRef.current.clear()
        dispatchGeocode({ type: "reset-empty" })
        return
      }

      const hasPrevious = geocodeDisplayResult(geocodeRef.current) != null
      dispatchGeocode({ type: "begin", hasPrevious })

      const fromTrip = new Set<string>(
        (codesNow ?? [])
          .map((c) => c.trim().toLowerCase())
          .filter((c) => c.length === 2),
      )
      const dest = destinationNow?.trim()
      if (dest) {
        for (const c of collectCountryCodesFromHint(dest)) fromTrip.add(c)
      }
      for (const p of placesNow) {
        for (const c of collectCountryCodesFromHint(p.region)) fromTrip.add(c)
      }
      const unionForBias = Array.from(fromTrip)
      const countryOpts = unionForBias.length ? unionForBias : undefined

      type PlaceFix = {
        coord: LngLat
        precision: "exact" | "approximate"
        anchorLabel?: string
      }

      const regionKeys = [
        ...new Set(
          placesNow
            .map((p) => p.region?.trim())
            .filter((r): r is string => Boolean(r && isIndependentRegionHint(r))),
        ),
      ]
      const anchors = new Map<string, RegionAnchor>()
      await Promise.all(
        regionKeys.map(async (region) => {
          try {
            const a = await geocodeRegionAnchor(region, { countryCodes: countryOpts })
            if (a) anchors.set(region.toLowerCase(), a)
          } catch {
            // ignore
          }
        }),
      )
      let destAnchor: RegionAnchor | null = null
      if (dest) {
        try {
          destAnchor = await geocodeRegionAnchor(dest, { countryCodes: countryOpts })
        } catch {
          destAnchor = null
        }
      }
      if (!destAnchor && unionForBias.length > 0) {
        for (const code of unionForBias) {
          const name = getCountryByCode(code)?.name
          if (!name) continue
          try {
            const a = await geocodeRegionAnchor(name, { countryCodes: [code] })
            if (a) {
              destAnchor = {
                coord: a.coord,
                featureType: "country",
                label: name,
              }
              break
            }
          } catch {
            // ignore
          }
        }
      }
      if (ac.signal.aborted) return

      const resolved: GeocodeResolved[] = []
      const failed: { point: GeocodePoint }[] = []
      const liveIds = new Set(placesNow.map((p) => p.id))

      for (const id of [...coordCacheRef.current.keys()]) {
        if (!liveIds.has(id)) coordCacheRef.current.delete(id)
      }

      const results = await Promise.allSettled(
        placesNow.map(async (p): Promise<PlaceFix | null> => {
          const saved = p.coords
          if (
            saved &&
            typeof saved.lng === "number" &&
            typeof saved.lat === "number" &&
            Number.isFinite(saved.lng) &&
            Number.isFinite(saved.lat)
          ) {
            const pin = { lng: saved.lng, lat: saved.lat }
            const fix: PlaceFix = { coord: pin, precision: "exact" }
            coordCacheRef.current.set(p.id, fix)
            return fix
          }
          coordCacheRef.current.delete(p.id)

          const region = p.region?.trim() || null
          const regionAnchor =
            region && isIndependentRegionHint(region)
              ? anchors.get(region.toLowerCase())
              : undefined
          const anchor = regionAnchor ?? destAnchor
          if (!anchor) return null
          const tripDestination = region || dest || null
          const forPoint = new Set<string>([
            ...codesNow.map((c) => c.trim().toLowerCase()).filter((c) => c.length === 2),
          ])
          for (const c of collectCountryCodesFromHint(tripDestination)) forPoint.add(c)
          for (const c of collectCountryCodesFromHint(p.region)) forPoint.add(c)
          const codes = forPoint.size > 0 ? Array.from(forPoint) : unionForBias
          const proximity: [number, number] = [anchor.coord.lng, anchor.coord.lat]
          let candidates = await searchPlaceCandidates(p.name, {
            proximity,
            countryCodes: codes.length > 0 ? codes : undefined,
            signal: ac.signal,
          })
          if (ac.signal.aborted) return null
          if (candidates.length === 0) {
            candidates = await geocodeName(p.name, {
              proximity,
              tripDestination,
              countryCodes: codes.length > 0 ? codes : undefined,
            })
          }
          const outcome = pickGeocodeOutcome(candidates, anchor, p.name)
          if (outcome.precision === "unlocated") return null
          const fix: PlaceFix =
            outcome.precision === "exact"
              ? { coord: outcome.coord, precision: "exact" }
              : {
                  coord: outcome.coord,
                  precision: "approximate",
                  anchorLabel: outcome.anchorLabel,
                }
          coordCacheRef.current.set(p.id, fix)
          return fix
        }),
      )

      if (ac.signal.aborted) return

      const unspread: GeocodeResolved[] = []
      for (let i = 0; i < placesNow.length; i++) {
        const p = placesNow[i]!
        const r = results[i]!
        if (r.status === "fulfilled" && r.value) {
          unspread.push({
            point: asGeocodePoint(p),
            coord: r.value.coord,
            precision: r.value.precision,
            anchorLabel: r.value.anchorLabel,
          })
        } else {
          failed.push({ point: asGeocodePoint(p) })
        }
      }
      const spread = offsetStackedApproximate(
        unspread.map((r) => ({
          id: r.point.id,
          coord: r.coord,
          precision: r.precision,
        })),
      )
      for (const r of unspread) {
        resolved.push({
          ...r,
          displayCoord: spread.get(r.point.id) ?? r.coord,
        })
      }

      if (ac.signal.aborted) return
      dispatchGeocode({ type: "success", resolved, failed })
    }

    const t = window.setTimeout(() => {
      void run()
    }, 0)
    return () => {
      window.clearTimeout(t)
      ac.abort()
    }
    // places/countryCodes/destination van embebidos en geocodeInputKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocodeInputKey])

  const visibleResolved = useMemo(
    () =>
      geocodeResult
        ? filterByDayScope(geocodeResult.resolved, focusDayNumber, (r) => r.point.dayNumber)
        : [],
    [geocodeResult, focusDayNumber],
  )
  const visibleFailed = useMemo(
    () =>
      geocodeResult
        ? filterByDayScope(geocodeResult.failed, focusDayNumber, (f) => f.point.dayNumber)
        : [],
    [geocodeResult, focusDayNumber],
  )

  const placesForRoute: ItineraryPlace[] = useMemo(() => {
    if (!geocodeResult) {
      return visiblePlaces.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type === "hub" || p.type === "endpoint" ? "activity" : p.type,
        dayNumber: p.dayNumber,
        region: p.region,
        coords: p.coords ?? null,
      }))
    }
    const failedIds = new Set(geocodeResult.failed.map((f) => f.point.id))
    const resolvedById = new Map(geocodeResult.resolved.map((r) => [r.point.id, r.coord]))
    return visiblePlaces.map((p) => {
      const hit = resolvedById.get(p.id)
      return {
        id: p.id,
        name: p.name,
        type: (p.type === "hub" || p.type === "endpoint" ? "activity" : p.type) as ItineraryPlace["type"],
        dayNumber: p.dayNumber,
        region: p.region,
        coords: hit ?? (failedIds.has(p.id) ? null : (p.coords ?? null)),
      }
    })
  }, [geocodeResult, visiblePlaces])

  const placesRoute = useMemo(
    () => buildPlacesRoute(placesForRoute),
    [placesForRoute],
  )

  /** Numeración sobre la secuencia dibujada (solo localizados del ámbito). */
  const drawnStopNumberById = useMemo(() => {
    const map = new Map<string, number>()
    visibleResolved.forEach((r, i) => {
      map.set(r.point.id, i + 1)
    })
    return map
  }, [visibleResolved])

  /** Posición en el itinerario completo (para popup). */
  const itineraryOrderById = useMemo(() => {
    const map = new Map<string, number>()
    places.forEach((p, i) => map.set(p.id, i + 1))
    return map
  }, [places])

  const followRoad = useCallback(
    async (segment: ItineraryMapSegment) => {
      if (!modeAllowsRoadDirections(segment.mode)) return
      if (roadOverride[segment.itemId]) return
      setRoadLoadingId(segment.itemId)
      try {
        const dir = await getDirections(
          [
            { lng: segment.from.lng, lat: segment.from.lat },
            { lng: segment.to.lng, lat: segment.to.lat },
          ],
          { profile: "driving" },
        )
        if (dir?.geometry) {
          setRoadOverride((prev) => ({ ...prev, [segment.itemId]: dir.geometry }))
        }
      } finally {
        setRoadLoadingId(null)
      }
    },
    [roadOverride],
  )

  const adjustPlacesToRoad = useCallback(async () => {
    const subsequences = groupRoadCandidateSubsequences(placesRoute.legs)
    if (subsequences.length === 0) return
    const gen = ++placesLineGenRef.current
    setPlacesRoadLoading(true)
    try {
      const features: GeoJSON.Feature<GeoJSON.LineString>[] = []
      let roadKm = 0
      let allComplete = true
      let anyGeometry = false

      for (const sub of subsequences) {
        const dir = await getDirections(sub.coords, { profile: "driving" })
        if (gen !== placesLineGenRef.current) return
        if (!dir?.geometry) {
          allComplete = false
          for (const idx of sub.legIndices) {
            const leg = placesRoute.legs[idx]!
            features.push({
              type: "Feature",
              properties: {
                fromId: leg.fromId,
                toId: leg.toId,
                kind: "road-candidate",
                km: leg.km,
                color: placesRouteColor(mapTheme),
                width: 2.5,
                fallback: true,
              },
              geometry: {
                type: "LineString",
                coordinates: [
                  [leg.from.lng, leg.from.lat],
                  [leg.to.lng, leg.to.lat],
                ],
              },
            })
            roadKm += leg.km
            anyGeometry = true
          }
          continue
        }
        if (!dir.complete) allComplete = false
        features.push({
          type: "Feature",
          properties: {
            kind: "road",
            color: placesRouteColor(mapTheme),
            width: 2.5,
          },
          geometry: dir.geometry,
        })
        anyGeometry = true

        if (dir.legDistancesMeters.length === sub.legIndices.length) {
          for (const meters of dir.legDistancesMeters) roadKm += meters / 1000
        } else {
          roadKm += dir.distanceMeters / 1000
        }
      }

      if (gen !== placesLineGenRef.current) return
      if (!anyGeometry) {
        onPlacesLineStyleChange?.("straight")
        return
      }
      setPlacesRoadGeometry({ type: "FeatureCollection", features })
      setPlacesRoadKm(roadKm)
      setPlacesRoadComplete(allComplete)
    } finally {
      if (gen === placesLineGenRef.current) setPlacesRoadLoading(false)
    }
  }, [onPlacesLineStyleChange, placesRoute.legs, mapTheme])

  const clearPlacesRoad = useCallback(() => {
    placesLineGenRef.current += 1
    setPlacesRoadGeometry(null)
    setPlacesRoadKm(null)
    setPlacesRoadComplete(false)
    setPlacesRoadLoading(false)
  }, [])

  const closeHoverPopup = useCallback(() => {
    if (hoverCloseTimerRef.current != null) {
      window.clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
    hoverPopupRef.current?.remove()
    hoverOpenIdRef.current = null
  }, [])

  const scheduleHoverClose = useCallback(
    (id: string) => {
      if (hoverCloseTimerRef.current != null) {
        window.clearTimeout(hoverCloseTimerRef.current)
      }
      hoverCloseTimerRef.current = window.setTimeout(() => {
        hoverCloseTimerRef.current = null
        if (hoverOpenIdRef.current === id) closeHoverPopup()
      }, 220)
    },
    [closeHoverPopup],
  )

  const ensureHoverPopup = useCallback((): mapboxgl.Popup => {
    if (!hoverPopupRef.current) {
      hoverPopupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        focusAfterOpen: false,
        offset: 14,
        maxWidth: "260px",
        className: "wp-map-popup",
      })
      popupChromeElRef.current = null
    }
    return hoverPopupRef.current
  }, [])

  const showHoverPopup = useCallback(
    (lngLat: mapboxgl.LngLatLike, html: string, opts?: { interactive?: boolean }) => {
      const map = mapInstanceRef.current
      if (!map) return
      if (hoverCloseTimerRef.current != null) {
        window.clearTimeout(hoverCloseTimerRef.current)
        hoverCloseTimerRef.current = null
      }
      const popup = ensureHoverPopup()
      popup.setLngLat(lngLat).setHTML(html).addTo(map)
      const el = popup.getElement()
      if (!el) return
      el.classList.toggle("wp-map-popup--interactive", Boolean(opts?.interactive))
      // `Popup.remove()` borra `_container`. El siguiente `addTo` crea un nodo
      // nuevo; religar si el elemento cambió (si no, el botón de ajustar en
      // móvil queda muerto tras el primer cierre).
      if (popupChromeElRef.current === el) return
      popupChromeElRef.current = el
      el.addEventListener("mouseenter", () => {
        if (hoverCloseTimerRef.current != null) {
          window.clearTimeout(hoverCloseTimerRef.current)
          hoverCloseTimerRef.current = null
        }
      })
      el.addEventListener("mouseleave", () => {
        if (!finePointerRef.current) return
        const openId = hoverOpenIdRef.current
        if (openId) scheduleHoverClose(openId)
      })
      el.addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement | null)?.closest?.("[data-wp-adjust]")
        if (!btn) return
        e.preventDefault()
        e.stopPropagation()
        const itemId = (btn as HTMLElement).dataset.wpAdjust
        if (!itemId) return
        const data = popupDataByIdRef.current.get(itemId)
        const marker = markersByIdRef.current.get(itemId)
        if (!data || !marker) return
        closeHoverPopup()
        const itemType = data.itemType
        if (!itemType) return
        adjustingSetterRef.current({
          id: itemId,
          name: data.name,
          itemType,
        })
      })
    },
    [ensureHoverPopup, closeHoverPopup, scheduleHoverClose],
  )

  useEffect(() => {
    closeHoverPopup()
  }, [mapMode, focusDayNumber, closeHoverPopup])

  // ── Ciclo de vida del mapa: una sola instancia ─────────────────────────────
  useEffect(() => {
    if (!MAPBOX_TOKEN?.trim()) return
    const container = mapContainerRef.current
    if (!container) return
    if (mapInstanceRef.current) return

    const markersById = markersByIdRef.current
    const popupDataById = popupDataByIdRef.current

    const map = new mapboxgl.Map({
      container,
      style: MAP_STYLE_URL[mapTheme],
      center: [0, 20],
      zoom: 1.5,
    })
    mapInstanceRef.current = map
    mapStyleRef.current = MAP_STYLE_URL[mapTheme]
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right")

    const onResize = () => {
      try {
        map.resize()
      } catch {
        // ignore
      }
    }
    const ro: ResizeObserver | null =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null
    if (ro) ro.observe(container)

    const onError = (e: { error?: { message?: string }; message?: string }) => {
      if (mapReadyRef.current) return
      const msg =
        e?.error?.message ||
        e?.message ||
        "No se pudo cargar el mapa. Comprueba el token de Mapbox o la conexión."
      setMapError(msg)
    }

    const transportPopupHtml = (p: GeoJSON.GeoJsonProperties): string => {
      if (!p) return ""
      const mode = routeModeLabel(
        p.mode === "undecided" ? null : (p.mode as RouteMode),
      )
      const leg = p.leg === "outbound" ? "Ida" : p.leg === "return" ? "Vuelta" : null
      const vendor = p.vendor ? String(p.vendor) : null
      const meta = [mode, leg, vendor].filter(Boolean).join(" · ")
      return popupHtml(String(p.title ?? ""), `Día ${p.dayNumber} · ${meta}`)
    }

    let ignoreNextMapClick = false

    const onLoad = () => {
      ensureMapLayers(map)
      onResize()
      mapReadyRef.current = true
      setMapError(null)
      setMapReady(true)

      map.on("mousemove", "transport-segments-line", (e) => {
        map.getCanvas().style.cursor = "pointer"
        if (!finePointerRef.current) return
        const f = e.features?.[0]
        if (!f?.properties) return
        showHoverPopup(e.lngLat, transportPopupHtml(f.properties))
      })
      map.on("mouseleave", "transport-segments-line", () => {
        map.getCanvas().style.cursor = ""
        if (finePointerRef.current) closeHoverPopup()
      })
      map.on("click", "transport-segments-line", (e) => {
        if (finePointerRef.current) return
        ignoreNextMapClick = true
        const f = e.features?.[0]
        if (!f?.properties) return
        showHoverPopup(e.lngLat, transportPopupHtml(f.properties))
      })
      map.on("click", () => {
        if (ignoreNextMapClick) {
          ignoreNextMapClick = false
          return
        }
        if (!finePointerRef.current) closeHoverPopup()
      })
    }

    map.on("error", onError)
    if (map.loaded()) onLoad()
    else map.on("load", onLoad)

    return () => {
      if (ro) ro.disconnect()
      map.off("error", onError)
      closeHoverPopup()
      hoverPopupRef.current = null
      popupChromeElRef.current = null
      for (const marker of markersById.values()) marker.remove()
      markersById.clear()
      popupDataById.clear()
      mapReadyRef.current = false
      setMapReady(false)
      map.remove()
      mapInstanceRef.current = null
    }
    // showHoverPopup / closeHoverPopup son estables (refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    const wanted = MAP_STYLE_URL[mapTheme]
    if (mapStyleRef.current === wanted) return
    mapStyleRef.current = wanted
    mapReadyRef.current = false
    setMapReady(false)
    map.setStyle(wanted)
    const onStyle = () => {
      ensureMapLayers(map)
      mapReadyRef.current = true
      setMapReady(true)
    }
    map.once("style.load", onStyle)
    return () => {
      map.off("style.load", onStyle)
    }
  }, [mapTheme])

  // Visibilidad por modo.
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !mapReady) return
    const transportVis = mapMode === "transport" ? "visible" : "none"
    const placesVis = mapMode === "places" ? "visible" : "none"
    if (map.getLayer("transport-segments-line")) {
      map.setLayoutProperty("transport-segments-line", "visibility", transportVis)
    }
    if (map.getLayer("places-route-line")) {
      map.setLayoutProperty("places-route-line", "visibility", placesVis)
    }
    if (map.getLayer("places-route-long-line")) {
      map.setLayoutProperty("places-route-long-line", "visibility", placesVis)
    }
  }, [mapMode, mapReady])

  // Fuente de desplazamientos.
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !mapReady) return
    const collection = segmentsToFeatureCollection(segments, mapTheme)
    for (const f of collection.features) {
      const id = String(f.properties?.itemId ?? "")
      const override = roadOverride[id]
      if (override) f.geometry = override
    }
    setSourceData(map, "transport-segments", collection)
  }, [mapReady, segments, segmentsKey, roadOverride, mapTheme])

  // Fuentes del recorrido de lugares.
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !mapReady) return
    const base = placesRouteToFeatureCollections(placesRoute.legs, mapTheme)
    setSourceData(map, "places-route", placesRoadGeometry ?? base.road)
    setSourceData(map, "places-route-long", base.longHop)
  }, [mapReady, placesRoute, placesRoadGeometry, mapTheme])

  // Marcadores: diff por id; en Recorrido usa ready|refreshing (nunca vaciar en loading).
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !mapReady) return

    type Visible = {
      id: string
      point: ItineraryMapPoint
      coord: LngLat
      label: string
      pinText: string
      approximate: boolean
    }
    const visible: Visible[] = []

    if (mapMode === "transport") {
      for (const h of hubs) {
        if (
          h.coords &&
          Number.isFinite(h.coords.lng) &&
          Number.isFinite(h.coords.lat)
        ) {
          visible.push({
            id: h.id,
            point: h,
            coord: { lng: h.coords.lng, lat: h.coords.lat },
            label:
              h.hubRole === "arrival"
                ? "Llegada · inicio del itinerario"
                : "Salida · fin del itinerario",
            pinText: h.hubRole === "arrival" ? "↓" : "↑",
            approximate: false,
          })
        }
      }
      const seen = new Set(
        visible.map((v) => `${v.coord.lng.toFixed(5)},${v.coord.lat.toFixed(5)}`),
      )
      for (const s of segments) {
        for (const end of [
          { id: `${s.itemId}:from`, label: s.from.label, lng: s.from.lng, lat: s.from.lat },
          { id: `${s.itemId}:to`, label: s.to.label, lng: s.to.lng, lat: s.to.lat },
        ]) {
          const key = `${end.lng.toFixed(5)},${end.lat.toFixed(5)}`
          if (seen.has(key)) continue
          seen.add(key)
          visible.push({
            id: end.id,
            point: {
              id: end.id,
              name: end.label,
              type: "endpoint",
              dayNumber: s.dayNumber,
            },
            coord: { lng: end.lng, lat: end.lat },
            label: `Día ${s.dayNumber} · ${routeModeLabel(s.mode)}`,
            pinText: "",
            approximate: false,
          })
        }
      }
    } else {
      for (const r of visibleResolved) {
        const drawn = drawnStopNumberById.get(r.point.id)
        const order = itineraryOrderById.get(r.point.id)
        const approximate = r.precision === "approximate"
        const label = approximate
          ? `Día ${r.point.dayNumber} · ubicación aproximada, verifica en la fuente${
              r.anchorLabel ? ` (centro de ${r.anchorLabel})` : ""
            }`
          : order != null
            ? `Día ${r.point.dayNumber} · #${order} en el itinerario`
            : `Día ${r.point.dayNumber}`
        visible.push({
          id: r.point.id,
          point: r.point as ItineraryMapPoint,
          coord: pinCoord(r),
          label,
          pinText: drawn != null ? String(drawn) : "",
          approximate,
        })
      }
    }

    const nextIds = new Set(visible.map((v) => v.id))
    for (const [id, marker] of markersByIdRef.current) {
      if (!nextIds.has(id)) {
        if (hoverOpenIdRef.current === id) closeHoverPopup()
        marker.remove()
        markersByIdRef.current.delete(id)
        popupDataByIdRef.current.delete(id)
      }
    }

    const bindPinChrome = (el: HTMLElement, id: string) => {
      const open = () => {
        const data = popupDataByIdRef.current.get(id)
        const marker = markersByIdRef.current.get(id)
        if (!data || !marker) return
        hoverOpenIdRef.current = id
        showHoverPopup(
          marker.getLngLat(),
          popupHtml(data.name, data.label, data.adjustable ? { adjustId: id } : undefined),
          { interactive: Boolean(data.adjustable) },
        )
      }
      const close = () => {
        if (hoverOpenIdRef.current === id) closeHoverPopup()
      }
      const openAdjust = () => {
        const data = popupDataByIdRef.current.get(id)
        const marker = markersByIdRef.current.get(id)
        if (!data?.adjustable || !marker) return
        closeHoverPopup()
        const itemType = data.itemType
        if (!itemType) return
        adjustingSetterRef.current({
          id,
          name: data.name,
          itemType,
        })
      }
      el.addEventListener("mouseenter", () => {
        if (finePointerRef.current) open()
      })
      el.addEventListener("mouseleave", () => {
        if (!finePointerRef.current) return
        const data = popupDataByIdRef.current.get(id)
        if (data?.adjustable) scheduleHoverClose(id)
        else close()
      })
      el.addEventListener("click", (ev) => {
        ev.stopPropagation()
        const data = popupDataByIdRef.current.get(id)
        if (finePointerRef.current) {
          if (data?.adjustable) openAdjust()
          return
        }
        open()
      })
    }

    for (const v of visible) {
      popupDataByIdRef.current.set(v.id, {
        name: v.point.name,
        label: v.label,
        adjustable: Boolean(onPersistItemCoords) && mappableItemType(v.point.type) != null,
        itemType: mappableItemType(v.point.type) ?? undefined,
      })
      const existing = markersByIdRef.current.get(v.id)

      if (existing) {
        existing.setLngLat([v.coord.lng, v.coord.lat])
        const root = existing.getElement()
        const pin = root.firstElementChild as HTMLElement | null
        if (pin) renderPinInto(pin, v.point.type, v.pinText, v.approximate, mapTheme)
        root.setAttribute("aria-label", pinAriaLabel(v.point.name, v.point.dayNumber))
        continue
      }

      const root = document.createElement("div")
      root.setAttribute("role", "img")
      root.setAttribute("aria-label", pinAriaLabel(v.point.name, v.point.dayNumber))
      const pin = document.createElement("div")
      root.appendChild(pin)
      renderPinInto(pin, v.point.type, v.pinText, v.approximate, mapTheme)
      bindPinChrome(root, v.id)
      const marker = new mapboxgl.Marker({
        element: root,
        anchor: "center",
        className: "wp-map-marker",
      })
        .setLngLat([v.coord.lng, v.coord.lat])
        .addTo(map)
      markersByIdRef.current.set(v.id, marker)
    }
  }, [
    mapReady,
    mapMode,
    hubs,
    hubsKey,
    segments,
    segmentsKey,
    visibleResolved,
    drawnStopNumberById,
    itineraryOrderById,
    showHoverPopup,
    closeHoverPopup,
    scheduleHoverClose,
    onPersistItemCoords,
    mapTheme,
  ])

  // fitBounds: una vez por modo + conjunto de contenido (no en cada refresh de geocode).
  const placesResolvedIds = visibleResolved.map((r) => r.point.id).join(",")
  const fitContentKey =
    mapMode === "transport"
      ? `t:${segmentsKey}|${hubsKey}`
      : placesResolvedIds
        ? `p:${placesResolvedIds}`
        : null

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !mapReady || mapError || !fitContentKey) return

    const signature = `${mapMode}|${fitContentKey}`
    if (fittedSignatureRef.current === signature) return

    const bounds = new mapboxgl.LngLatBounds()
    let hasBounds = false

    if (mapMode === "transport") {
      for (const h of hubs) {
        if (h.coords && Number.isFinite(h.coords.lng) && Number.isFinite(h.coords.lat)) {
          bounds.extend([h.coords.lng, h.coords.lat])
          hasBounds = true
        }
      }
      for (const s of segments) {
        bounds.extend([s.from.lng, s.from.lat])
        bounds.extend([s.to.lng, s.to.lat])
        hasBounds = true
      }
    } else {
      for (const r of visibleResolved) {
        const c = pinCoord(r)
        bounds.extend([c.lng, c.lat])
        hasBounds = true
      }
    }

    if (!hasBounds) return
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const duration = fittedSignatureRef.current === null || reduceMotion ? 0 : 420
    fittedSignatureRef.current = signature
    map.fitBounds(bounds, {
      padding: 48,
      maxZoom: focusDayNumber == null ? 12 : 15,
      duration,
    })
  }, [mapReady, mapError, mapMode, fitContentKey, hubs, segments, visibleResolved, focusDayNumber])

  const showMapMetrics = mapReady && !mapError
  const canAdjustPlacesToRoad =
    showMapMetrics &&
    mapMode === "places" &&
    placesRoute.legs.some((l: PlacesRouteLeg) => l.kind === "road-candidate")

  useEffect(() => {
    onPlacesLineLoadingChange?.(placesRoadLoading)
  }, [onPlacesLineLoadingChange, placesRoadLoading])

  useEffect(() => {
    if (placesLineStyle === "straight") clearPlacesRoad()
  }, [clearPlacesRoad, placesLineStyle])

  useEffect(() => {
    if (placesLineStyle !== "road") return
    if (!canAdjustPlacesToRoad) return
    if (placesRoadGeometry || placesRoadLoading) return
    void adjustPlacesToRoad()
  }, [
    placesKey,
    placesLineStyle,
    canAdjustPlacesToRoad,
    placesRoadGeometry,
    placesRoadLoading,
    adjustPlacesToRoad,
  ])

  if (!MAPBOX_TOKEN?.trim()) {
    return (
      <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
        <p>
          Configura{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
          en{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">frontend/.env.local</code>{" "}
          (token <code className="rounded bg-muted px-1.5">pk.…</code> desde Mapbox) y reinicia el
          servidor.
        </p>
      </div>
    )
  }

  const roadable = segments.filter((s) => modeAllowsRoadDirections(s.mode))
  const hasTransportContent = segments.length > 0 || hubs.length > 0
  const hasPlacesContent = visiblePlaces.length > 0
  const modeEmpty =
    mapMode === "transport" ? !hasTransportContent : !hasPlacesContent
  const otherModeHasContent =
    mapMode === "transport" ? hasPlacesContent : hasTransportContent

  const failed = visibleFailed
  const placesRouteIncomplete =
    mapMode === "places" &&
    (placesRoute.skipped.length > 0 || failed.length > 0)

  const placesTotalLabel = (() => {
    if (!showMapMetrics) return null
    if (placesRoadKm != null) {
      const prefix = placesRoadComplete ? "" : "≈ "
      const nature = placesRoadComplete ? "por carretera" : "mixtos (carretera incompleta)"
      return `${prefix}${formatKm(placesRoadKm)} ${nature}`
    }
    if (placesRoute.routeKm > 0 || placesRoute.longHopKm > 0) {
      return `≈ ${formatKm(placesRoute.routeKm)} en línea recta`
    }
    return null
  })()

  const placesRoadTitle = [
    placesRoute.longHopKm > 0
      ? `Excluye ≈ ${formatKm(placesRoute.longHopKm)} en traslados largos`
      : null,
    placesRoute.legs.some((l) => l.kind === "zero")
      ? "Pares colapsados (misma coordenada) no suman"
      : null,
  ]
    .filter(Boolean)
    .join(". ")

  const isGeocoding =
    geocode.status === "loading" || geocode.status === "idle" || geocode.status === "refreshing"

  const visibleIncomplete = filterByDayScope(incompleteTransports, focusDayNumber)

  const dayScoped = focusDayNumber != null && focusDayLabel
  const emptyCopy = (() => {
    if (mapMode === "transport" && visibleIncomplete.length > 0) {
      return visibleIncomplete.length === 1
        ? "Fija origen y destino para ver el tramo en el mapa."
        : `Fija origen y destino de ${visibleIncomplete.length} desplazamientos para verlos en el mapa.`
    }
    if (dayScoped) {
      const day = focusDayLabel.toLowerCase()
      return mapMode === "transport"
        ? `El ${day} no tiene desplazamientos estructurados.`
        : `El ${day} no tiene lugares en el mapa.`
    }
    return mapMode === "transport"
      ? "Aún no has añadido desplazamientos estructurados al itinerario."
      : "Aún no has añadido lugares al itinerario."
  })()
  const emptyHint =
    dayScoped && otherModeHasContent
      ? mapMode === "transport"
        ? "Este día sí tiene lugares."
        : "Este día sí tiene desplazamientos."
      : null
  const switchMode: MapViewMode = mapMode === "transport" ? "places" : "transport"
  const switchLabel = mapMode === "transport" ? "Ver recorrido" : "Ver desplazamientos"

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" role="region" aria-label="Itinerario en el mapa">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground" aria-live="polite">
        {showMapMetrics && mapMode === "transport" ? (
          <>
            {(transportKmSummary || undrawnSummary) && (
              <p className="m-0 tabular-nums">
                {[transportKmSummary, undrawnSummary].filter(Boolean).join(" · ")}
              </p>
            )}
            {roadable.map((s) => (
              <button
                key={s.itemId}
                type="button"
                className="rounded-md border border-border/80 bg-card px-2.5 py-1 font-medium text-foreground hover:bg-muted"
                disabled={roadLoadingId === s.itemId || Boolean(roadOverride[s.itemId])}
                onClick={() => void followRoad(s)}
              >
                {roadOverride[s.itemId]
                  ? `Carretera · ${s.from.label.split(",")[0]}`
                  : roadLoadingId === s.itemId
                    ? "Calculando…"
                    : `Seguir carretera · ${routeModeLabel(s.mode)}`}
              </button>
            ))}
            {visibleIncomplete.length > 0 ? (
              <button
                type="button"
                className="rounded-md border border-border/80 bg-card px-2.5 py-1 font-medium text-foreground hover:bg-muted"
                onClick={() => {
                  const first = visibleIncomplete[0]
                  if (first) onFixTransport?.(first)
                }}
              >
                {visibleIncomplete.length === 1
                  ? "Fijar origen y destino"
                  : `Fijar origen y destino (${visibleIncomplete.length})`}
              </button>
            ) : null}
          </>
        ) : null}

        {showMapMetrics && mapMode === "places" ? (
          <>
            {(() => {
              const parts: string[] = []
              if (visibleResolved.length > 0) {
                const n = visibleResolved.length
                parts.push(`${n} parada${n === 1 ? "" : "s"}`)
              }
              if (placesTotalLabel) parts.push(placesTotalLabel)
              if (placesRoute.longHopKm > 0) {
                parts.push(`+ ≈ ${formatKm(placesRoute.longHopKm)} en traslados largos`)
              }
              if (parts.length === 0) return null
              return (
                <p className="m-0 tabular-nums" title={placesRoadTitle || undefined}>
                  {parts.join(" · ")}
                </p>
              )
            })()}
            {!canAdjustPlacesToRoad &&
            placesLineStyle !== "road" &&
            visibleResolved.length >= 2 ? (
              <span>Ajusta las ubicaciones para trazar la ruta por carretera</span>
            ) : null}
            {placesRouteIncomplete ? (
              <span className="text-warning-foreground">
                Total incompleto: faltan lugares sin localizar
              </span>
            ) : null}
          </>
        ) : null}

        {mapMode === "places" && failed.length > 0 && (
          <details
            className="rounded-md border border-warning-border bg-warning-surface px-2.5 py-1.5 text-warning-foreground"
            id={describeId}
          >
            <summary
              className="cursor-pointer list-inside text-left font-medium outline-none"
              id={describeLabelId}
            >
              No se pudo localizar {failed.length} {failed.length === 1 ? "lugar" : "lugares"}
            </summary>
            <ul
              className="mt-1 list-inside list-disc pl-0.5 text-[11px] leading-relaxed"
              aria-describedby={describeLabelId}
            >
              {failed.map((f) => (
                <li key={f.point.id}>{f.point.name}</li>
              ))}
            </ul>
          </details>
        )}

        {mapMode === "places" && isGeocoding && !geocodeResult ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Localizando lugares…
          </span>
        ) : null}
        {mapMode === "places" && geocode.status === "refreshing" ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Actualizando…
          </span>
        ) : null}
      </div>

      <div className="relative min-h-[280px] w-full flex-1 overflow-hidden rounded-lg border border-border/80 shadow-sm">
        <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />
        {mapError ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 px-6 text-center text-sm text-muted-foreground backdrop-blur-[1px]">
            No se pudo cargar el mapa. {mapError}
          </div>
        ) : modeEmpty ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80 px-6 text-center text-sm text-muted-foreground backdrop-blur-[1px]">
            <p className="m-0">{emptyCopy}</p>
            {emptyHint ? <p className="m-0">{emptyHint}</p> : null}
            {mapMode === "transport" && visibleIncomplete.length > 0 && onFixTransport ? (
              <button
                type="button"
                className="rounded-md border border-border/80 bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                onClick={() => {
                  const first = visibleIncomplete[0]
                  if (first) onFixTransport(first)
                }}
              >
                {visibleIncomplete.length === 1
                  ? "Completar origen y destino"
                  : "Completar el primero"}
              </button>
            ) : null}
            {emptyHint && onMapModeChange ? (
              <button
                type="button"
                className="rounded-md border border-border/80 bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                onClick={() => onMapModeChange(switchMode)}
              >
                {switchLabel}
              </button>
            ) : null}
          </div>
        ) : null}
        {geocode.status === "error" ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 px-6 text-center text-sm text-muted-foreground">
            {geocode.message}
          </div>
        ) : null}
      </div>

      {onPersistItemCoords ? (
        <AdjustLocationDialog
          open={adjusting != null}
          onOpenChange={(open) => {
            if (!open) setAdjusting(null)
          }}
          itemName={adjusting?.name ?? ""}
          itemType={adjusting?.itemType ?? "activity"}
          proximity={null}
          countryCodes={countryCodes}
          destinationHint={destination}
          onConfirm={(place) => {
            if (!adjusting) return
            onPersistItemCoords(adjusting.id, place.coords)
            setAdjusting(null)
          }}
        />
      ) : null}
    </div>
  )
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
