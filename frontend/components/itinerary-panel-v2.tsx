"use client"

/**
 * Panel «Mi viaje»: una sola cabecera con pestañas
 * Ruta · Actividades · Alojamientos · Transporte · Básicos.
 * Ruta = timeline + Lista · Calendario · Mapa; el resto = filas de tarea por categoría.
 */
import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  memo,
} from "react"
import {
  Check,
  CalendarDays,
  GripVertical,
  List,
  Loader2,
  Map as MapIcon,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipArrow, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SegmentedControl } from "@/components/segmented-control"
import { useCollapsingHeader } from "@/hooks/use-collapsing-header"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { formatDayHeadingLine, getDayUserDescription } from "@/lib/day-heading"
import { mapCountryCodes, mapDestinationHint } from "@/lib/map-destination"
import { dateISOForDayIndex, formatDayDate, formatTripDates } from "@/lib/trip-dates"
import { useTrips } from "@/lib/trip-context"
import { ITEM_DOT_COLORS, transportIconForItem } from "@/lib/item-styles"
import { TASK_STATUS_LABELS } from "@/lib/task-labels"
import { dayItemsSignature, generateDaySummary } from "@/lib/day-summary"
import { ApiLimitError } from "@/lib/api"
import { toast } from "sonner"
import {
  categoryFromItemType,
  resolveTaskStatus,
  taskBucket,
  taskKeyForItem,
  buildTripTasks,
  computeTripTaskTotals,
} from "@/lib/trip-tasks"
import type { ItemType, RouteLeg, Trip, TripTaskCategory, TripTaskState, UserDay, UserDayItem } from "@/types/itinerary"
import { flightSearchHrefForItem } from "@/lib/flight-search"
import { stayDayIndexesForItem } from "@/lib/booking-dates"
import { stayReserveHref } from "@/lib/booking-search"
import {
  ItineraryViewModeTabs,
  VIEW_MODE_ADD_ACTION_LABEL,
  VIEW_MODE_DEFAULT_TASK_CATEGORY,
  VIEW_MODE_TASK_CATEGORIES,
  type ItineraryViewMode,
} from "@/components/itinerary-view-mode-tabs"
import { ItineraryMapView, MapDayDropdown, MapModeDropdown, persistMapMode, readStoredMapMode, type ItineraryMapPoint, type MapViewMode } from "@/components/itinerary-map-view"
import {
  ItineraryCalendarView,
  persistRouteView,
  readStoredRouteView,
  type RouteViewMode,
} from "@/components/itinerary-calendar-view"
import { scrollDaySectionIntoView } from "@/lib/itinerary-day-scroll"
import { TravelItemCard } from "@/components/travel-item-card"
import { AddManualItemDialog } from "@/components/add-manual-item-dialog"
import { RouteLegDialog } from "@/components/route-leg-dialog"
import { TransportRouteDialog } from "@/components/transport-route-dialog"
import { formatRouteSummary } from "@/lib/transport-routes"
import {
  collectItineraryPlaces,
  collectMapGatewayAnchors,
  collectMapSegments,
  collectTransportDistances,
  type TransportDistances,
} from "@/lib/map-route-geometry"
import {
  dayScopeFromId,
  daysForScope,
  filterByDayScope,
  inDayScope,
  mappableCountsByDay,
} from "@/lib/map-day-scope"
import {
  TripTasksManagedFragment,
  TripTasksPanel,
  TripTasksProgressHairline,
  TripTasksSummaryDetail,
} from "@/components/trip-tasks-panel"
import {
  DayDestructiveConfirmDialog,
  type DayDestructiveAction,
} from "@/components/day-destructive-confirm-dialog"
import { hasRouteLeg, isRouteLegItem } from "@/lib/route-legs"
import { useListFlip } from "@/hooks/use-list-flip"
import { useItineraryDnd } from "@/hooks/use-itinerary-dnd"
import { useStableList } from "@/hooks/use-stable-list"
import type { MoveParams } from "@/lib/itinerary-dnd"

const CATEGORY_EMPTY: Record<
  Exclude<ItineraryViewMode, "itinerary">,
  { title: string; description: string }
> = {
  activities: {
    title: "Sin actividades que gestionar",
    description: "Consolida actividades o restaurantes en la Ruta.",
  },
  stay: {
    title: "Sin alojamientos que gestionar",
    description: "Consolida estancias en la Ruta.",
  },
  transport: {
    title: "Sin transporte que gestionar",
    description: "Consolida traslados en la Ruta o añade una tarea a mano.",
  },
  basics: {
    title: "Sin básicos que gestionar",
    description:
      "Añade ofertas desde la pestaña Descuentos de tus fuentes, o una tarea a mano.",
  },
}

const EMPTY_TRANSPORT_DISTANCES: TransportDistances = {
  byMode: {},
  drawnKm: 0,
  undrawn: [],
  undrawnKm: 0,
  totalKm: 0,
}

function normalizeDayLabel(raw: string): string {
  return raw.replace(/\s+[—–]\s+/g, " - ")
}

