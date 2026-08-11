"use client"

/**
 * Panel «Mi viaje»: una sola cabecera con pestañas
 * Ruta · Actividades · Alojamientos · Transporte · Básicos.
 * Ruta = timeline + Lista/Mapa; el resto = filas de tarea por categoría.
 */
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react"
import {
  Check,
  ChevronDown,
  ChevronUp,
  List,
  Loader2,
  Map as MapIcon,
  Pencil,
  Plus,
  Sparkles,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { SegmentedControl } from "@/components/segmented-control"
import { useCollapsingHeader } from "@/hooks/use-collapsing-header"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { formatDayHeadingLine, getDayUserDescription } from "@/lib/day-heading"
import { countriesPlainList } from "@/lib/countries"
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
} from "@/lib/trip-tasks"
import type { ItemType, RouteLeg, TripTaskCategory, TripTaskState, UserDayItem } from "@/types/itinerary"
import {
  ItineraryViewModeTabs,
  VIEW_MODE_ADD_ACTION_LABEL,
  VIEW_MODE_DEFAULT_TASK_CATEGORY,
  VIEW_MODE_TASK_CATEGORIES,
  type ItineraryViewMode,
} from "@/components/itinerary-view-mode-tabs"
import { ItineraryMapView, MapModeDropdown, persistMapMode, readStoredMapMode, type ItineraryMapPoint, type MapViewMode } from "@/components/itinerary-map-view"
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
} from "@/lib/map-route-geometry"
import {
  TripTasksManagedFragment,
  TripTasksPanel,
  TripTasksProgressHairline,
  TripTasksSummaryDetail,
} from "@/components/trip-tasks-panel"
import { hasRouteLeg, isRouteLegItem } from "@/lib/route-legs"

const CATEGORY_EMPTY: Record<
  Exclude<ItineraryViewMode, "itinerary">,
  { title: string; description: string }
