"use client"

/**
 * Panel "Fuentes": biblioteca de investigación, pestañas Crónica / Ruta / Transporte / Descuentos,
 * extracción por URL y consolidación en «Mi viaje» conservando procedencia y afiliado.
 */
import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Loader2, Plus, RefreshCw, Search, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/empty-state"
import { TravelItemCard } from "@/components/travel-item-card"
import { InspirationThumbnail } from "@/components/inspiration-thumbnail"
import { AddSourceDialog, AddSourceFlow } from "@/components/add-source-dialog"
import { AddToDayDialog } from "@/components/add-to-day-dialog"
import { useCollapsingHeader } from "@/hooks/use-collapsing-header"
import { useIsMobile } from "@/hooks/use-mobile"
import { useTrips } from "@/lib/trip-context"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { ApiLimitError } from "@/lib/api"
import { ITEM_LABELS } from "@/lib/item-styles"
import { dateISOForDayIndex, formatDayDate } from "@/lib/trip-dates"
import type { Source, SourceBasicItem, SourceItem } from "@/types/itinerary"
import { toast } from "sonner"

function sourceItemMatchesQuery(item: SourceItem, needle: string): boolean {
  if (item.name.toLowerCase().includes(needle)) return true
  if (item.detail?.toLowerCase().includes(needle)) return true
  if (item.region?.toLowerCase().includes(needle)) return true
  if (item.vendor?.toLowerCase().includes(needle)) return true
  if (ITEM_LABELS[item.type].toLowerCase().includes(needle)) return true
  if (item.dayHint != null) {
    const day = String(item.dayHint)
    if (day === needle || day.startsWith(needle)) return true
    if (`día ${day}`.includes(needle) || `dia ${day}`.includes(needle)) return true
  }
  return false
}

type SourceTab = "itinerary" | "transport" | "source" | "basics"

/** Badge «añadido»: fecha corta si hay startDate; si no, «Día n». `days` es 1-based. */
function formatAddedDaysCompact(days: number[], startDate?: string | null): string {
  if (!days.length) return ""
  return days
    .map((d) => {
      const iso = startDate ? dateISOForDayIndex(startDate, d - 1) : null
      return (iso ? formatDayDate(iso) : null) ?? `Día ${d}`
    })
    .join(", ")
}

