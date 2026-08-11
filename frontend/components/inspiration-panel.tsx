"use client"

/**
 * Panel "Fuentes": biblioteca de investigación, pestañas Crónica / Ruta / Transporte / Descuentos,
 * extracción por URL y consolidación en «Mi viaje» conservando procedencia y afiliado.
 */
import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef, type ReactNode, type KeyboardEvent } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
  BookOpen,
  MapPin,
  Car,
  Tag,
  ChevronUp,
  ChevronDown,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/empty-state"
import { TravelItemCard } from "@/components/travel-item-card"
import { InspirationThumbnail } from "@/components/inspiration-thumbnail"
import {
  AddSourceDialog,
  AddSourceFlow,
  AddSourceProgress,
  AddSourceErrorState,
  MaxSourcesDialog,
} from "@/components/add-source-dialog"
import { AddToDayDialog } from "@/components/add-to-day-dialog"
import { PanelTabs } from "@/components/panel-tabs"
import { useCollapsingHeader } from "@/hooks/use-collapsing-header"
import { useIsMobile } from "@/hooks/use-mobile"
import { useTrips } from "@/lib/trip-context"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { ApiLimitError } from "@/lib/api"
import { ITEM_LABELS } from "@/lib/item-styles"
import { dateISOForDayIndex, formatDayDate } from "@/lib/trip-dates"
import { formatGuideLabel, sourceArticleHeading } from "@/lib/itinerary-utils"
import { canAddSource } from "@/lib/trip-sources"
import {
  clearTextHighlights,
  highlightTextInElement,
  setActiveHighlight,
} from "@/lib/text-highlight"
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
  onRevealSources,
}: {
  tripId: string
  addSourceOpen?: boolean
  onAddSourceOpenChange?: (open: boolean) => void
  initialSourceUrl?: string | null
  /** Activa el panel/sección Fuentes (toast «Ver»). */
  onRevealSources?: () => void
}) {
  const {
    getTrip,
    getTripSources,
    startSourceExtraction,
    cancelPendingSource,
    retryPendingSource,
    dismissPendingSource,
    pendingSources,
    lastExtractionEvent,
    ackExtractionEvent,
    refetchSource,
    isRefetchingSource,
    removeSourceFromTrip,
    ensureArticleHtml,
    isArticleHtmlLoading,
    addItemToDay,
    addBasicToTrip,
  } = useTrips()
  const { requireAccount } = useRegistrationGate()
  const trip = getTrip(tripId)
  const sources = useMemo(() => getTripSources(tripId), [getTripSources, tripId])
  const tripPendings = useMemo(
    () => pendingSources.filter((p) => p.tripId === tripId),
    [pendingSources, tripId],
  )
  const isMobile = useIsMobile()

  const [activeSourceId, setActiveSourceId] = useState<string | null>(sources[0]?.id ?? null)
  const [sourceTab, setSourceTab] = useState<SourceTab>("source")
  const [maxSourcesOpen, setMaxSourcesOpen] = useState(false)
  const [refetchError, setRefetchError] = useState<string | null>(null)
  /** Ítem pendiente de «Añadir al día»; un solo Dialog para toda la lista (sobrevive al virtualizer). */
  const [pickingItem, setPickingItem] = useState<SourceItem | null>(null)
  /** Query compartida Crónica ↔ Ruta (no Desplazamientos/Descuentos). */
  const [sourceQuery, setSourceQuery] = useState("")
  const [matchIndex, setMatchIndex] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const articleRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const marksRef = useRef<HTMLElement[]>([])
  const matchIndexRef = useRef(0)
  const lastScrolledQueryRef = useRef<string | null>(null)
  const lastScrolledIndexRef = useRef<number | null>(null)
  const activeSourceIdRef = useRef(activeSourceId)
  const seenExtractionSeqRef = useRef(0)
  const {
    containerRef: panelRef,
    collapsed: headerCollapsed,
    setCollapsed: setHeaderCollapsed,
  } = useCollapsingHeader(isMobile)

  useEffect(() => {
    activeSourceIdRef.current = activeSourceId
  }, [activeSourceId])

  useEffect(() => {
    const pendingIds = new Set(tripPendings.map((p) => p.id))
    if (sources.length === 0 && tripPendings.length === 0) {
      setActiveSourceId(null)
      return
    }
    setActiveSourceId((id) => {
      if (id && sources.some((s) => s.id === id)) return id
      if (id && pendingIds.has(id)) return id
      // Pending que acaba de resolverse → la fuente nueva suele ser la última.
      if (sources.length > 0) return sources[sources.length - 1]!.id
      return tripPendings[0]?.id ?? null
    })
  }, [sources, tripPendings])
  const setAddSourceOpen = (open: boolean) => {
    onAddSourceOpenChange?.(open)
  }

  const activePending = tripPendings.find((p) => p.id === activeSourceId) ?? null
  const currentSource = activePending
    ? null
    : (sources.find((s) => s.id === activeSourceId) ?? sources[0] ?? null)

  const loadingPendingCount = tripPendings.filter((p) => p.status === "loading").length
  const atSourceCap = !canAddSource({
    sourceCount: sources.length,
    loadingPendingCount,
  })

  const guardBeforeSubmit = useCallback(() => {
    if (sources.length > 0 && !requireAccount("second-source")) return false
    return true
  }, [sources.length, requireAccount])

  const handleStartExtract = useCallback(
    (url: string) => {
      const result = startSourceExtraction(tripId, url)
      if (!result.ok) {
        if (result.reason === "max-sources") {
          setMaxSourcesOpen(true)
          return
        }
        if (result.reason === "already-loading") {
          toast.message("Espera a que termine la fuente en curso")
          return
        }
        toast.error("No se pudo iniciar la extracción")
        return
      }
      setActiveSourceId(result.pendingId)
      setAddSourceOpen(false)
    },
    // setAddSourceOpen closes over onAddSourceOpenChange
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startSourceExtraction, tripId, onAddSourceOpenChange],
  )

  const handlePlusClick = useCallback(() => {
    if (loadingPendingCount > 0) {
      toast.message("Espera a que termine la fuente en curso")
      return
    }
    if (atSourceCap) {
      setMaxSourcesOpen(true)
      return
    }
    setAddSourceOpen(true)
  }, [atSourceCap, loadingPendingCount])

  // Toasts + gate invitado cuando la extracción termina fuera de vista.
  useEffect(() => {
    if (!lastExtractionEvent || lastExtractionEvent.tripId !== tripId) return
    if (lastExtractionEvent.seq <= seenExtractionSeqRef.current) return
    seenExtractionSeqRef.current = lastExtractionEvent.seq
    const seq = lastExtractionEvent.seq
    const fresh = Date.now() - lastExtractionEvent.at <= 30_000

    if (lastExtractionEvent.type === "success") {
      const { source, pendingId } = lastExtractionEvent
      if (activeSourceIdRef.current === pendingId) {
        setActiveSourceId(source.id)
        setSourceTab("source")
      }
      toast.success(`Fuente añadida · @${source.author}`, {
        action: {
          label: "Ver",
          onClick: () => {
            onRevealSources?.()
            setActiveSourceId(source.id)
            setSourceTab("source")
          },
        },
      })
      ackExtractionEvent(seq)
      return
    }

    // Gate solo si el evento es fresco: al volver al viaje no abrir registro solo.
    if (fresh && lastExtractionEvent.errorKind === "guest-limit") {
      requireAccount("source-limit")
    }
    toast.error("No hemos podido leer la fuente", {
      description: lastExtractionEvent.message,
      action: {
        label: "Ver",
        onClick: () => {
          onRevealSources?.()
          setActiveSourceId(lastExtractionEvent.pendingId)
        },
      },
    })
    ackExtractionEvent(seq)
  }, [lastExtractionEvent, tripId, onRevealSources, requireAccount, ackExtractionEvent])

  // Chip activo / pendiente a la vista (máscara del scroller).
  useEffect(() => {
    if (!activeSourceId) return
    const el = chipsRef.current?.querySelector<HTMLElement>(
      `[data-chip-id="${activeSourceId}"]`,
    )
    el?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [activeSourceId, tripPendings.length, sources.length])

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

  // Solo al cambiar de fuente — no al cambiar de pestaña (persistencia Crónica ↔ Ruta).
  useEffect(() => {
    setSourceQuery("")
    setMatchIndex(0)
    setMatchCount(0)
    marksRef.current = []
    lastScrolledQueryRef.current = null
    lastScrolledIndexRef.current = null
  }, [activeSourceId])

  useEffect(() => {
    setPickingItem(null)
    setHeaderCollapsed(false)
  }, [activeSourceId, sourceTab, setHeaderCollapsed])

  // Al entrar en Crónica, forzar re-aplicación (el DOM del artículo se remonta).
  useEffect(() => {
    if (sourceTab === "source") {
      lastScrolledQueryRef.current = null
      lastScrolledIndexRef.current = null
    }
  }, [sourceTab])

  // Reset del índice al cambiar la query (nueva búsqueda → primer match).
  useEffect(() => {
    setMatchIndex(0)
    matchIndexRef.current = 0
  }, [sourceQuery])

  /**
   * Inyectar el HTML por ref (no dangerouslySetInnerHTML): si no, cada re-render
   * (p. ej. al cambiar matchIndex con las flechas) resetea el DOM y borra los <mark>.
   */
  useLayoutEffect(() => {
    if (sourceTab !== "source") return
    const root = articleRef.current
    if (!root) return
    root.innerHTML = currentSource?.articleHtml ?? ""
    marksRef.current = []
    lastScrolledQueryRef.current = null
    lastScrolledIndexRef.current = null
  }, [sourceTab, currentSource?.articleHtml])

  // Find-in-page en Crónica: debounce + TreeWalker. No depende de matchIndex.
  useEffect(() => {
    if (sourceTab !== "source") {
      marksRef.current = []
      return
    }
    const root = articleRef.current
    if (!root || !currentSource?.articleHtml) {
      marksRef.current = []
      setMatchCount(0)
      return
    }

    const needle = sourceQuery.trim()

    const apply = () => {
      if (!needle) {
        clearTextHighlights(root)
        marksRef.current = []
        setMatchCount(0)
        lastScrolledQueryRef.current = ""
        lastScrolledIndexRef.current = null
        return
      }

      const marks = highlightTextInElement(root, needle)
      marksRef.current = marks
      setMatchCount(marks.length)
      const idx = marks.length === 0 ? 0 : Math.min(matchIndexRef.current, marks.length - 1)
      matchIndexRef.current = idx
      setMatchIndex(idx)
      const activeEl = setActiveHighlight(marks, idx)
      if (!activeEl) {
        lastScrolledQueryRef.current = needle
        lastScrolledIndexRef.current = null
        return
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (activeEl.isConnected) activeEl.scrollIntoView({ block: "center" })
        })
      })
      lastScrolledQueryRef.current = needle
      lastScrolledIndexRef.current = idx
    }

    if (!needle) {
      apply()
      return
    }

    const handle = window.setTimeout(apply, 180)
    return () => clearTimeout(handle)
  }, [sourceQuery, sourceTab, currentSource?.articleHtml])

  const goToMatch = useCallback((delta: number) => {
    const marks = marksRef.current.filter((m) => m.isConnected)
    marksRef.current = marks
    if (!marks.length) return
    const next = (matchIndexRef.current + delta + marks.length) % marks.length
    matchIndexRef.current = next
    setMatchIndex(next)
    const activeEl = setActiveHighlight(marks, next)
    if (!activeEl) return
    lastScrolledIndexRef.current = next
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (activeEl.isConnected) activeEl.scrollIntoView({ block: "center" })
      })
    })
  }, [])

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setSourceQuery("")
        return
      }
      if (sourceTab !== "source") return
      if (e.key === "Enter") {
        e.preventDefault()
        goToMatch(e.shiftKey ? -1 : 1)
      }
    },
    [sourceTab, goToMatch],
  )

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

  const tabs = [
    { id: "source" as const, label: "Crónica", icon: BookOpen },
    { id: "itinerary" as const, label: "Ruta", icon: MapPin },
    { id: "transport" as const, label: "Desplazamientos", icon: Car },
    { id: "basics" as const, label: "Descuentos", icon: Tag },
  ]

  const rutaItemCount = groupedItems.reduce((n, g) => n + g.items.length, 0)
  const showRutaSearch = sourceTab === "itinerary" && rutaItemCount > 0
  const showCronicaSearch = sourceTab === "source" && !!currentSource
  const searchNeedle = sourceQuery.trim()
  const showMatchNav = showCronicaSearch && searchNeedle.length > 0 && !!currentSource?.articleHtml

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
              {activePending
                ? `@${activePending.author}`
                : currentSource
                  ? formatGuideLabel(currentSource)
                  : "Fuentes"}
            </h2>
            {sources.length > 0 || tripPendings.length > 0 ? (
              <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                · {sources.length}
                {tripPendings.length > 0 ? `+${tripPendings.length}` : ""}{" "}
                {sources.length + tripPendings.length === 1 ? "fuente" : "fuentes"}
              </p>
            ) : null}
          </div>
        ) : null}
        {sources.length > 0 || tripPendings.length > 0 ? (
          <div className={cn(isMobile ? "pt-1.5" : "pt-2.5")}>
            <div className="source-chips-scroller" ref={chipsRef}>
              {sources.map((s) => {
                const active = activeSourceId === s.id
                return (
                  <div key={s.id} className="shrink-0" data-chip-id={s.id}>
                    <div className="group relative inline-flex">
                      <button
                        type="button"
                        onClick={() => setActiveSourceId(s.id)}
                        className={cn(
                          "inline-flex min-h-7 shrink-0 items-center rounded-full border py-1 pl-2.5 pr-6 text-left text-xs font-medium leading-none transition-colors",
                          active
                            ? "border-transparent bg-foreground text-background"
                            : "border-border bg-background text-foreground md:hover:bg-muted",
                        )}
                      >
                        <span className="leading-[1.1]">@{s.author}</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Quitar fuente"
                        className={cn(
                          "absolute right-0.5 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-full transition",
                          "opacity-100",
                          "md:opacity-0 md:pointer-events-none md:group-hover:pointer-events-auto md:group-hover:opacity-100",
                          "focus:opacity-100 focus:pointer-events-auto focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                          active
                            ? "text-background/80 md:hover:text-destructive"
                            : "text-muted-foreground md:hover:text-destructive",
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
              {tripPendings.map((p) => {
                const active = activeSourceId === p.id
                const isErr = p.status === "error"
                return (
                  <div key={p.id} className="shrink-0" data-chip-id={p.id}>
                    <div className="group relative inline-flex">
                      <button
                        type="button"
                        onClick={() => setActiveSourceId(p.id)}
                        aria-busy={p.status === "loading"}
                        className={cn(
                          "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-6 text-left text-xs font-medium leading-none transition-colors",
                          active
                            ? isErr
                              ? "border-transparent bg-destructive text-destructive-foreground"
                              : "border-transparent bg-foreground text-background"
                            : isErr
                              ? "border-destructive/40 bg-background text-destructive md:hover:bg-destructive/10"
                              : "border-border bg-background text-foreground md:hover:bg-muted",
                        )}
                      >
                        {p.status === "loading" ? (
                          <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
                        ) : (
                          <AlertCircle className="size-3 shrink-0" aria-hidden />
                        )}
                        <span className="leading-[1.1]">@{p.author}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={
                          p.status === "loading" ? "Cancelar análisis" : "Descartar"
                        }
                        className={cn(
                          "absolute right-0.5 top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-full transition",
                          "opacity-100",
                          "md:opacity-0 md:pointer-events-none md:group-hover:pointer-events-auto md:group-hover:opacity-100",
                          "focus:opacity-100 focus:pointer-events-auto focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                          active
                            ? "text-background/80 md:hover:text-destructive"
                            : "text-muted-foreground md:hover:text-destructive",
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (p.status === "loading") cancelPendingSource(p.id)
                          else dismissPendingSource(p.id)
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
                onClick={handlePlusClick}
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-input",
                  "bg-background text-foreground transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
          {currentSource || activePending ? (
            <div className="z-10 shrink-0 border-border bg-background px-4 pb-0 pt-1">
              <div className="panel-column">
              {/* Desktop: titular del artículo + miniatura. En móvil la etiqueta de guía va en la cabecera. */}
              {!isMobile ? (
                activePending ? (
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                      @{activePending.author}
                    </h3>
                    <p className="block truncate text-xs text-muted-foreground">
                      {activePending.url}
                    </p>
                  </div>
                ) : currentSource ? (
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
                        {sourceArticleHeading(currentSource)}
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
                ) : null
              ) : null}
              {currentSource ? (
                <div className={cn("transition-[margin] duration-200 ease-out", isMobile ? "mt-2" : "mt-4 @md:mt-5")}>
                  <PanelTabs
                    items={tabs}
                    value={sourceTab}
                    onValueChange={setSourceTab}
                    ariaLabel="Vista de la fuente"
                  />
                </div>
              ) : (
                // Reserva altura de tabs (PanelTabs ≈ min-h-8) para no colapsar el panel.
                <div
                  className={cn("h-8", isMobile ? "mt-2" : "mt-4 @md:mt-5")}
                  aria-hidden
                />
              )}
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden",
              // Crónica y Ruta: barra fija + scroll en el cuerpo
              sourceTab === "itinerary" || sourceTab === "source"
                ? "overflow-hidden"
                : "overflow-y-auto",
            )}
          >
            {activePending ? (
              activePending.status === "loading" ? (
                <AddSourceProgress
                  stage={activePending.stage}
                  onCancel={() => cancelPendingSource(activePending.id)}
                />
              ) : (
                <AddSourceErrorState
                  message={
                    activePending.errorKind === "guest-limit"
                      ? "Crea una cuenta para añadir más fuentes."
                      : activePending.errorMessage
                  }
                  onRetry={() => {
                    const result = retryPendingSource(activePending.id)
                    if (!result.ok && result.reason === "already-loading") {
                      toast.message("Espera a que termine la fuente en curso")
                    } else if (!result.ok && result.reason === "max-sources") {
                      setMaxSourcesOpen(true)
                    }
                  }}
                  onDismiss={() => dismissPendingSource(activePending.id)}
                />
              )
            ) : !currentSource ? (
              <EmptyState
                icon={Plus}
                title="Añade tu primera fuente"
                description="Pega la URL de un artículo de viajes. Destilaremos la ruta para que puedas consolidarla en Mi viaje."
                actionLabel="Añadir fuente"
                onAction={handlePlusClick}
              />
            ) : sourceTab === "basics" ? (
              <div className="space-y-3 px-4 pb-6 pt-4 max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
                <div className="panel-column space-y-3">
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
              </div>
            ) : sourceTab === "source" ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {showCronicaSearch ? (
                  <SourceSearchBar
                    query={sourceQuery}
                    onQueryChange={setSourceQuery}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Buscar actividad, lugar o restaurante"
                    ariaLabel="Buscar en la crónica"
                    matchNav={
                      showMatchNav
                        ? {
                            index:
                              matchCount === 0
                                ? 0
                                : Math.min(matchIndex, matchCount - 1),
                            count: matchCount,
                            onPrev: () => goToMatch(-1),
                            onNext: () => goToMatch(1),
                          }
                        : null
                    }
                  />
                ) : null}
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
                  <div className="panel-column">
                  {currentSource.articleHtml ? (
                    <div
                      ref={articleRef}
                      className={cn(
                        "prose-article",
                        searchNeedle.length > 0 && "prose-article--searching",
                      )}
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
                        disabled={isRefetchingSource}
                      >
                        {isRefetchingSource ? (
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
                </div>
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
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {showRutaSearch ? (
                  <SourceSearchBar
                    query={sourceQuery}
                    onQueryChange={setSourceQuery}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Buscar actividad, lugar o restaurante"
                    ariaLabel="Buscar en la ruta"
                  />
                ) : null}
                {/* key: reset del virtualizador al cambiar fuente (la query ya vive arriba). */}
                <SourceGroupedList
                  key={`${currentSource.id}-ruta`}
                  groups={groupedItems}
                  emptyTitle="Sin ítems de ruta"
                  emptyDescription="Cuando se destile el artículo, verás actividades, alojamientos y comidas aquí."
                  query={sourceQuery}
                  virtualized={showRutaSearch}
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
              </div>
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

      {/* Desktop: diálogo URL. Móvil: sheet inferior. */}
      {!isMobile ? (
        <AddSourceDialog
          open={addSourceOpen}
          onOpenChange={setAddSourceOpen}
          initialUrl={initialSourceUrl}
          onSubmit={handleStartExtract}
          guardBeforeSubmit={guardBeforeSubmit}
        />
      ) : addSourceOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[45] bg-foreground/25 sm:hidden"
            aria-label="Cerrar añadir fuente"
            onClick={() => setAddSourceOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Añadir fuente"
            className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[50] space-y-2 rounded-xl border border-border bg-background p-3 shadow-[0_12px_40px_rgba(0,0,0,0.18)] sm:hidden"
          >
            <AddSourceFlow
              initialUrl={initialSourceUrl}
              onSubmit={handleStartExtract}
              onCancel={() => setAddSourceOpen(false)}
              guardBeforeSubmit={guardBeforeSubmit}
            />
          </div>
        </>
      ) : null}

      <MaxSourcesDialog open={maxSourcesOpen} onOpenChange={setMaxSourcesOpen} />
    </div>
  )
}

function SourceSearchBar({
  query,
  onQueryChange,
  onKeyDown,
  placeholder,
  ariaLabel,
  matchNav = null,
}: {
  query: string
  onQueryChange: (value: string) => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  placeholder: string
  ariaLabel: string
  matchNav?: {
    index: number
    count: number
    onPrev: () => void
    onNext: () => void
  } | null
}) {
  const hasFilter = query.trim().length > 0
  const showNav = matchNav != null
  const trailingPad = showNav ? "pr-28" : hasFilter ? "pr-9" : undefined

  return (
    <div className="shrink-0 bg-background px-4 pb-3 pt-4">
      <div className="panel-column relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={cn("h-9 pl-8 text-base md:text-sm", trailingPad)}
          aria-label={ariaLabel}
        />
        {showNav ? (
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            <span
              className="px-1 text-[11px] tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {matchNav.count === 0 ? "0/0" : `${matchNav.index + 1}/${matchNav.count}`}
            </span>
            <button
              type="button"
              onClick={matchNav.onPrev}
              disabled={matchNav.count === 0}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              aria-label="Coincidencia anterior"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={matchNav.onNext}
              disabled={matchNav.count === 0}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              aria-label="Coincidencia siguiente"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {hasFilter ? (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Quitar filtro"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : hasFilter ? (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Quitar filtro"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function SourceGroupedList({
  groups,
  emptyTitle,
  emptyDescription,
  renderItem,
  query = "",
  virtualized = false,
}: {
  groups: { day: number | null; items: SourceItem[] }[]
  emptyTitle: string
  emptyDescription: string
  renderItem: (item: SourceItem) => ReactNode
  /** Filtro controlado desde InspirationPanel (compartido con Crónica). */
  query?: string
  /** Lista virtualizada (Ruta). Independiente del buscador: Desplazamientos no virtualiza. */
  virtualized?: boolean
}) {
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

  // Transporte / Ruta sin virtualizar: listas cortas; montaje completo vale.
  if (!virtualized) {
    return (
      <div className="space-y-5 px-4 pb-6 pt-4 max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
        <div className="panel-column space-y-5">
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
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {hasFilter && filteredGroups.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
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
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
    >
      <div className="panel-column">
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