> = {
  activities: {
    title: "Sin actividades que gestionar",
    description:
      "Consolida actividades o restaurantes en la Ruta, o añade una tarea a mano.",
  },
  stay: {
    title: "Sin alojamientos que gestionar",
    description: "Consolida estancias en la Ruta o añade una tarea a mano.",
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

function normalizeDayLabel(raw: string): string {
  return raw.replace(/\s+[—–]\s+/g, " - ")
}

export default function ItineraryPanel({
  tripId,
  onClose,
  onEditTrip,
}: {
  tripId: string
  onClose?: () => void
  /** Abre el diálogo de edición del viaje (fechas, nombre, etc.). */
  onEditTrip?: () => void
}) {
  const {
    getTrip,
    getTripSources,
    addDay,
    addItemToDay,
    removeItemFromDay,
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
  } = useTrips()
  const trip = getTrip(tripId)
  const isMobile = useIsMobile()
  const {
    containerRef: panelRef,
    collapsed: headerCollapsed,
    setCollapsed: setHeaderCollapsed,
  } = useCollapsingHeader(isMobile)
  const dateSub = useMemo(
    () => (trip ? formatTripDates(trip.startDate, trip.endDate) : null),
    [trip],
  )
  const itemCount = useMemo(
    () => (trip ? trip.days.reduce((sum, d) => sum + d.items.length, 0) : 0),
    [trip],
  )
  const tripSources = getTripSources(tripId)
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
  const [selectedDayIds, setSelectedDayIds] = useState<Set<string>>(() => new Set())
  const [viewMode, setViewMode] = useState<ItineraryViewMode>("itinerary")
  const [listMode, setListMode] = useState<"list" | "map">("list")
  // Recorrido por defecto; preferencia de localStorage tras hidratar.
  const [mapMode, setMapMode] = useState<MapViewMode>("places")

  useEffect(() => {
    const stored = readStoredMapMode()
    queueMicrotask(() => {
      if (stored !== "places") setMapMode(stored)
    })
  }, [])

  const handleMapModeChange = useCallback((next: MapViewMode) => {
    setMapMode(next)
    persistMapMode(next)
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
      return next
    })
  }, [trip])

  // Lugares del recorrido (stay/food/activity) en orden de introducción.
  const mapPlaces: ItineraryMapPoint[] = useMemo(() => {
    if (!trip) return []
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
  }, [trip, resolveRegion])

  // Anclas de llegada/salida cuando ida/vuelta no van por carretera.
  const mapHubs: ItineraryMapPoint[] = useMemo(() => {
    if (!trip) return []
    return collectMapGatewayAnchors(trip.days).map((g) => ({
      id: `hub:${g.role}:${g.itemId}`,
      name: g.label,
      type: "hub" as const,
      dayNumber: g.dayNumber,
      coords: { lng: g.lng, lat: g.lat },
      hubRole: g.role,
    }))
  }, [trip])

  const mapSegments = useMemo(
    () => (trip ? collectMapSegments(trip.days) : []),
    [trip],
  )

  const mapTransportDistances = useMemo(
    () =>
      trip
        ? collectTransportDistances(trip.days)
        : {
            byMode: {},
            drawnKm: 0,
            undrawn: [],
            undrawnKm: 0,
            totalKm: 0,
          },
    [trip],
  )

  // Índice de posición global (por día) para reglas de flechas arriba/abajo; debe coincidir con `moveItemOneStep`.
  const itemLocationById = useMemo(() => {
    const map = new Map<string, { dayId: string; dayIndex: number; itemIndex: number }>()
    if (!trip) return map
    trip.days.forEach((day, dayIndex) => {
      day.items.forEach((item, itemIndex) => {
        map.set(item.id, { dayId: day.id, dayIndex, itemIndex })
      })
    })
    return map
  }, [trip])

  const canMoveUp = useCallback(
    (itemId: string) => {
      const loc = itemLocationById.get(itemId)
      if (!loc) return false
      return loc.itemIndex > 0 || loc.dayIndex > 0
    },
    [itemLocationById],
  )

  const canMoveDown = useCallback(
    (itemId: string) => {
      if (!trip) return false
      const loc = itemLocationById.get(itemId)
      if (!loc) return false
      const day = trip.days[loc.dayIndex]
      const hasNextInSameDay = !!day && loc.itemIndex < day.items.length - 1
      const hasNextDay = loc.dayIndex < trip.days.length - 1
      return hasNextInSameDay || hasNextDay
    },
    [itemLocationById, trip],
  )

  const moveItemOneStep = useCallback(
    (itemId: string, direction: "up" | "down") => {
      if (!trip) return
      const current = itemLocationById.get(itemId)
      if (!current) return
      const currentDay = trip.days[current.dayIndex]
      if (!currentDay) return

      let toDayId = current.dayId
      let toIndex = current.itemIndex

      if (direction === "up") {
        if (current.itemIndex > 0) {
          toIndex = current.itemIndex - 1
        } else {
          const prevDay = trip.days[current.dayIndex - 1]
          if (!prevDay) return
          toDayId = prevDay.id
          toIndex = prevDay.items.length
        }
      } else {
        if (current.itemIndex < currentDay.items.length - 1) {
          toIndex = current.itemIndex + 1
        } else {
          // Pasar al día siguiente aunque esté vacío (índice 0) para no saltar días sin ítems.
          const nextDay = trip.days[current.dayIndex + 1]
          if (!nextDay) return
          toDayId = nextDay.id
          toIndex = 0
        }
      }

      moveItemBetweenDays(tripId, {
        fromDayId: current.dayId,
        toDayId,
        itemId,
        toIndex,
      })
    },
    [itemLocationById, moveItemBetweenDays, trip, tripId],
  )

  if (!trip) return null

  const hasDaySelection = selectedDayIds.size > 0
  const isRoute = viewMode === "itinerary"
  const categoryView = isRoute
    ? null
    : (viewMode as Exclude<ItineraryViewMode, "itinerary">)

  const setDaySelected = (dayId: string, checked: boolean) => {
    setSelectedDayIds((prev) => {
      const n = new Set(prev)
      if (checked) n.add(dayId)
      else n.delete(dayId)
      return n
    })
  }

  const handleDayListAction = () => {
    if (hasDaySelection) {
      removeSelectedDays(tripId, Array.from(selectedDayIds))
      setSelectedDayIds(new Set())
    } else {
      addDay(tripId)
    }
  }

  return (
    <div
      ref={panelRef}
      className="relative flex h-full min-w-0 flex-col overflow-hidden bg-background"
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
            <TripTasksManagedFragment trip={trip} />
          </p>
        </div>

        {/* Fila 3: pestañas — siempre visibles */}
        <div className="min-h-8">
          <ItineraryViewModeTabs value={viewMode} onValueChange={setViewMode} />
        </div>

        <TripTasksProgressHairline trip={trip} />
        </div>
      </div>

      {isRoute ? (
        <>
          <div className="flex shrink-0 items-center gap-3 px-4 py-2.5">
            <div className="panel-column flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <SegmentedControl
              items={[
                { id: "list" as const, label: "Lista", icon: List },
                { id: "map" as const, label: "Mapa", icon: MapIcon },
              ]}
              value={listMode}
              onValueChange={setListMode}
              ariaLabel="Vista de ruta"
              size="compact"
            />
            {listMode === "map" ? (
              <MapModeDropdown value={mapMode} onChange={handleMapModeChange} />
            ) : null}
            {listMode === "list" ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => openManualDialog(null)}
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
                    hasDaySelection
                      ? "text-destructive hover:text-destructive/90"
                      : "text-foreground hover:text-muted-foreground",
                  )}
                  aria-label={
                    hasDaySelection
                      ? selectedDayIds.size > 1
                        ? "Eliminar días"
                        : "Eliminar día"
                      : "Añadir día"
                  }
                >
                  {hasDaySelection ? (
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

          {listMode === "list" ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2 max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
              <div className="panel-column">
              {trip.days.map((day, dayIndex) => (
                <DaySection
                  key={day.id}
                  tripId={tripId}
                  dayId={day.id}
                  dayIndex={dayIndex}
                  dayCount={trip.days.length}
                  dayDescription={getDayUserDescription(day.label)}
                  dayDateLabel={
                    formatDayDate(dateISOForDayIndex(trip.startDate, dayIndex))
                  }
                  summarySignature={day.summarySignature ?? null}
                  countryCodes={trip.countries}
                  items={day.items}
                  resolveRegion={resolveRegion}
                  isDaySelected={selectedDayIds.has(day.id)}
                  onDaySelectChange={(checked) => setDaySelected(day.id, checked)}
                  onRemoveItem={(itemId) => removeItemFromDay(tripId, day.id, itemId)}
                  canMoveItemUp={canMoveUp}
                  canMoveItemDown={canMoveDown}
                  onMoveItemUp={(itemId) => moveItemOneStep(itemId, "up")}
                  onMoveItemDown={(itemId) => moveItemOneStep(itemId, "down")}
                  onAddManualItem={() => openManualDialog(day.id)}
                  onSetTaskState={handleSetTaskState}
                  taskStates={trip.tasks}
                  showOutboundPlaceholder={
                    dayIndex === 0 && !hasRouteLeg(trip.days, "outbound")
                  }
                  showReturnPlaceholder={
                    dayIndex === trip.days.length - 1 && !hasRouteLeg(trip.days, "return")
                  }
                  onOpenRouteLeg={openRouteLegDialog}
                  onEditTransport={(item) => openTransportDialog(day.id, item)}
                />
              ))}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-1 max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
              <ItineraryMapView
                places={mapPlaces}
                hubs={mapHubs}
                segments={mapSegments}
                transportDistances={mapTransportDistances}
                mapMode={mapMode}
                countryCodes={trip.countries}
                destination={trip.countries.length ? countriesPlainList(trip.countries) : trip.name}
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
        countryCodes={trip.countries}
        destinationHint={
          trip.countries.length ? countriesPlainList(trip.countries) : trip.name
        }
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
    </div>
  )
}

function DayItineraryTimeline({
  items,
  resolveRegion,
  onRemoveItem,
  canMoveItemUp,
  canMoveItemDown,
  onMoveItemUp,
  onMoveItemDown,
  taskStates,
  onSetTaskState,
  onEditRouteLeg,
  onEditTransport,
}: {
  items: UserDayItem[]
  resolveRegion: (item: UserDayItem) => string | null
  onRemoveItem: (itemId: string) => void
  canMoveItemUp: (itemId: string) => boolean
  canMoveItemDown: (itemId: string) => boolean
  onMoveItemUp: (itemId: string) => void
  onMoveItemDown: (itemId: string) => void
  taskStates: Record<string, TripTaskState>
  onSetTaskState: (taskKey: string, patch: Partial<TripTaskState>) => void
  onEditRouteLeg?: (item: UserDayItem) => void
  onEditTransport?: (item: UserDayItem) => void
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
    setLine({ top: y1, height: Math.max(0, y2 - y1) })
  }, [itemIds, items.length])

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
          const indicator =
            bucket === "triage" ? null : (
              <RouteTaskIndicator
                bucket={bucket}
                status={status}
                onRestore={
                  bucket === "dismissed"
                    ? () => onSetTaskState(taskKey, { status: "pending" })
                    : undefined
                }
              />
            )
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
              ref={(el) => {
                if (index === 0) firstLiRef.current = el
                if (index === n - 1) lastLiRef.current = el
              }}
              className="flex min-h-0 items-center gap-0 @md:gap-3"
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
                className="min-w-0 flex-1"
                variant="planned"
                title={item.name}
                type={item.type}
                sourceId={item.sourceId}
                sourceAuthor={item.sourceAuthor}
                detail={item.detail}
                regionLabel={resolveRegion(item)}
                href={item.affiliateUrl}
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
                taskIndicator={indicator}
                moveControls={
                  isLeg ? undefined : (
                  <div className="flex w-8 flex-col items-center justify-center gap-0.5">
                    {canMoveItemUp(item.id) ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onMoveItemUp(item.id)
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Mover ítem hacia arriba"
                      >
                        <ChevronUp className="h-4 w-4" strokeWidth={1.8} />
                      </button>
                    ) : null}
                    {canMoveItemDown(item.id) ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onMoveItemDown(item.id)
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Mover ítem hacia abajo"
                      >
                        <ChevronDown className="h-4 w-4" strokeWidth={1.8} />
                      </button>
                    ) : null}
                  </div>
                  )
                }
              />
            </li>
          )
        })}
      </ul>
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
    return (
      <span
        className="inline-flex h-8 items-center gap-0.5 rounded-md px-1.5 text-[10px] font-semibold text-emerald-700"
        title={status === "paid" ? TASK_STATUS_LABELS.paid : TASK_STATUS_LABELS.booked}
        aria-label={status === "paid" ? TASK_STATUS_LABELS.paid : TASK_STATUS_LABELS.booked}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
      </span>
    )
  }

  // Solo tareas del bucket main pendientes: punto discreto.
  return (
    <span
      className="inline-flex h-8 w-2 items-center justify-center"
      title={TASK_STATUS_LABELS.pending}
      aria-label={TASK_STATUS_LABELS.pending}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" aria-hidden />
    </span>
  )
}