export default function ItineraryPanel({
  tripId,
  onClose,
  onEditTrip,
  onHeaderCollapsedChange,
  activeOnMobile = true,
}: {
  tripId: string
  onClose?: () => void
  /** Abre el diálogo de edición del viaje (fechas, nombre, etc.). */
  onEditTrip?: () => void
  /** Móvil: repliegue de cabecera (para compactar la navbar con el mismo gesto). */
  onHeaderCollapsedChange?: (collapsed: boolean) => void
  /** Móvil: true mientras esta sección está visible. */
  activeOnMobile?: boolean
}) {
  const {
    getTrip,
    getTripSources,
    addDay,
    addItemToDay,
    removeItemFromDay,
    clearDayItems,
    removeSelectedDays,
    removeBasicFromTrip,
    moveItemBetweenDays,
    setTaskState,
    addExtraTask,
    removeExtraTask,
    acceptCountryTask,
    dismissCountryTask,
    reevaluateCountryTasks,
    upsertRouteLeg,
    upsertTransportRouteItem,
    updateDayLabel,
    applyDaySummary,
    setDayItemCoords,
  } = useTrips()
  const trip = getTrip(tripId)
  const isMobile = useIsMobile()
  const {
    containerRef: panelRef,
    collapsed: headerCollapsed,
    setCollapsed: setHeaderCollapsed,
  } = useCollapsingHeader(isMobile, onHeaderCollapsedChange, activeOnMobile)
  const dateSub = useMemo(
    () => (trip ? formatTripDates(trip.startDate, trip.endDate) : null),
    [trip],
  )
  const flightSearchTrip = useMemo(
    () => ({
      startDate: trip?.startDate ?? null,
      numDays: trip?.numDays ?? null,
      numTravelers: trip?.numTravelers ?? null,
      currency: trip?.currency ?? "EUR",
    }),
    [trip?.startDate, trip?.numDays, trip?.numTravelers, trip?.currency],
  )
  const itemCount = useMemo(
    () => (trip ? trip.days.reduce((sum, d) => sum + d.items.length, 0) : 0),
    [trip],
  )
  const tripSources = useStableList(getTripSources(tripId))
  const mapDestHint = useMemo(
    () => (trip ? mapDestinationHint(trip, tripSources) : null),
    [trip, tripSources],
  )
  const mapCountries = useMemo(
    () => (trip ? mapCountryCodes(trip, tripSources) : []),
    [trip, tripSources],
  )
  // Fallback de la `region` por ítem: si el ítem no trae una pista propia, se usa el `area` del artículo.
  const sourceAreaById = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const s of tripSources) m.set(s.id, s.area ?? null)
    return m
  }, [tripSources])
  const resolveRegion = useCallback(
    (item: { region?: string | null; sourceId: string }): string | null => {
      const own = item.region?.trim()
      if (own) return own
      const fb = sourceAreaById.get(item.sourceId)?.trim()
      return fb && fb.length > 0 ? fb : null
    },
    [sourceAreaById],
  )
  const { rootRef: daysFlipRef, capture: captureDaysFlip } = useListFlip()
  const listScrollRef = useRef<HTMLDivElement>(null)
  const listChromeRef = useRef<HTMLDivElement>(null)
  const insertLineRef = useRef<HTMLDivElement>(null)
  const [selectedDayIds, setSelectedDayIds] = useState<Set<string>>(() => new Set())
  const [pendingDayAction, setPendingDayAction] = useState<DayDestructiveAction | null>(null)
  const [viewMode, setViewMode] = useState<ItineraryViewMode>("itinerary")
  const [listMode, setListMode] = useState<RouteViewMode>("list")
  // Recorrido por defecto; preferencia de localStorage tras hidratar.
  const [mapMode, setMapMode] = useState<MapViewMode>("places")
  const [focusDayId, setFocusDayId] = useState<string | null>(null)
  const pendingScrollDayIdRef = useRef<string | null>(null)

  useEffect(() => {
    const stored = readStoredMapMode()
    queueMicrotask(() => {
      if (stored !== "places") setMapMode(stored)
    })
  }, [])

  useEffect(() => {
    if (!trip) return
    const stored = readStoredRouteView()
    queueMicrotask(() => {
      const next =
        stored === "calendar" && trip.startDate == null ? "list" : stored
      if (next !== "list") setListMode(next)
    })
    // Una vez por viaje: no reaplicar en cada mutación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id])

  const handleMapModeChange = useCallback((next: MapViewMode) => {
    setMapMode(next)
    persistMapMode(next)
  }, [])

  const handleListModeChange = useCallback((next: RouteViewMode) => {
    setListMode(next)
    persistRouteView(next)
  }, [])

  const openDayFromCalendar = useCallback((dayId: string) => {
    setFocusDayId((current) => (current && current !== dayId ? null : current))
    pendingScrollDayIdRef.current = dayId
    setListMode("list")
    persistRouteView("list")
  }, [])

  useLayoutEffect(() => {
    if (listMode !== "list") return
    const id = pendingScrollDayIdRef.current
    if (!id) return
    pendingScrollDayIdRef.current = null
    const root = panelRef.current
    if (!root) return
    requestAnimationFrame(() => {
      scrollDaySectionIntoView(root, id)
    })
  }, [listMode, panelRef])

  const focusDayNumber = useMemo(
    () => dayScopeFromId(trip?.days ?? [], focusDayId),
    [trip, focusDayId],
  )

  const handleFocusDayChange = useCallback((next: string | null) => {
    setFocusDayId(next)
    setSelectedDayIds(new Set())
  }, [])

  useEffect(() => {
    setHeaderCollapsed(false)
  }, [viewMode, setHeaderCollapsed])
  const [manualDialogOpen, setManualDialogOpen] = useState(false)
  const [manualDialogDayId, setManualDialogDayId] = useState<string | null>(null)
  const [manualDialogInitialType, setManualDialogInitialType] = useState<ItemType | null>(null)
  const [extraTaskDialogOpen, setExtraTaskDialogOpen] = useState(false)
  const [routeLegDialog, setRouteLegDialog] = useState<{
    leg: RouteLeg
    existingItem?: UserDayItem | null
  } | null>(null)
  const [transportDialog, setTransportDialog] = useState<{
    dayId: string | null
    existingItem?: UserDayItem | null
  } | null>(null)

  const handleSetTaskState = useCallback(
    (taskKey: string, patch: Partial<TripTaskState>) => {
      setTaskState(tripId, taskKey, patch)
    },
    [setTaskState, tripId],
  )

  const handleAddExtraTask = useCallback(
    (data: { title: string; category: TripTaskCategory }) => {
      addExtraTask(tripId, data)
    },
    [addExtraTask, tripId],
  )

  const handleRemoveExtraTask = useCallback(
    (taskId: string) => {
      removeExtraTask(tripId, taskId)
    },
    [removeExtraTask, tripId],
  )

  const handleAcceptCountryTask = useCallback(
    (data: {
      id: string
      title: string
      category: TripTaskCategory
      state?: Partial<TripTaskState>
    }) => {
      acceptCountryTask(tripId, data)
    },
    [acceptCountryTask, tripId],
  )

  const handleDismissCountryTask = useCallback(
    (taskId: string) => {
      dismissCountryTask(tripId, taskId)
    },
    [dismissCountryTask, tripId],
  )

  const handleReevaluateCountryTasks = useCallback(
    (activeCountryCodes: string[]) => {
      reevaluateCountryTasks(tripId, activeCountryCodes)
    },
    [reevaluateCountryTasks, tripId],
  )

  const handleRemoveBasic = useCallback(
    (basicIds: string[]) => {
      for (const id of basicIds) removeBasicFromTrip(tripId, id)
    },
    [removeBasicFromTrip, tripId],
  )

  const openManualDialog = useCallback((dayId?: string | null, type?: ItemType | null) => {
    setManualDialogDayId(dayId ?? null)
    setManualDialogInitialType(type ?? null)
    setManualDialogOpen(true)
  }, [])

  const openRouteLegDialog = useCallback(
    (leg: RouteLeg, existingItem?: UserDayItem | null) => {
      setRouteLegDialog({ leg, existingItem: existingItem ?? null })
    },
    [],
  )

  const openTransportDialog = useCallback(
    (dayId: string | null, existingItem?: UserDayItem | null) => {
      setTransportDialog({ dayId, existingItem: existingItem ?? null })
    },
    [],
  )

  useEffect(() => {
    if (!trip) return
    setSelectedDayIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        if (trip.days.some((d) => d.id === id)) next.add(id)
      }
      if (next.size === prev.size) {
        let same = true
        for (const id of next) {
          if (!prev.has(id)) {
            same = false
            break
          }
        }
        if (same) return prev
      }
      return next
    })
  }, [trip])

  // Lugares del recorrido (stay/food/activity) en orden de introducción.
  const mapPlaces: ItineraryMapPoint[] = useMemo(() => {
    if (!trip || listMode !== "map") return []
    return collectItineraryPlaces(trip.days).map((p) => {
      const item = trip.days[p.dayNumber - 1]?.items.find((it) => it.id === p.id)
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        dayNumber: p.dayNumber,
        region: item ? resolveRegion(item) : p.region,
        coords: p.coords ?? null,
      }
    })
  }, [trip, resolveRegion, listMode])

  // Anclas de llegada/salida cuando ida/vuelta no van por carretera.
  const mapHubs: ItineraryMapPoint[] = useMemo(() => {
    if (!trip || listMode !== "map") return []
    return filterByDayScope(collectMapGatewayAnchors(trip.days), focusDayNumber).map((g) => ({
      id: `hub:${g.role}:${g.itemId}`,
      name: g.label,
      type: "hub" as const,
      dayNumber: g.dayNumber,
      coords: { lng: g.lng, lat: g.lat },
      hubRole: g.role,
    }))
  }, [trip, listMode, focusDayNumber])

  const mapSegments = useMemo(
    () =>
      trip && listMode === "map"
        ? filterByDayScope(collectMapSegments(trip.days), focusDayNumber)
        : [],
    [trip, listMode, focusDayNumber],
  )

  const mapTransportDistances = useMemo(
    () =>
      trip && listMode === "map"
        ? collectTransportDistances(daysForScope(trip.days, focusDayNumber))
        : EMPTY_TRANSPORT_DISTANCES,
    [trip, listMode, focusDayNumber],
  )

  const mapDayOptions = useMemo(() => {
    if (!trip) return []
    let counts: Map<number, number>
    if (listMode === "map") {
      const placeCounts = mappableCountsByDay(collectItineraryPlaces(trip.days))
      const transportCounts = mappableCountsByDay([
        ...collectMapSegments(trip.days),
        ...collectMapGatewayAnchors(trip.days),
      ])
      counts = mapMode === "places" ? placeCounts : transportCounts
    } else {
      counts = new Map()
      trip.days.forEach((day, index) => {
        counts.set(index + 1, day.items.length)
      })
    }
    return trip.days.map((day, index) => ({
      id: day.id,
      dayNumber: index + 1,
      heading: formatDayHeadingLine(
        index,
        day.label,
        formatDayDate(dateISOForDayIndex(trip.startDate, index)),
      ),
      mappableCount: counts.get(index + 1) ?? 0,
    }))
  }, [trip, mapMode, listMode])

  const onDragMoveItem = useCallback(
    (params: MoveParams) => {
      moveItemBetweenDays(tripId, params)
    },
    [moveItemBetweenDays, tripId],
  )

  useItineraryDnd({
    enabled: Boolean(trip) && viewMode === "itinerary" && listMode === "list",
    rootRef: daysFlipRef,
    scrollRef: listScrollRef,
    chromeRef: listChromeRef,
    lineRef: insertLineRef,
    capture: captureDaysFlip,
    onMove: onDragMoveItem,
  })

  const setDaySelected = useCallback((dayId: string, checked: boolean) => {
    setSelectedDayIds((prev) => {
      const n = new Set(prev)
      if (checked) n.add(dayId)
      else n.delete(dayId)
      return n
    })
  }, [])

  const handleRemoveItem = useCallback(
    (dayId: string, itemId: string) => {
      removeItemFromDay(tripId, dayId, itemId)
    },
    [removeItemFromDay, tripId],
  )

  const handleResetDay = useCallback((dayId: string) => {
    setPendingDayAction({ kind: "reset", dayId })
  }, [])

  const handleEditTransport = useCallback(
    (dayId: string, item: UserDayItem) => {
      openTransportDialog(dayId, item)
    },
    [openTransportDialog],
  )

  const routeTaskTotals = useMemo(
    () => (trip ? computeTripTaskTotals(buildTripTasks(trip)) : null),
    [trip],
  )

  if (!trip) return null

  const canRemoveSelectedDays = selectedDayIds.size > 0 && trip.days.length > 1
  const isRoute = viewMode === "itinerary"
  const categoryView = isRoute
    ? null
    : (viewMode as Exclude<ItineraryViewMode, "itinerary">)

  const handleDayListAction = () => {
    if (canRemoveSelectedDays) {
      setPendingDayAction({ kind: "remove", dayIds: Array.from(selectedDayIds) })
    } else {
      addDay(tripId)
    }
  }

  const confirmPendingDayAction = () => {
    if (!pendingDayAction) return
    if (pendingDayAction.kind === "reset") {
      clearDayItems(tripId, pendingDayAction.dayId)
    } else {
      removeSelectedDays(tripId, pendingDayAction.dayIds)
      setSelectedDayIds(new Set())
    }
    setPendingDayAction(null)
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        "relative flex min-w-0 flex-col bg-background",
        // Móvil: scrollea el documento (ver `trips-shell`), así que el panel
        // crece con su contenido. Nunca `overflow-hidden` aquí: convertiría el
        // panel en el scrollport de la cabecera sticky y su `top` la empujaría
        // hacia abajo hasta tapar la barra Lista / Calendario / Mapa.
        "max-md:min-h-[calc(100svh_-_var(--wp-header-height))]",
        "md:h-full md:overflow-hidden",
      )}
    >
      {/*
        Móvil: cabecera + barra de vista de Ruta forman UN bloque sticky bajo
        el header del shell. La barra tiene que ir dentro: si scrollea con el
        contenido, entrar en Calendario o Mapa —que no scrollean— deja al
        usuario sin forma de volver a Lista.
      */}
      <div
        ref={listChromeRef}
        className={cn(
          "shrink-0",
          "max-md:sticky max-md:top-[var(--wp-header-height)] max-md:z-20 max-md:bg-background",
        )}
      >
      <div
        className={cn(
          "relative shrink-0 border-b border-border/60 px-4",
          isMobile && headerCollapsed ? "pb-2 pt-2" : "space-y-3 py-3.5",
        )}
      >
        <div className="panel-column space-y-3">
        {/* Fila 1+2: título / fecha / meta — se repliegan en móvil al bajar */}
        <div
          className={cn(
            isMobile &&
              cn(
                "overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
                headerCollapsed ? "max-h-0 opacity-0" : "max-h-28 opacity-100",
              ),
          )}
        >
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              {onEditTrip ? (
                <button
                  type="button"
                  onClick={onEditTrip}
                  className={cn(
                    "inline-flex min-w-0 max-w-full items-center rounded-md text-left outline-none transition-colors",
                    "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring -ml-1 px-1 py-0.5",
                  )}
                  aria-label="Editar viaje"
                  title="Editar viaje"
                >
                  <h2 className="truncate text-sm font-semibold text-foreground max-md:text-lg max-md:tracking-tight">
                    {trip.name}
                  </h2>
                </button>
              ) : (
                <h2 className="truncate text-sm font-semibold text-foreground max-md:text-lg max-md:tracking-tight">
                  {trip.name}
                </h2>
              )}
              {onEditTrip ? (
                <button
                  type="button"
                  onClick={onEditTrip}
                  className={cn(
                    "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1 py-0.5",
                    "text-left outline-none transition-colors",
                    "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                  aria-label="Editar fechas del viaje"
                  title="Editar fechas"
                >
                  {dateSub ? (
                    <span className="truncate text-xs text-muted-foreground tabular-nums">
                      {dateSub}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Fechas</span>
                  )}
                  <Pencil
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                </button>
              ) : dateSub ? (
                <p className="text-xs text-muted-foreground tabular-nums">{dateSub}</p>
              ) : null}
            </div>
            {onClose ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 max-sm:h-11 max-sm:w-11 max-sm:rounded-full max-sm:bg-muted/80 max-sm:hover:bg-muted"
                onClick={onClose}
                aria-label="Cerrar Mi viaje"
              >
                <X className="h-4 w-4 max-sm:h-5 max-sm:w-5" />
              </Button>
            ) : null}
          </div>

          <p className="mt-3 text-xs text-muted-foreground tabular-nums">
            {itemCount} {itemCount === 1 ? "ítem" : "ítems"} · {trip.days.length}{" "}
            {trip.days.length === 1 ? "día" : "días"}
            {routeTaskTotals ? <TripTasksManagedFragment totals={routeTaskTotals} /> : null}
          </p>
        </div>

        {/* Fila 3: pestañas — siempre visibles */}
        <div className="min-h-8">
          <ItineraryViewModeTabs value={viewMode} onValueChange={setViewMode} />
        </div>

        {routeTaskTotals ? <TripTasksProgressHairline totals={routeTaskTotals} /> : null}
        </div>
      </div>

      {isRoute ? (
          <div className="flex shrink-0 items-center gap-3 px-4 py-2.5">
            <div className="panel-column flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <SegmentedControl
              items={[
                { id: "list" as const, label: "Lista", icon: List },
                { id: "calendar" as const, label: "Calendario", icon: CalendarDays },
                { id: "map" as const, label: "Mapa", icon: MapIcon },
              ]}
              value={listMode}
              onValueChange={handleListModeChange}
              ariaLabel="Vista de ruta"
              size="compact"
            />
            {trip.days.length > 1 && listMode !== "calendar" ? (
              <MapDayDropdown
                days={mapDayOptions}
                value={focusDayNumber == null ? null : focusDayId}
                onChange={handleFocusDayChange}
              />
            ) : null}
            {listMode === "map" ? (
              <MapModeDropdown value={mapMode} onChange={handleMapModeChange} />
            ) : null}
            {listMode === "list" ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() =>
                    openManualDialog(focusDayNumber == null ? null : focusDayId)
                  }
                  className="inline-flex min-h-8 shrink-0 items-center gap-1 text-xs font-medium text-foreground transition-colors hover:text-muted-foreground"
                  aria-label="Añadir ítem"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  Añadir ítem
                </button>
                <button
                  type="button"
                  onClick={handleDayListAction}
                  className={cn(
                    "inline-flex min-h-8 shrink-0 items-center gap-1 text-xs font-medium transition-colors",
                    canRemoveSelectedDays
                      ? "text-destructive hover:text-destructive/90"
                      : "text-foreground hover:text-muted-foreground",
                  )}
                  aria-label={
                    canRemoveSelectedDays
                      ? selectedDayIds.size > 1
                        ? "Eliminar días"
                        : "Eliminar día"
                      : "Añadir día"
                  }
                >
                  {canRemoveSelectedDays ? (
                    <>
                      <X className="h-3.5 w-3.5 shrink-0" />
                      {selectedDayIds.size > 1 ? "Eliminar días" : "Eliminar día"}
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                      Añadir día
                    </>
                  )}
                </button>
              </div>
            ) : null}
            </div>
          </div>
      ) : null}
      </div>

      {isRoute ? (
        <>
          {listMode === "list" ? (
            <div
              ref={listScrollRef}
              className="px-4 pb-6 pt-2 max-md:pb-[var(--wp-nav-clearance)] md:min-h-0 md:flex-1 md:overflow-y-auto"
            >
              <div ref={daysFlipRef} className="panel-column relative">
              <div
                ref={insertLineRef}
                aria-hidden
                className="wp-insert-line pointer-events-none absolute left-0 right-0 z-[2] hidden"
              />
              {trip.days.map((day, dayIndex) =>
                inDayScope(focusDayNumber, dayIndex + 1) ? (
                  <DaySection
                    key={day.id}
                    tripId={tripId}
                    dayId={day.id}
                    dayIndex={dayIndex}
                    days={trip.days}
                    flightSearchTrip={flightSearchTrip}
                    dayDescription={getDayUserDescription(day.label)}
                    dayDateLabel={
                      formatDayDate(dateISOForDayIndex(trip.startDate, dayIndex))
                    }
                    summarySignature={day.summarySignature ?? null}
                    countryCodes={trip.countries}
                    items={day.items}
                    resolveRegion={resolveRegion}
                    isDaySelected={selectedDayIds.has(day.id)}
                    onDaySelectChange={setDaySelected}
                    onResetDay={handleResetDay}
                    onRemoveItem={handleRemoveItem}
                    onAddManualItem={openManualDialog}
                    onSetTaskState={handleSetTaskState}
                    taskStates={trip.tasks}
                    showOutboundPlaceholder={
                      dayIndex === 0 && !hasRouteLeg(trip.days, "outbound")
                    }
                    showReturnPlaceholder={
                      dayIndex === trip.days.length - 1 && !hasRouteLeg(trip.days, "return")
                    }
                    onOpenRouteLeg={openRouteLegDialog}
                    onEditTransport={handleEditTransport}
                    updateDayLabel={updateDayLabel}
                    applyDaySummary={applyDaySummary}
                  />
                ) : null,
              )}
              </div>
            </div>
          ) : listMode === "calendar" ? (
            // Móvil: alto propio, porque el panel ya no acota (el documento
            // scrollea). El `flex-1` de dentro necesita una caja real.
            <div className="flex flex-col overflow-hidden px-4 pb-4 pt-1 max-md:h-[70svh] max-md:pb-[var(--wp-nav-clearance)] md:min-h-0 md:flex-1">
              <ItineraryCalendarView
                key={trip.startDate ?? "nodates"}
                startDate={trip.startDate}
                numDays={trip.days.length}
                days={trip.days}
                onEditTrip={onEditTrip}
                onOpenDay={openDayFromCalendar}
              />
            </div>
          ) : (
            // Ídem Calendario: el mapa necesita alto explícito o Mapbox
            // se queda en el `min-h-[280px]` de su contenedor.
            <div className="flex flex-col overflow-hidden px-4 pb-4 pt-1 max-md:h-[70svh] max-md:pb-[var(--wp-nav-clearance)] md:min-h-0 md:flex-1">
              <ItineraryMapView
                places={mapPlaces}
                hubs={mapHubs}
                segments={mapSegments}
                transportDistances={mapTransportDistances}
                mapMode={mapMode}
                focusDayNumber={focusDayNumber}
                focusDayLabel={
                  focusDayNumber == null ? null : `Día ${focusDayNumber}`
                }
                onMapModeChange={handleMapModeChange}
                countryCodes={mapCountries}
                destination={mapDestHint ?? ""}
                onPersistItemCoords={(itemId, coords, region) => {
                  setDayItemCoords(tripId, itemId, coords, region)
                }}
              />
            </div>
          )}
        </>
      ) : categoryView ? (
        <>
          <div className="flex shrink-0 justify-end px-4 py-2.5">
            <TripTasksSummaryDetail
              trip={trip}
              categories={VIEW_MODE_TASK_CATEGORIES[categoryView]}
            />
          </div>
          <TripTasksPanel
            trip={trip}
            categories={VIEW_MODE_TASK_CATEGORIES[categoryView]}
            defaultCategory={VIEW_MODE_DEFAULT_TASK_CATEGORY[categoryView]}
            addActionLabel={VIEW_MODE_ADD_ACTION_LABEL[categoryView]}
            emptyTitle={CATEGORY_EMPTY[categoryView].title}
            emptyDescription={CATEGORY_EMPTY[categoryView].description}
            hideSummary
            extraDialogOpen={extraTaskDialogOpen}
            onExtraDialogOpenChange={setExtraTaskDialogOpen}
            onAddAction={
              categoryView === "transport"
                ? () => setTransportDialog({ dayId: null })
                : categoryView === "activities"
                  ? () => openManualDialog(null, "activity")
                  : categoryView === "stay"
                    ? () => openManualDialog(null, "stay")
                    : undefined
            }
            onEditTransportItem={
              categoryView === "transport"
                ? ({ dayId, item }) => {
                    if (isRouteLegItem(item)) {
                      const leg = item.route?.leg
                      if (leg === "outbound" || leg === "return") {
                        openRouteLegDialog(leg, item)
                        return
                      }
                    }
                    openTransportDialog(dayId, item)
                  }
                : undefined
            }
            onSetTaskState={handleSetTaskState}
            onAddExtraTask={handleAddExtraTask}
            onRemoveExtraTask={handleRemoveExtraTask}
            onRemoveBasic={handleRemoveBasic}
            countryTasks={
              categoryView === "basics"
                ? {
                    sources: tripSources,
                    onAccept: handleAcceptCountryTask,
                    onDismiss: handleDismissCountryTask,
                    onReevaluate: handleReevaluateCountryTasks,
                  }
                : undefined
            }
          />
        </>
      ) : null}

      <AddManualItemDialog
        open={manualDialogOpen}
        onOpenChange={(next) => {
          setManualDialogOpen(next)
          if (!next) {
            setManualDialogDayId(null)
            setManualDialogInitialType(null)
          }
        }}
        days={trip.days}
        initialDayId={manualDialogDayId}
        initialType={manualDialogInitialType}
        countryCodes={mapCountries}
        destinationHint={mapDestHint}
        onSubmit={(item, dayId) => {
          addItemToDay(tripId, dayId, item)
        }}
        onRequestTransport={(dayId) => {
          setManualDialogOpen(false)
          openTransportDialog(dayId)
        }}
      />

      {routeLegDialog ? (
        <RouteLegDialog
          open
          onOpenChange={(next) => {
            if (!next) setRouteLegDialog(null)
          }}
          leg={routeLegDialog.leg}
          trip={trip}
          existingItem={routeLegDialog.existingItem}
          onSubmit={(data) => {
            const result = upsertRouteLeg(tripId, {
              leg: data.leg,
              route: data.route,
              detail: data.detail,
              vendor: data.vendor,
              origin: data.origin,
              createMirrorReturn: data.createMirrorReturn,
            })
            if (!result.ok) toast.error(result.error)
          }}
        />
      ) : null}

      {transportDialog ? (
        <TransportRouteDialog
          open
          onOpenChange={(next) => {
            if (!next) setTransportDialog(null)
          }}
          days={trip.days}
          initialDayId={transportDialog.dayId}
          existingItem={transportDialog.existingItem}
          onSubmit={(data) => {
            const result = upsertTransportRouteItem(tripId, data)
            if (!result.ok) toast.error(result.error)
          }}
        />
      ) : null}

      <DayDestructiveConfirmDialog
        action={pendingDayAction}
        days={trip.days}
        onOpenChange={(open) => {
          if (!open) setPendingDayAction(null)
        }}
        onConfirm={confirmPendingDayAction}
      />
    </div>
  )
}