export default function InspirationPanel({
  tripId,
  addSourceOpen = false,
  onAddSourceOpenChange,
  initialSourceUrl,
  autoSourceError,
}: {
  tripId: string
  addSourceOpen?: boolean
  onAddSourceOpenChange?: (open: boolean) => void
  initialSourceUrl?: string | null
  autoSourceError?: string | null
}) {
  const {
    getTrip,
    getTripSources,
    addSourceToTrip,
    refetchSource,
    removeSourceFromTrip,
    isLoadingSource,
    loadingSourceStage,
    ensureArticleHtml,
    isArticleHtmlLoading,
    addItemToDay,
    addBasicToTrip,
  } = useTrips()
  const { requireAccount } = useRegistrationGate()
  const trip = getTrip(tripId)
  const sources = getTripSources(tripId)
  const isMobile = useIsMobile()

  const [activeSourceId, setActiveSourceId] = useState<string | null>(sources[0]?.id ?? null)
  const [sourceTab, setSourceTab] = useState<SourceTab>("source")
  const [mobileAnalyzing, setMobileAnalyzing] = useState(false)
  const [refetchError, setRefetchError] = useState<string | null>(null)
  /** Ítem pendiente de «Añadir al día»; un solo Dialog para toda la lista (sobrevive al virtualizer). */
  const [pickingItem, setPickingItem] = useState<SourceItem | null>(null)
  const {
    containerRef: panelRef,
    collapsed: headerCollapsed,
    setCollapsed: setHeaderCollapsed,
  } = useCollapsingHeader(isMobile)

  useEffect(() => {
    if (sources.length === 0) {
      setActiveSourceId(null)
      return
    }
    setActiveSourceId((id) => (id && sources.some((s) => s.id === id) ? id : sources[0]!.id))
  }, [sources])

  const preparingFirstSource =
    isLoadingSource && sources.length === 0 && !autoSourceError && !addSourceOpen

  const setAddSourceOpen = (open: boolean) => {
    onAddSourceOpenChange?.(open)
    if (!open) setMobileAnalyzing(false)
  }

  const currentSource = sources.find((s) => s.id === activeSourceId) ?? sources[0] ?? null

  const guardBeforeExtract = useCallback(() => {
    if (sources.length > 0 && !requireAccount("second-source")) return false
    return true
  }, [sources.length, requireAccount])

  const handleExtract = useCallback(
    async (url: string, signal: AbortSignal) => {
      return addSourceToTrip(tripId, url, { signal })
    },
    [addSourceToTrip, tripId],
  )

  const handleExtractSuccess = useCallback(
    (source: Source) => {
      setActiveSourceId(source.id)
      setSourceTab("source")
      setAddSourceOpen(false)
    },
    // setAddSourceOpen closes over onAddSourceOpenChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onAddSourceOpenChange],
  )

  const handleGuestLimit = useCallback(() => {
    requireAccount("source-limit")
  }, [requireAccount])

  // El HTML del artículo no viene en la carga inicial: se pide al abrir la Crónica.
  useEffect(() => {
    if (sourceTab !== "source" || !currentSource || currentSource.articleHtml) return
    void ensureArticleHtml(currentSource.id)
  }, [sourceTab, currentSource, ensureArticleHtml])

  const addedItemIds = new Set([
    ...(trip?.days.flatMap((d) => d.items.map((i) => i.sourceItemId)) ?? []),
    ...(trip?.basics.map((b) => b.sourceBasicItemId) ?? []),
  ])

  const addedItemDaysBySourceItemId = useMemo(() => {
    const map = new Map<string, number[]>()
    if (!trip) return map
    for (let dayIndex = 0; dayIndex < trip.days.length; dayIndex++) {
      const day = trip.days[dayIndex]
      const dayNumber = dayIndex + 1
      for (const item of day.items) {
        const prev = map.get(item.sourceItemId) ?? []
        if (!prev.includes(dayNumber)) prev.push(dayNumber)
        map.set(item.sourceItemId, prev)
      }
    }
    return map
  }, [trip])

  const groupItemsByDayHint = useMemo(
    () => (items: SourceItem[]) => {
      if (!items.length) return []
      const hasDays = items.some((i) => i.dayHint != null)
      if (!hasDays) return [{ day: null as number | null, items }]

      const groups: { day: number | null; items: SourceItem[] }[] = []
      let currentDay: number | null = null
      let currentGroup: SourceItem[] = []

      for (const item of items) {
        if (item.dayHint !== currentDay) {
          if (currentGroup.length) groups.push({ day: currentDay, items: currentGroup })
          currentDay = item.dayHint
          currentGroup = [item]
        } else {
          currentGroup.push(item)
        }
      }
      if (currentGroup.length) groups.push({ day: currentDay, items: currentGroup })
      return groups
    },
    [],
  )

  const groupedItems = useMemo(() => {
    if (!currentSource) return []
    const items = currentSource.items.filter((i) => i.type !== "transport")
    return groupItemsByDayHint(items)
  }, [currentSource, groupItemsByDayHint])

  const groupedTransportItems = useMemo(() => {
    if (!currentSource) return []
    const items = currentSource.items.filter((i) => i.type === "transport")
    return groupItemsByDayHint(items)
  }, [currentSource, groupItemsByDayHint])

  useEffect(() => {
    setRefetchError(null)
  }, [activeSourceId])

  useEffect(() => {
    setPickingItem(null)
    setHeaderCollapsed(false)
  }, [activeSourceId, sourceTab, setHeaderCollapsed])

  const handleRefetchArticle = async () => {
    if (!currentSource) return
    setRefetchError(null)
    try {
      await refetchSource(currentSource.id, currentSource.url)
    } catch (e) {
      if (e instanceof ApiLimitError && e.limit === "guest") {
        requireAccount("source-limit")
        return
      }
      if (e instanceof ApiLimitError) {
        toast.error(e.message)
        return
      }
      setRefetchError(
        e instanceof Error ? e.message : "No se pudo recargar el artículo. Inténtalo de nuevo.",
      )
    }
  }

  const handleAddItem = (item: SourceItem, dayId: string) => {
    if (!currentSource) return
    addItemToDay(tripId, dayId, {
      id: crypto.randomUUID(),
      sourceItemId: item.id,
      sourceId: currentSource.id,
      type: item.type,
      name: item.name,
      detail: item.detail,
      sourceAuthor: currentSource.author,
      region: item.region ?? currentSource.area ?? null,
      affiliateUrl: item.affiliateUrl ?? null,
      vendor: item.vendor ?? null,
      sourceRouteHint: item.sourceRouteHint,
    })
  }

  const handleAddBasic = (basic: SourceBasicItem) => {
    if (!currentSource) return
    addBasicToTrip(tripId, {
      id: crypto.randomUUID(),
      sourceBasicItemId: basic.id,
      sourceId: currentSource.id,
      category: basic.category,
      name: basic.name,
      detail: basic.detail,
      vendor: basic.vendor,
      affiliateUrl: basic.affiliateUrl,
      sourceAuthor: currentSource.author,
    })
  }

  const tabs: { id: SourceTab; label: string }[] = [
    { id: "source", label: "Crónica" },
    { id: "itinerary", label: "Ruta" },
    { id: "transport", label: "Desplazamientos" },
    { id: "basics", label: "Descuentos" },
  ]

  /** Móvil: repliegue por altura; en desktop no aplica. */
  const collapsibleClass = (expandedMaxHeight: string) =>
    isMobile
      ? cn(
          "overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
          headerCollapsed ? "max-h-0 opacity-0" : `${expandedMaxHeight} opacity-100`,
        )
      : undefined

  return (
    <div
      ref={panelRef}
      className="flex h-full min-w-0 flex-col overflow-hidden bg-background"
    >
      <div className={cn("shrink-0", collapsibleClass("max-h-40"))}>
        {isMobile ? (
          <div className="flex items-baseline gap-1.5 px-4 pb-1 pt-3.5">
            <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground">
              {currentSource?.title ?? "Fuentes"}
            </h2>
            {sources.length > 0 ? (
              <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                · {sources.length} {sources.length === 1 ? "fuente" : "fuentes"}
              </p>
            ) : null}
          </div>
        ) : null}
        {sources.length > 0 ? (
          <div className={cn("px-3 sm:px-4", isMobile ? "pt-1.5" : "pt-2.5")}>
            <div
              className={cn(
                "flex min-w-0 gap-1.5 overflow-x-auto overflow-y-hidden pb-2.5",
                "[scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin]",
                "[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent",
                "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border",
              )}
            >
              {sources.map((s) => {
                const active = activeSourceId === s.id
                return (
                  <div key={s.id} className="shrink-0">
                    <div className="group relative inline-flex">
                      <button
                        type="button"
                        onClick={() => setActiveSourceId(s.id)}
                        className={cn(
                          "inline-flex min-h-7 shrink-0 items-center rounded-full border py-1 pl-2.5 pr-6 text-left text-xs font-medium leading-none transition-colors",
                          active
                            ? "border-transparent bg-foreground text-background"
                            : "border-border bg-background text-foreground hover:bg-muted",
                        )}
                      >
                        <span className="leading-[1.1]">@{s.author}</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Quitar fuente"
                        className={cn(
                          "absolute right-0.5 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-full",
                          "opacity-0 pointer-events-none transition group-hover:pointer-events-auto group-hover:opacity-100",
                          "focus:opacity-100 focus:pointer-events-auto focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                          active
                            ? "text-background/80 hover:text-destructive"
                            : "text-muted-foreground hover:text-destructive",
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          removeSourceFromTrip(tripId, s.id)
                        }}
                      >
                        <X className="size-2.5 shrink-0" strokeWidth={2.5} aria-hidden />
                      </button>
                    </div>
                  </div>
                )
              })}
              <button
                type="button"
                onClick={() => {
                  if (preparingFirstSource) return
                  setAddSourceOpen(true)
                }}
                disabled={preparingFirstSource}
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-input",
                  "bg-background text-foreground transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
                aria-label="Añadir fuente"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {currentSource ? (
            <div className="z-10 shrink-0 border-border bg-background px-4 pb-0 pt-1 sm:px-6">
              {/* Desktop: titular + miniatura. En móvil el título va en la cabecera («Japan — 21 días · N fuentes»). */}
              {!isMobile ? (
                <div className="flex items-start gap-3">
                  {currentSource.ogImage ? (
                    <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                      <img
                        src={currentSource.ogImage}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                      {currentSource.title}
                    </h3>
                    <a
                      href={currentSource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      {currentSource.url}
                    </a>
                  </div>
                </div>
              ) : null}
              <div
                className={cn(
                  "flex gap-4 overflow-x-auto transition-[margin] duration-200 ease-out sm:mt-5 sm:gap-5",
                  isMobile ? "mt-2" : "mt-4",
                )}
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSourceTab(tab.id)}
                    className={cn(
                      "shrink-0 border-b-2 pb-2 text-sm transition-colors",
                      sourceTab === tab.id
                        ? "border-primary font-semibold text-foreground"
                        : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden",
              // Ruta gestiona su propio scroll (buscador fijo encima de la lista)
              sourceTab === "itinerary" ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            {!currentSource ? (
              preparingFirstSource ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
                  <div className="space-y-1.5">
                    <p className="max-w-sm text-balance text-sm font-medium text-foreground">
                      Preparando tu viaje con el artículo que estabas leyendo…
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {loadingSourceStage === "extracting"
                        ? "Destilando la ruta…"
                        : "Leyendo el artículo…"}
                    </p>
                    <p className="max-w-sm text-balance text-xs text-muted-foreground">
                      Puede tardar más de 30 segundos si el artículo es largo.
                    </p>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={Plus}
                  title="Añade tu primera fuente"
                  description={
                    autoSourceError
                      ? autoSourceError
                      : "Pega la URL de un artículo de viajes. Destilaremos la ruta para que puedas consolidarla en Mi viaje."
                  }
                  actionLabel="Añadir fuente"
                  onAction={() => setAddSourceOpen(true)}
                />
              )
            ) : sourceTab === "basics" ? (
              <div className="space-y-3 px-4 pb-6 pt-4 sm:px-6 max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
                {!currentSource.basics.length ? (
                  <EmptyState
                    icon={Sparkles}
                    title="Sin descuentos en esta fuente"
                    description="Cuando el artículo mencione seguros, SIMs u ofertas, aparecerán aquí."
                    className="py-10"
                  />
                ) : (
                  currentSource.basics.map((basic) => (
                    <TravelItemCard
                      key={basic.id}
                      variant="basic-source"
                      title={basic.name}
                      detail={basic.detail}
                      category={basic.category}
                      thumbnail={
                        <InspirationThumbnail
                          kind="basic"
                          item={basic}
                          area={currentSource.area}
                          mode="vendorLogo"
                        />
                      }
                      isAdded={addedItemIds.has(basic.id)}
                      href={basic.affiliateUrl}
                      onAdd={() => handleAddBasic(basic)}
                    />
                  ))
                )}
              </div>
            ) : sourceTab === "source" ? (
              <div className="px-4 pb-6 pt-4 sm:px-6 max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
                {currentSource.articleHtml ? (
                  <div
                    className="prose-article"
                    dangerouslySetInnerHTML={{ __html: currentSource.articleHtml }}
                  />
                ) : isArticleHtmlLoading(currentSource.id) ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-16 text-center">
                    <p className="text-sm text-muted-foreground">Contenido no disponible</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-4 rounded-xl"
                      onClick={() => void handleRefetchArticle()}
                      disabled={isLoadingSource}
                    >
                      {isLoadingSource ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-2">Recargar</span>
                    </Button>
                    {refetchError ? (
                      <p className="mt-2 max-w-sm text-xs text-destructive" role="alert">
                        {refetchError}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            ) : sourceTab === "transport" ? (
              <SourceGroupedList
                groups={groupedTransportItems}
                emptyTitle="Sin desplazamientos en esta fuente"
                emptyDescription="Vuelos, trenes o traslados detectados aparecerán aquí para añadirlos a tu ruta."
                renderItem={(item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    sourceArea={currentSource.area}
                    isAdded={addedItemIds.has(item.id)}
                    addedDayNumbers={addedItemDaysBySourceItemId.get(item.id) ?? []}
                    tripStartDate={trip?.startDate ?? null}
                    thumbnailMode="transportIcon"
                    sourceTypeLabel="Desplazamiento"
                    onPick={() => setPickingItem(item)}
                  />
                )}
              />
            ) : (
              <SourceGroupedList
                key={`${currentSource.id}-ruta`}
                groups={groupedItems}
                emptyTitle="Sin ítems de ruta"
                emptyDescription="Cuando se destile el artículo, verás actividades, alojamientos y comidas aquí."
                searchable
                searchPlaceholder="Buscar actividad, restaurante o lugar"
                renderItem={(item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    sourceArea={currentSource.area}
                    isAdded={addedItemIds.has(item.id)}
                    addedDayNumbers={addedItemDaysBySourceItemId.get(item.id) ?? []}
                    tripStartDate={trip?.startDate ?? null}
                    onPick={() => setPickingItem(item)}
                  />
                )}
              />
            )}
          </div>
        </div>
      </div>

      {pickingItem && trip ? (
        <AddToDayDialog
          open
          onOpenChange={(open) => {
            if (!open) setPickingItem(null)
          }}
          days={trip.days}
          tripStartDate={trip.startDate ?? null}
          itemName={pickingItem.name}
          itemType={pickingItem.type}
          addedDayNumbers={addedItemDaysBySourceItemId.get(pickingItem.id) ?? []}
          onSelect={(dayId) => {
            handleAddItem(pickingItem, dayId)
            setPickingItem(null)
          }}
        />
      ) : null}

      {/* Desktop: diálogo bloqueante. Móvil: sheet inferior con el mismo flujo. */}
      {!isMobile ? (
        <AddSourceDialog
          open={addSourceOpen && !preparingFirstSource}
          onOpenChange={setAddSourceOpen}
          tripId={tripId}
          initialUrl={initialSourceUrl}
          loadingStage={loadingSourceStage}
          onExtract={handleExtract}
          onSuccess={handleExtractSuccess}
          guardBeforeExtract={guardBeforeExtract}
          onGuestLimit={handleGuestLimit}
        />
      ) : addSourceOpen && !preparingFirstSource ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[45] bg-foreground/25 sm:hidden"
            aria-label="Cerrar añadir fuente"
            disabled={mobileAnalyzing}
            onClick={() => {
              if (mobileAnalyzing) return
              setAddSourceOpen(false)
            }}
          />
          <div
            role="dialog"
            aria-label={mobileAnalyzing ? "Analizando fuente" : "Añadir fuente"}
            className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[50] space-y-2 rounded-xl border border-border bg-background p-3 shadow-[0_12px_40px_rgba(0,0,0,0.18)] sm:hidden"
          >
            <AddSourceFlow
              tripId={tripId}
              initialUrl={initialSourceUrl}
              loadingStage={loadingSourceStage}
              onExtract={handleExtract}
              onSuccess={handleExtractSuccess}
              onCancel={() => setAddSourceOpen(false)}
              analyzing={mobileAnalyzing}
              setAnalyzing={setMobileAnalyzing}
              guardBeforeExtract={guardBeforeExtract}
              onGuestBlocked={handleGuestLimit}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

function SourceGroupedList({
  groups,
  emptyTitle,
  emptyDescription,
  renderItem,
  searchable = false,
  searchPlaceholder = "Buscar en la ruta",
}: {
  groups: { day: number | null; items: SourceItem[] }[]
  emptyTitle: string
  emptyDescription: string
  renderItem: (item: SourceItem) => ReactNode
  searchable?: boolean
  searchPlaceholder?: string
}) {
  const [query, setQuery] = useState("")

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return groups
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => sourceItemMatchesQuery(item, needle)),
      }))
      .filter((group) => group.items.length > 0)
  }, [groups, query])

  const totalItems = groups.reduce((n, g) => n + g.items.length, 0)
  const showSearch = searchable && totalItems > 0
  const needle = query.trim()
  const hasFilter = needle.length > 0

  if (!groups.length) {
    return (
      <EmptyState
        icon={Plus}
        title={emptyTitle}
        description={emptyDescription}
        className="py-10"
      />
    )
  }

  // Transporte (sin buscador): listas cortas; montaje completo vale.
  if (!showSearch) {
    return (
      <div className="space-y-5 px-4 pb-6 pt-4 sm:px-6 max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
        {filteredGroups.map((group, gi) => (
          <div key={gi} className="space-y-2">
            {group.day != null ? (
              <p className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Día {group.day}
              </p>
            ) : null}
            {group.items.map((item) => renderItem(item))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 bg-background px-4 pb-3 pt-4 sm:px-6">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className={cn("h-9 pl-8 text-sm", hasFilter && "pr-9")}
            aria-label="Buscar en la ruta"
          />
          {hasFilter ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Quitar filtro"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      {hasFilter && filteredGroups.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-6">
          Ningún ítem coincide con «{needle}».
        </p>
      ) : (
        <VirtualSourceRows groups={filteredGroups} renderItem={renderItem} resetKey={query} />
      )}
    </div>
  )
}

type FlatRow =
  | { kind: "header"; key: string; day: number }
  | { kind: "item"; key: string; item: SourceItem; groupGap: boolean }

function flattenSourceGroups(
  groups: { day: number | null; items: SourceItem[] }[],
): FlatRow[] {
  const rows: FlatRow[] = []
  groups.forEach((group, gi) => {
    if (group.day != null) {
      rows.push({ kind: "header", key: `day-${group.day}-${gi}`, day: group.day })
    }
    group.items.forEach((item, ii) => {
      const isLastInGroup = ii === group.items.length - 1
      const isLastGroup = gi === groups.length - 1
      rows.push({
        kind: "item",
        key: item.id,
        item,
        groupGap: isLastInGroup && !isLastGroup,
      })
    })
  })
  return rows
}

/** Lista virtualizada: solo monta las filas visibles (+ overscan). */
function VirtualSourceRows({
  groups,
  renderItem,
  resetKey,
}: {
  groups: { day: number | null; items: SourceItem[] }[]
  renderItem: (item: SourceItem) => ReactNode
  resetKey: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => flattenSourceGroups(groups), [groups])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index]
      if (!row || row.kind === "header") return 28
      // card ~80px + pb-2; más aire entre grupos (antes space-y-5)
      return row.groupGap ? 108 : 92
    },
    overscan: 10,
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    virtualizer.scrollToOffset(0)
    // Solo al cambiar el filtro / resetKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 sm:px-6 max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualRows.map((vRow) => {
          const row = rows[vRow.index]
          if (!row) return null
          return (
            <div
              key={row.key}
              data-index={vRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${vRow.start}px)` }}
            >
              {row.kind === "header" ? (
                <p className="px-0.5 pb-2 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Día {row.day}
                </p>
              ) : (
                <div className={cn("pb-2", row.groupGap && "pb-5")}>
                  {renderItem(row.item)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ItemRow({
  item,
  sourceArea,
  isAdded,
  addedDayNumbers,
  tripStartDate,
  thumbnailMode,
  sourceTypeLabel,
  onPick,
}: {
  item: SourceItem
  sourceArea: string | null
  isAdded: boolean
  addedDayNumbers: number[]
  tripStartDate?: string | null
  thumbnailMode?: "default" | "transportIcon"
  sourceTypeLabel?: string
  onPick: () => void
}) {
  const isMobile = useIsMobile()
  const card = (
    <TravelItemCard
      variant="source"
      title={item.name}
      detail={item.detail}
      type={item.type}
      typeLabel={sourceTypeLabel}
      isAdded={isAdded}
      addedLabel={
        addedDayNumbers.length
          ? formatAddedDaysCompact(addedDayNumbers, tripStartDate)
          : undefined
      }
      thumbnail={
        <InspirationThumbnail
          kind="item"
          item={item}
          area={sourceArea}
          mode={thumbnailMode ?? "default"}
        />
      }
      action={
        isMobile ? (
          <button
            type="button"
            onClick={onPick}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground outline-none ring-offset-2 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Añadir al itinerario"
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : (
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground"
            aria-hidden
          >
            <Plus className="h-4 w-4" />
          </span>
        )
      }
    />
  )

  // Desktop: toda la card abre el selector. Móvil: solo el «+», para no interferir con el scroll.
  if (isMobile) {
    return card
  }

  return (
    <button
      type="button"
      onClick={onPick}
      className="block w-full cursor-pointer rounded-2xl text-left outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Añadir al itinerario"
    >
      {card}
    </button>
  )
}