function DaySection({
  tripId,
  dayId,
  dayIndex,
  dayCount,
  dayDescription,
  dayDateLabel,
  summarySignature,
  countryCodes,
  items,
  resolveRegion,
  isDaySelected,
  onDaySelectChange,
  onRemoveItem,
  canMoveItemUp,
  canMoveItemDown,
  onMoveItemUp,
  onMoveItemDown,
  onAddManualItem,
  taskStates,
  onSetTaskState,
  showOutboundPlaceholder,
  showReturnPlaceholder,
  onOpenRouteLeg,
  onEditTransport,
}: {
  tripId: string
  dayId: string
  dayIndex: number
  dayCount: number
  dayDescription: string
  dayDateLabel: string | null
  summarySignature: string | null
  countryCodes: string[]
  items: UserDayItem[]
  resolveRegion: (item: UserDayItem) => string | null
  isDaySelected: boolean
  onDaySelectChange: (checked: boolean) => void
  onRemoveItem: (itemId: string) => void
  canMoveItemUp: (itemId: string) => boolean
  canMoveItemDown: (itemId: string) => boolean
  onMoveItemUp: (itemId: string) => void
  onMoveItemDown: (itemId: string) => void
  onAddManualItem: () => void
  taskStates: Record<string, TripTaskState>
  onSetTaskState: (taskKey: string, patch: Partial<TripTaskState>) => void
  showOutboundPlaceholder: boolean
  showReturnPlaceholder: boolean
  onOpenRouteLeg: (leg: RouteLeg, existingItem?: UserDayItem | null) => void
  onEditTransport: (item: UserDayItem) => void
}) {
  const { updateDayLabel, applyDaySummary } = useTrips()
  const [editingDescription, setEditingDescription] = useState(false)
  const [draft, setDraft] = useState(dayDescription)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const descriptionEditorRef = useRef<HTMLDivElement>(null)

  const signature = useMemo(() => dayItemsSignature(items), [items])
  const canGenerate =
    items.length >= 1 && signature !== (summarySignature ?? null) && !generating
  const showAiButton = items.length >= 1

  useEffect(() => {
    if (!editingDescription) setDraft(dayDescription)
  }, [dayDescription, editingDescription])

  useEffect(() => {
    if (editingDescription) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [editingDescription])

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
  }, [editingDescription, draft, tripId, dayId])

  const commitDescription = () => {
    const trimmed = draft.trim()
    updateDayLabel(tripId, dayId, trimmed)
    setEditingDescription(false)
  }

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
    setGenError(null)
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
        const msg =
          err instanceof Error ? err.message : "No se pudo generar la descripción."
        setGenError(msg)
        toast.error(msg)
      }
    } finally {
      setGenerating(false)
    }
  }

  const headingForAria = formatDayHeadingLine(dayIndex, dayDescription, dayDateLabel)
  const normalizedDesc = dayDescription.trim() ? normalizeDayLabel(dayDescription) : null

  return (
    <div className="mb-7 last:mb-0">
      <div className="mb-3 flex min-w-0 items-start gap-2.5 @md:items-center">
        <div className="flex shrink-0 items-center pt-0.5 @md:pt-0" onPointerDown={(e) => e.stopPropagation()}>
          <Checkbox
            id={`day-select-${dayId}`}
            checked={isDaySelected}
            onCheckedChange={(c) => onDaySelectChange(c === true)}
            className="size-4"
            disabled={dayCount === 1}
            aria-label={
              dayCount === 1
                ? "No puedes marcar el único día"
                : `Marcar ${headingForAria} para eliminar`
            }
          />
        </div>
        <div ref={descriptionEditorRef} className="flex min-w-0 flex-1 items-start gap-1.5 @md:items-center">
          <div className="flex shrink-0 flex-col leading-tight">
            <span className="text-[15px] font-semibold tabular-nums">Día {dayIndex + 1}</span>
            {dayDateLabel ? (
              <span className="text-[11px] font-medium tabular-nums text-muted-foreground @md:hidden">
                {dayDateLabel}
              </span>
            ) : null}
          </div>
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
            className="shrink-0 pt-0.5 text-[15px] leading-tight text-muted-foreground"
            aria-hidden
          >
            ·
          </span>
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
            <button
              type="button"
              onClick={() => void handleGenerateSummary()}
              disabled={!canGenerate}
              title={
                genError
                  ? genError
                  : canGenerate
                    ? "Generar descripción con IA"
                    : "Sin cambios en los ítems del día"
              }
              aria-label="Generar descripción con IA"
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                canGenerate
                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "cursor-default text-muted-foreground/35",
              )}
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          ) : null}
        </div>
      </div>

      {showOutboundPlaceholder ? (
        <div className="mb-2.5 space-y-1.5">
          <RouteLegPlaceholder
            leg="outbound"
            onClick={() => onOpenRouteLeg("outbound")}
          />
          {items.length === 0 ? (
            <p className="px-1 text-center text-xs text-muted-foreground">
              o{" "}
              <button
                type="button"
                onClick={onAddManualItem}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                añade un ítem propio
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 && !showOutboundPlaceholder && !showReturnPlaceholder ? (
        <div className="rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/20 px-4 py-5 text-center text-sm text-muted-foreground">
          <p>
            Añade elementos desde Fuentes o{" "}
            <button
              type="button"
              onClick={onAddManualItem}
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
          resolveRegion={resolveRegion}
          onRemoveItem={onRemoveItem}
          canMoveItemUp={canMoveItemUp}
          canMoveItemDown={canMoveItemDown}
          onMoveItemUp={onMoveItemUp}
          onMoveItemDown={onMoveItemDown}
          taskStates={taskStates}
          onSetTaskState={onSetTaskState}
          onEditRouteLeg={(item) => {
            const leg = item.route?.leg
            if (leg === "outbound" || leg === "return") onOpenRouteLeg(leg, item)
          }}
          onEditTransport={onEditTransport}
        />
      ) : null}

      {showReturnPlaceholder ? (
        <div className={cn("space-y-1.5", items.length > 0 || showOutboundPlaceholder ? "mt-2.5" : "")}>
          <RouteLegPlaceholder
            leg="return"
            onClick={() => onOpenRouteLeg("return")}
          />
          {items.length === 0 && !showOutboundPlaceholder ? (
            <p className="px-1 text-center text-xs text-muted-foreground">
              o{" "}
              <button
                type="button"
                onClick={onAddManualItem}
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
}

function RouteLegPlaceholder({
  leg,
  onClick,
}: {
  leg: RouteLeg
  onClick: () => void
}) {
  const label =
    leg === "outbound" ? "Añadir tu viaje de ida" : "Añadir tu viaje de vuelta"
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed",
        "border-muted-foreground/25 bg-muted/20 px-4 py-4 text-sm font-medium",
        "text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      aria-label={label}
    >
      <Plus className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </button>
  )
}