function DayItineraryTimeline({
  items,
  dayIndex,
  days,
  flightSearchTrip,
  resolveRegion,
  onRemoveItem,
  taskStates,
  onSetTaskState,
  onEditRouteLeg,
  onEditTransport,
  emphasized = false,
}: {
  items: UserDayItem[]
  dayIndex: number
  days: UserDay[]
  flightSearchTrip: Pick<Trip, "startDate" | "numDays" | "numTravelers" | "currency">
  resolveRegion: (item: UserDayItem) => string | null
  onRemoveItem: (itemId: string) => void
  taskStates: Record<string, TripTaskState>
  onSetTaskState: (taskKey: string, patch: Partial<TripTaskState>) => void
  onEditRouteLeg?: (item: UserDayItem) => void
  onEditTransport?: (item: UserDayItem) => void
  /** Día marcado en el checkbox: resalta las cards del día. */
  emphasized?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const firstLiRef = useRef<HTMLLIElement | null>(null)
  const lastLiRef = useRef<HTMLLIElement | null>(null)
  const [line, setLine] = useState({ top: 0, height: 0 })

  const itemIds = useMemo(() => items.map((i) => i.id).join("\0"), [items])

  // Altura de la línea vertical entre el centro del primer y último punto; depende de layout y de ResizeObserver.
  const measure = useCallback(() => {
    const w = wrapRef.current
    const a = firstLiRef.current
    const b = lastLiRef.current
    if (!w || !a || !b) return
    const wr = w.getBoundingClientRect()
    const ar = a.getBoundingClientRect()
    const br = b.getBoundingClientRect()
    const y1 = ar.top - wr.top + ar.height / 2
    const y2 = br.top - wr.top + br.height / 2
    const h = Math.max(0, y2 - y1)
    setLine((prev) => (prev.top === y1 && prev.height === h ? prev : { top: y1, height: h }))
  }, [])

  useLayoutEffect(() => {
    measure()
  }, [measure, itemIds])

  useLayoutEffect(() => {
    const w = wrapRef.current
    if (!w) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(w)
    window.addEventListener("resize", measure)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [measure])

  const n = items.length
  const showLine = n > 1 && line.height > 0.5

  return (
    <div ref={wrapRef} className="relative pl-0">
      {showLine && (
        <div
          className="pointer-events-none absolute left-2.5 z-0 hidden w-px bg-border @md:block"
          style={{ top: line.top, height: line.height }}
          aria-hidden
        />
      )}
      <ul className="relative z-[1] m-0 list-none space-y-2.5 p-0">
        {items.map((item, index) => {
          const taskKey = taskKeyForItem(item)
          const state = taskStates[taskKey] ?? null
          const status = resolveTaskStatus(state)
          const bucket = taskBucket(categoryFromItemType(item.type), state, "dayItem")
          const titleAdornment =
            bucket === "triage" || bucket === "dismissed" ? null : (
              <RouteTaskIndicator bucket={bucket} status={status} />
            )
          const taskIndicator =
            bucket === "dismissed" ? (
              <RouteTaskIndicator
                bucket={bucket}
                status={status}
                onRestore={() => onSetTaskState(taskKey, { status: "pending" })}
              />
            ) : null
          const isLeg = isRouteLegItem(item)
          const routeSummary =
            item.type === "transport" && (item.route || item.vendor)
              ? formatRouteSummary({
                  mode: item.route?.mode,
                  leg: item.route?.leg,
                  vendor: item.vendor,
                }) || null
              : null
          const transportVisual =
            item.type === "transport" ? transportIconForItem(item) : null
          return (
            <li
              key={item.id}
              data-flip-id={item.id}
              {...(!isLeg ? { "data-wp-draggable": "1" } : {})}
              ref={(el) => {
                if (index === 0) firstLiRef.current = el
                if (index === n - 1) lastLiRef.current = el
              }}
              className="relative flex min-h-0 items-center gap-0 @md:gap-3 [@media(hover:hover)_and_(pointer:fine)]:hover:z-[2]"
            >
              <div className="z-10 hidden w-5 shrink-0 items-center justify-center @md:flex" aria-hidden>
                <div
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-card",
                    ITEM_DOT_COLORS[item.type],
                  )}
                />
              </div>
              <TravelItemCard
                className={cn(
                  "min-w-0 flex-1 transition-[border-color,box-shadow,background-color,transform]",
                  emphasized && "border-foreground/25 bg-muted/40 shadow-md",
                )}
                variant="planned"
                title={item.name}
                type={item.type}
                sourceId={item.sourceId}
                sourceAuthor={item.sourceAuthor}
                detail={item.detail}
                regionLabel={resolveRegion(item)}
                href={
                  item.type === "stay"
                    ? stayReserveHref({
                        type: item.type,
                        name: item.name,
                        region: item.region,
                        sourceId: item.sourceId,
                        affiliateUrl: item.affiliateUrl,
                        startDate: flightSearchTrip.startDate,
                        dayIndexes: stayDayIndexesForItem(days, item),
                        currency: flightSearchTrip.currency,
                        numTravelers: flightSearchTrip.numTravelers,
                      })
                    : item.affiliateUrl
                }
                outboundSurface="route_card"
                outboundAffiliate={item.affiliateUrl ? "partner" : "auto"}
                flightSearch={
                  item.route
                    ? flightSearchHrefForItem({
                        route: item.route,
                        dayIndex,
                        trip: flightSearchTrip,
                        days,
                      })
                    : null
                }
                routeSummary={routeSummary}
                transportIcon={transportVisual?.Icon}
                transportIconLabel={transportVisual?.label}
                onRemove={() => onRemoveItem(item.id)}
                onEdit={
                  isLeg && onEditRouteLeg
                    ? () => onEditRouteLeg(item)
                    : item.type === "transport" && onEditTransport
                      ? () => onEditTransport(item)
                      : undefined
                }
                editAriaLabel={
                  isLeg
                    ? item.route?.leg === "outbound"
                      ? "Editar viaje de ida"
                      : "Editar viaje de vuelta"
                    : "Editar traslado"
                }
                titleAdornment={titleAdornment}
                taskIndicator={taskIndicator}
                moveControls={isLeg ? undefined : <DragHandle />}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function DragHandle() {
  return (
    <div
      data-wp-drag-handle=""
      role="button"
      tabIndex={0}
      aria-label="Reordenar ítem"
      className="inline-flex h-8 w-7 items-center justify-center rounded-lg text-foreground/40 transition-colors hover:bg-muted/60 hover:text-foreground/70"
    >
      <GripVertical className="h-4 w-4" strokeWidth={1.8} aria-hidden />
    </div>
  )
}

function RouteTaskIndicator({
  bucket,
  status,
  onRestore,
}: {
  bucket: "main" | "dismissed"
  status: "pending" | "booked" | "paid" | "notNeeded"
  onRestore?: () => void
}) {
  if (bucket === "dismissed" && onRestore) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onRestore()
        }}
        className="inline-flex h-8 max-w-[4.5rem] items-center rounded-md px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Quitar «sin reserva»"
        aria-label="Restaurar tarea: quitar sin reserva"
      >
        Sin reserva
      </button>
    )
  }

  if (status === "booked" || status === "paid") {
    const label = status === "paid" ? TASK_STATUS_LABELS.paid : TASK_STATUS_LABELS.booked
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="mt-[3px] inline-flex shrink-0 items-center text-emerald-700"
            aria-label={label}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          sideOffset={6}
          avoidCollisions={false}
          className="overflow-visible border-none bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-sm"
        >
          {label}
          <TooltipArrow className="fill-foreground" width={10} height={5} />
        </TooltipContent>
      </Tooltip>
    )
  }

  // Solo tareas del bucket main pendientes: punto discreto.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center"
          aria-label={TASK_STATUS_LABELS.pending}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        sideOffset={6}
        avoidCollisions={false}
        className="overflow-visible border-none bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-sm"
      >
        {TASK_STATUS_LABELS.pending}
        <TooltipArrow className="fill-foreground" width={10} height={5} />
      </TooltipContent>
    </Tooltip>
  )
}

const DaySection = memo(function DaySection({
  tripId,
  dayId,
  dayIndex,
  days,
  flightSearchTrip,
  dayDescription,
  dayDateLabel,
  summarySignature,
  countryCodes,
  items,
  resolveRegion,
  isDaySelected,
  onDaySelectChange,
  onResetDay,
  onRemoveItem,
  onAddManualItem,
  taskStates,
  onSetTaskState,
  showOutboundPlaceholder,
  showReturnPlaceholder,
  onOpenRouteLeg,
  onEditTransport,
  updateDayLabel,
  applyDaySummary,
}: {
  tripId: string
  dayId: string
  dayIndex: number
  days: UserDay[]
  flightSearchTrip: Pick<Trip, "startDate" | "numDays" | "numTravelers" | "currency">
  dayDescription: string
  dayDateLabel: string | null
  summarySignature: string | null
  countryCodes: string[]
  items: UserDayItem[]
  resolveRegion: (item: UserDayItem) => string | null
  isDaySelected: boolean
  onDaySelectChange: (dayId: string, checked: boolean) => void
  onResetDay: (dayId: string) => void
  onRemoveItem: (dayId: string, itemId: string) => void
  onAddManualItem: (dayId?: string | null) => void
  taskStates: Record<string, TripTaskState>
  onSetTaskState: (taskKey: string, patch: Partial<TripTaskState>) => void
  showOutboundPlaceholder: boolean
  showReturnPlaceholder: boolean
  onOpenRouteLeg: (leg: RouteLeg, existingItem?: UserDayItem | null) => void
  onEditTransport: (dayId: string, item: UserDayItem) => void
  updateDayLabel: (tripId: string, dayId: string, label: string) => void
  applyDaySummary: (
    tripId: string,
    dayId: string,
    data: { label: string; signature: string },
  ) => void
}) {
  const [editingDescription, setEditingDescription] = useState(false)
  const [draft, setDraft] = useState(dayDescription)
  const [generating, setGenerating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const descriptionEditorRef = useRef<HTMLDivElement>(null)

  const signature = useMemo(() => dayItemsSignature(items), [items])
  const canGenerate =
    items.length >= 1 && signature !== (summarySignature ?? null) && !generating
  const showAiButton = items.length >= 1
  const canReset = items.some((i) => !isRouteLegItem(i))

  useEffect(() => {
    if (!editingDescription) setDraft(dayDescription)
  }, [dayDescription, editingDescription])

  useEffect(() => {
    if (isDaySelected) setEditingDescription(false)
  }, [isDaySelected])

  useEffect(() => {
    if (editingDescription) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [editingDescription])

  const commitDescription = useCallback(() => {
    const trimmed = draft.trim()
    updateDayLabel(tripId, dayId, trimmed)
    setEditingDescription(false)
  }, [draft, tripId, dayId, updateDayLabel])

  // Guarda la descripción al pinchar fuera del control (equivalente a aceptar), en fase capture.
  useEffect(() => {
    if (!editingDescription) return

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (descriptionEditorRef.current?.contains(target)) return
      commitDescription()
    }

    document.addEventListener("pointerdown", handlePointerDownOutside, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside, true)
    }
  }, [editingDescription, commitDescription])

  const cancelDescription = () => {
    setDraft(dayDescription)
    setEditingDescription(false)
  }

  const startEdit = () => {
    setDraft(dayDescription)
    setEditingDescription(true)
  }

  const handleGenerateSummary = async () => {
    if (!canGenerate) return
    setGenerating(true)
    try {
      const summary = await generateDaySummary({
        items: items.map((i) => ({
          type: i.type,
          name: i.name,
          region: resolveRegion(i),
        })),
        country_codes: countryCodes,
        day_index: dayIndex,
      })
      applyDaySummary(tripId, dayId, { label: summary, signature })
      setDraft(summary)
    } catch (err) {
      if (err instanceof ApiLimitError) {
        toast.error(err.message)
      } else {
        toast.error(
          err instanceof Error ? err.message : "No se pudo generar la descripción.",
        )
      }
    } finally {
      setGenerating(false)
    }
  }

  const headingForAria = formatDayHeadingLine(dayIndex, dayDescription, dayDateLabel)
  const normalizedDesc = dayDescription.trim() ? normalizeDayLabel(dayDescription) : null

  return (
    <div
      data-day-id={dayId}
      className="mb-7 scroll-mt-3 rounded-md last:mb-0 motion-safe:transition-colors motion-safe:duration-300 data-[day-highlight]:bg-muted/70"
    >
      <div className="mb-3 flex min-w-0 items-start gap-2.5 @md:items-center">
        <div className="flex shrink-0 items-center pt-0.5 @md:pt-0" onPointerDown={(e) => e.stopPropagation()}>
          <Checkbox
            id={`day-select-${dayId}`}
            checked={isDaySelected}
            onCheckedChange={(c) => onDaySelectChange(dayId, c === true)}
            className="size-4"
            aria-label={`Marcar ${headingForAria}`}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <div ref={descriptionEditorRef} className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-[15px] font-semibold tabular-nums">Día {dayIndex + 1}</span>
            {dayDateLabel ? (
              <>
                <span className="hidden shrink-0 text-[15px] text-muted-foreground @md:inline" aria-hidden>
                  ·
                </span>
                <span className="hidden shrink-0 text-[15px] font-medium tabular-nums leading-tight text-muted-foreground @md:inline">
                  {dayDateLabel}
                </span>
              </>
            ) : null}
            <span
              className="shrink-0 text-[15px] leading-tight text-muted-foreground"
              aria-hidden
            >
              ·
            </span>
            {isDaySelected ? (
              <button
                type="button"
                onClick={() => onResetDay(dayId)}
                disabled={!canReset}
                className={cn(
                  "inline-flex min-h-8 shrink-0 items-center gap-1 text-xs font-medium transition-colors",
                  canReset
                    ? "text-destructive hover:text-destructive/90"
                    : "cursor-not-allowed text-destructive/40",
                )}
                aria-label="Reiniciar día"
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                Reiniciar día
              </button>
            ) : (
              <>
            {editingDescription ? (
              <>
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      commitDescription()
                    }
                    if (e.key === "Escape") {
                      e.preventDefault()
                      cancelDescription()
                    }
                  }}
                  className="min-w-0 flex-1 truncate border-b border-primary bg-transparent py-0.5 text-[15px] font-semibold leading-tight text-foreground outline-none placeholder:text-muted-foreground/60"
                  placeholder="Descripción del día"
                  aria-label="Descripción del día"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-foreground/80 hover:text-foreground"
                  onClick={commitDescription}
                  aria-label="Guardar descripción"
                >
                  <Check className="h-4 w-4" strokeWidth={2.2} />
                </Button>
              </>
            ) : (
              <button
                type="button"
                onClick={startEdit}
                className={cn(
                  "min-w-0 flex-1 cursor-pointer select-none truncate text-left text-[15px] leading-tight",
                  "rounded-sm ring-offset-2 transition-colors",
                  "hover:bg-muted/60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  normalizedDesc
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground",
                )}
                aria-label={normalizedDesc ? "Editar descripción del día" : "Añadir descripción del día"}
              >
                {normalizedDesc ?? "Sin descripción"}
              </button>
            )}
            {showAiButton ? (
              canGenerate || generating ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => void handleGenerateSummary()}
                      disabled={generating}
                      aria-label="Sugerir descripción del día"
                      className={cn(
                        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
                        "text-muted-foreground hover:bg-muted hover:text-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        generating && "cursor-wait",
                      )}
                    >
                      {generating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                  </TooltipTrigger>
                  {!generating ? (
                    <TooltipContent
                      side="left"
                      align="center"
                      sideOffset={6}
                      avoidCollisions={false}
                      className="overflow-visible border-none bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-sm"
                    >
                      Sugerir descripción del día
                      <TooltipArrow className="fill-foreground" width={10} height={5} />
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              ) : (
                <button
                  type="button"
                  disabled
                  aria-label="Sugerir descripción del día"
                  className="inline-flex h-6 w-6 shrink-0 cursor-default items-center justify-center rounded-md text-muted-foreground/35"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                </button>
              )
            ) : null}
              </>
            )}
          </div>
          {dayDateLabel ? (
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground @md:hidden">
              {dayDateLabel}
            </span>
          ) : null}
        </div>
      </div>

      {showOutboundPlaceholder ? (
        <div className="mb-2.5 space-y-1.5">
          <RouteLegPlaceholder
            leg="outbound"
            onClick={() => onOpenRouteLeg("outbound")}
            emphasized={isDaySelected}
          />
          {items.length === 0 ? (
            <p className="px-1 text-center text-xs text-muted-foreground">
              o{" "}
              <button
                type="button"
                onClick={() => onAddManualItem(dayId)}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                añade un ítem propio
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 && !showOutboundPlaceholder && !showReturnPlaceholder ? (
        <div
          className={cn(
            "rounded-2xl border-2 border-dashed px-4 py-5 text-center text-sm text-muted-foreground transition-colors",
            isDaySelected
              ? "border-foreground/30 bg-muted/40 shadow-sm"
              : "border-muted-foreground/20 bg-muted/20",
          )}
        >
          <p>
            Añade elementos desde Fuentes o{" "}
            <button
              type="button"
              onClick={() => onAddManualItem(dayId)}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              añade uno propio
            </button>
            .
          </p>
        </div>
      ) : items.length > 0 ? (
        <DayItineraryTimeline
          items={items}
          dayIndex={dayIndex}
          days={days}
          flightSearchTrip={flightSearchTrip}
          resolveRegion={resolveRegion}
          onRemoveItem={(itemId) => onRemoveItem(dayId, itemId)}
          taskStates={taskStates}
          onSetTaskState={onSetTaskState}
          emphasized={isDaySelected}
          onEditRouteLeg={(item) => {
            const leg = item.route?.leg
            if (leg === "outbound" || leg === "return") onOpenRouteLeg(leg, item)
          }}
          onEditTransport={(item) => onEditTransport(dayId, item)}
        />
      ) : null}

      {showReturnPlaceholder ? (
        <div className={cn("space-y-1.5", items.length > 0 || showOutboundPlaceholder ? "mt-2.5" : "")}>
          <RouteLegPlaceholder
            leg="return"
            onClick={() => onOpenRouteLeg("return")}
            emphasized={isDaySelected}
          />
          {items.length === 0 && !showOutboundPlaceholder ? (
            <p className="px-1 text-center text-xs text-muted-foreground">
              o{" "}
              <button
                type="button"
                onClick={() => onAddManualItem(dayId)}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                añade un ítem propio
              </button>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})

function RouteLegPlaceholder({
  leg,
  onClick,
  emphasized = false,
}: {
  leg: RouteLeg
  onClick: () => void
  emphasized?: boolean
}) {
  const label =
    leg === "outbound" ? "Añadir tu viaje de ida" : "Añadir tu viaje de vuelta"
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed",
        "px-4 py-4 text-sm font-medium transition-colors",
        "text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        emphasized
          ? "border-foreground/30 bg-muted/40 shadow-sm"
          : "border-muted-foreground/25 bg-muted/20",
      )}
      aria-label={label}
    >
      <Plus className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </button>
  )
}
