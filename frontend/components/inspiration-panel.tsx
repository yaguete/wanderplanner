"use client"

/**
 * Panel "Fuentes": biblioteca de investigación, pestañas Crónica / Ruta / Transporte / Descuentos,
 * extracción por URL y consolidación en «Mi viaje» conservando procedencia y afiliado.
 */
import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef, type ReactNode, type KeyboardEvent } from "react"
import { useVirtualizer, useWindowVirtualizer, type Virtualizer } from "@tanstack/react-virtual"
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
  ListPlus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/empty-state"
import { TravelItemCard } from "@/components/travel-item-card"
import { InspirationThumbnail } from "@/components/inspiration-thumbnail"
import {
  AddSourceDialog,
  AddSourceProgress,
  AddSourceErrorState,
  MaxSourcesDialog,
} from "@/components/add-source-dialog"
import { AddToDayDialog } from "@/components/add-to-day-dialog"
import { PanelTabs } from "@/components/panel-tabs"
import { CollapsedChromeReveal } from "@/components/collapsed-chrome-reveal"
import { useCollapsingHeader } from "@/hooks/use-collapsing-header"
import { useIsMobile } from "@/hooks/use-mobile"
import { useStableList } from "@/hooks/use-stable-list"
import { useTrips } from "@/lib/trip-context"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { ApiLimitError } from "@/lib/api"
import { itemTypeLabel } from "@/lib/item-styles"
import { formatAddedDaysCompact } from "@/lib/trip-dates"
import { formatGuideLabel, sourceArticleHeading } from "@/lib/itinerary-utils"
import { canAddSource } from "@/lib/trip-sources"
import { REVEAL_SOURCES_EVENT, type RevealSourcesDetail } from "@/lib/onboarding"
import { prefetchTripSourceSuggestions } from "@/lib/trip-source-suggestions"
import { extractionToastLabel } from "@/lib/extraction-toast"
import { groupItemsByDayHint } from "@/lib/source-item-groups"
import { isSourceDayCompleteOnTrip, sourceRouteItems } from "@/lib/source-route-import"
import { isInstagramMediaUrl } from "@/lib/instagram-url"
import { InstagramEmbed } from "@/components/instagram-embed"
import {
  clearTextHighlights,
  highlightTextInElement,
  setActiveHighlight,
} from "@/lib/text-highlight"
import { chronicleSearchNeedles } from "@/lib/chronicle-search"
import { curateArticleHtml, guardChronicleImages } from "@/lib/chronicle-html"
import type { Source, SourceBasicItem, SourceItem } from "@/types/itinerary"
import { userDayItemFromSource } from "@/lib/item-provenance"
import { toast } from "sonner"

function sourceItemMatchesQuery(item: SourceItem, needle: string): boolean {
  if (item.name.toLowerCase().includes(needle)) return true
  if (item.detail?.toLowerCase().includes(needle)) return true
  if (item.region?.toLowerCase().includes(needle)) return true
  if (item.vendor?.toLowerCase().includes(needle)) return true
  if (itemTypeLabel(item.type, item).toLowerCase().includes(needle)) return true
  if (item.dayHint != null) {
    const day = String(item.dayHint)
    if (day === needle || day.startsWith(needle)) return true
    if (`día ${day}`.includes(needle) || `dia ${day}`.includes(needle)) return true
  }
  return false
}

function toastSourceRouteImport(
  result: { addedCount: number; daysCreated: number },
  emptyMessage: string,
) {
  if (result.addedCount === 0) {
    toast.message(emptyMessage)
    return
  }
  const itemsLabel =
    result.addedCount === 1 ? "1 ítem" : `${result.addedCount} ítems`
  const daysExtra =
    result.daysCreated === 0
      ? ""
      : result.daysCreated === 1
        ? " y 1 día"
        : ` y ${result.daysCreated} días`
  toast.success(`Hemos añadido ${itemsLabel}${daysExtra} a tu viaje`)
}

type SourceTab = "itinerary" | "transport" | "source" | "basics"

export default function InspirationPanel({
  tripId,
  addSourceOpen = false,
  onAddSourceOpenChange,
  initialSourceUrl,
  onRevealSources,
  onHeaderCollapsedChange,
  activeOnMobile = true,
}: {
  tripId: string
  addSourceOpen?: boolean
  onAddSourceOpenChange?: (open: boolean) => void
  initialSourceUrl?: string | null
  /** Activa el panel/sección Fuentes (toast «Ver»). */
  onRevealSources?: () => void
  /** Móvil: repliegue de cabecera (para compactar la navbar con el mismo gesto). */
  onHeaderCollapsedChange?: (collapsed: boolean) => void
  /** Móvil: true mientras esta sección está visible. */
  activeOnMobile?: boolean
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
    addSourceRouteToTrip,
    addBasicToTrip,
    addDay,
  } = useTrips()
  const { requireAccount } = useRegistrationGate()
  const trip = getTrip(tripId)
  const sources = useStableList(getTripSources(tripId))
  const tripPendings = useMemo(
    () => pendingSources.filter((p) => p.tripId === tripId),
    [pendingSources, tripId],
  )
  const isMobile = useIsMobile()

  const [activeSourceId, setActiveSourceId] = useState<string | null>(sources[0]?.id ?? null)
  const [sourceTab, setSourceTab] = useState<SourceTab>("source")

  useEffect(() => {
    const onRevealSources = (event: Event) => {
      const tab = (event as CustomEvent<RevealSourcesDetail>).detail?.tab
      if (tab === "itinerary") setSourceTab("itinerary")
    }
    window.addEventListener(REVEAL_SOURCES_EVENT, onRevealSources)
    return () => window.removeEventListener(REVEAL_SOURCES_EVENT, onRevealSources)
  }, [])
  const [maxSourcesOpen, setMaxSourcesOpen] = useState(false)
  const [refetchError, setRefetchError] = useState<string | null>(null)
  /** Pendiente de «Añadir al día»: un ítem suelto. */
  const [picking, setPicking] = useState<SourceItem | null>(null)
  /** Query compartida Crónica ↔ Ruta (no Desplazamientos/Descuentos). */
  const [sourceQuery, setSourceQuery] = useState("")
  /** Barra de búsqueda: un solo interruptor para Crónica y Ruta. */
  const [searchOpen, setSearchOpen] = useState(false)
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
  // Móvil: repliega chips + cabecera (y compacta la navbar); no vuelve solo
  // al subir — el chevron lo recupera. Desktop: el titular del artículo.
  const {
    containerRef: panelRef,
    collapsed: headerCollapsed,
    setCollapsed: setHeaderCollapsed,
  } = useCollapsingHeader(
    true,
    isMobile ? onHeaderCollapsedChange : undefined,
    isMobile ? activeOnMobile : true,
    !isMobile,
  )

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
      const tab = isInstagramMediaUrl(source.url) ? "itinerary" : "source"
      if (activeSourceIdRef.current === pendingId) {
        setActiveSourceId(source.id)
        setSourceTab(tab)
      }
      toast.success(extractionToastLabel(source), {
        action: {
          label: "Ver",
          onClick: () => {
            onRevealSources?.()
            setActiveSourceId(source.id)
            setSourceTab(tab)
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

  // El HTML no viene en la carga inicial. Se pide al abrir la fuente: Crónica
  // lo pinta, y Ruta/Descuentos pegan los enlaces de reserva (Civitatis…).
  useEffect(() => {
    if (!currentSource || currentSource.articleHtml) return
    void ensureArticleHtml(currentSource.id)
  }, [currentSource, ensureArticleHtml])

  const addedItemIds = useMemo(
    () =>
      new Set([
        ...(trip?.days.flatMap((d) => d.items.map((i) => i.sourceItemId)) ?? []),
        ...(trip?.basics.map((b) => b.sourceBasicItemId) ?? []),
      ]),
    [trip],
  )

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

  const groupedItems = useMemo(() => {
    if (!currentSource) return []
    return groupItemsByDayHint(sourceRouteItems(currentSource))
  }, [currentSource])

  const groupedTransportItems = useMemo(() => {
    if (!currentSource) return []
    const items = currentSource.items.filter((i) => i.type === "transport")
    return groupItemsByDayHint(items)
  }, [currentSource])

  useEffect(() => {
    setRefetchError(null)
  }, [activeSourceId])

  useEffect(() => {
    if (!currentSource || !isInstagramMediaUrl(currentSource.url)) return
    if (sourceTab === "transport" && groupedTransportItems.length === 0) {
      setSourceTab("itinerary")
    } else if (sourceTab === "basics" && currentSource.basics.length === 0) {
      setSourceTab("itinerary")
    }
  }, [currentSource, sourceTab, groupedTransportItems.length])

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
    setPicking(null)
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
    root.innerHTML = curateArticleHtml(currentSource?.articleHtml ?? "")
    guardChronicleImages(root)
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

      let usedNeedle = needle
      let marks = highlightTextInElement(root, usedNeedle)
      if (marks.length === 0) {
        for (const alt of chronicleSearchNeedles(needle).slice(1)) {
          marks = highlightTextInElement(root, alt)
          if (marks.length > 0) {
            usedNeedle = alt
            break
          }
        }
      }
      if (usedNeedle !== needle) setSourceQuery(usedNeedle)

      marksRef.current = marks
      setMatchCount(marks.length)
      const idx = marks.length === 0 ? 0 : Math.min(matchIndexRef.current, marks.length - 1)
      matchIndexRef.current = idx
      setMatchIndex(idx)
      const activeEl = setActiveHighlight(marks, idx)
      if (!activeEl) {
        lastScrolledQueryRef.current = usedNeedle
        lastScrolledIndexRef.current = null
        return
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (activeEl.isConnected) activeEl.scrollIntoView({ block: "center" })
        })
      })
      lastScrolledQueryRef.current = usedNeedle
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

  const handleAddItem = (item: SourceItem, dayId: string, spanDays?: number) => {
    if (!currentSource) return
    const userItem = userDayItemFromSource(item, currentSource)
    if (spanDays != null) userItem.spanDays = spanDays
    addItemToDay(tripId, dayId, userItem)
  }

  const handleAddAllForSourceDay = (group: {
    day: number | null
    items: SourceItem[]
  }) => {
    if (!currentSource || !group.items.length) return
    toastSourceRouteImport(
      addSourceRouteToTrip(tripId, currentSource, group.items),
      group.day == null
        ? "Todos los sitios de esta fuente ya están en tu viaje"
        : `Todos los ítems del día ${group.day} ya están en tu viaje`,
    )
  }

  const handleAddSourceRoute = () => {
    if (!currentSource) return
    toastSourceRouteImport(
      addSourceRouteToTrip(tripId, currentSource),
      "Todos los ítems de esta ruta ya están en tu viaje",
    )
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

  const openChronicleSearch = useCallback((name: string) => {
    const q = name.trim()
    if (!q) return
    setSearchOpen(true)
    setSourceQuery(q)
    setSourceTab("source")
  }, [])

  const toggleSearch = useCallback(() => {
    if (searchOpen) {
      setSearchOpen(false)
      setSourceQuery("")
    } else {
      setSearchOpen(true)
    }
  }, [searchOpen])

  const tabs = [
    { id: "source" as const, label: "Crónica", icon: BookOpen },
    { id: "itinerary" as const, label: "Ruta", icon: MapPin },
    ...(!currentSource ||
    !isInstagramMediaUrl(currentSource.url) ||
    groupedTransportItems.length > 0
      ? [{ id: "transport" as const, label: "Desplazamientos", icon: Car }]
      : []),
    ...(!currentSource ||
    !isInstagramMediaUrl(currentSource.url) ||
    currentSource.basics.length > 0
      ? [{ id: "basics" as const, label: "Descuentos", icon: Tag }]
      : []),
  ]

  const rutaItemCount = groupedItems.reduce((n, g) => n + g.items.length, 0)
  const pendingRouteCount = groupedItems.reduce(
    (n, g) => n + g.items.filter((item) => !addedItemIds.has(item.id)).length,
    0,
  )
  const showRutaSearch = sourceTab === "itinerary" && rutaItemCount > 0
  const showCronicaSearch = sourceTab === "source" && !!currentSource
  const showSearchToggle = showCronicaSearch || showRutaSearch
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
      className={cn(
        "flex min-w-0 flex-col bg-background",
        // Móvil: scrollea el documento, así que el panel crece con su contenido
        // y solo garantiza fondo hasta el borde inferior de la pantalla.
        "max-md:min-h-[calc(100svh_-_var(--wp-header-height))]",
        "md:h-full md:overflow-hidden",
      )}
    >
      {/*
        Móvil: todo el cromo del panel es UN bloque sticky bajo el header del
        shell. Al replegarse el título + chips el bloque encoge y las pestañas
        y el buscador suben solos, que es la razón de tenerlos aquí dentro:
        encadenar `top` entre sticky de altura variable no se sostiene.
      */}
      <div
        className={cn(
          "shrink-0",
          "max-md:sticky max-md:top-[var(--wp-header-height)] max-md:z-20 max-md:bg-background",
        )}
      >
      <div
        className={cn("shrink-0", collapsibleClass("max-h-40"))}
        aria-hidden={isMobile && headerCollapsed}
        inert={isMobile && headerCollapsed ? true : undefined}
      >
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
                onPointerEnter={() => {
                  if (!trip || atSourceCap || loadingPendingCount > 0) return
                  prefetchTripSourceSuggestions(trip, sources)
                }}
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

          {currentSource || activePending ? (
            <div className="z-10 shrink-0 border-border bg-background px-4 pb-0 pt-1">
              <div className="panel-column">
              {/* Desktop: titular del artículo + miniatura. En móvil la etiqueta de guía va en la cabecera. */}
              {!isMobile ? (
                <div
                  className={cn(
                    "overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
                    headerCollapsed ? "max-h-0 opacity-0" : "max-h-24 opacity-100",
                  )}
                  aria-hidden={headerCollapsed}
                  inert={headerCollapsed || undefined}
                >
                  {activePending ? (
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
                  ) : null}
                </div>
              ) : null}
              {currentSource ? (
                <div
                  className={cn(
                    "transition-[margin] duration-200 ease-out",
                    isMobile
                      ? "mt-2"
                      : headerCollapsed
                        ? "mt-2"
                        : "mt-4 @md:mt-5",
                  )}
                >
                  <div className="flex min-w-0 items-end justify-between gap-2">
                    <PanelTabs
                      items={tabs}
                      value={sourceTab}
                      onValueChange={setSourceTab}
                      ariaLabel="Vista de la fuente"
                    />
                    {showSearchToggle ? (
                    <button
                      type="button"
                      aria-pressed={searchOpen}
                      aria-controls={
                        searchOpen && showSearchToggle
                          ? "source-search"
                          : undefined
                      }
                      aria-label={searchOpen ? "Ocultar buscador" : "Mostrar buscador"}
                      title={searchOpen ? "Ocultar buscador" : "Buscar"}
                      onClick={toggleSearch}
                      className={cn(
                        "mb-2 inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        searchOpen
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <Search className="h-3.5 w-3.5" strokeWidth={searchOpen ? 2.25 : 2} aria-hidden />
                    </button>
                    ) : null}
                  </div>
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

          {/*
            Buscador unificado: vive en el cromo sticky, no dentro del cuerpo
            de cada pestaña. La condición reproduce cuándo se veía antes —
            con una extracción en curso el cuerpo no monta ninguna pestaña.
          */}
          {!activePending && searchOpen && showSearchToggle ? (
            <SourceSearchBar
              query={sourceQuery}
              onQueryChange={setSourceQuery}
              onKeyDown={handleSearchKeyDown}
              placeholder="Buscar actividad, lugar o restaurante"
              ariaLabel={showCronicaSearch ? "Buscar en la crónica" : "Buscar en la ruta"}
              matchNav={
                showCronicaSearch && showMatchNav
                  ? {
                      index: matchCount === 0 ? 0 : Math.min(matchIndex, matchCount - 1),
                      count: matchCount,
                      onPrev: () => goToMatch(-1),
                      onNext: () => goToMatch(1),
                    }
                  : null
              }
            />
          ) : null}
          <CollapsedChromeReveal
            show={isMobile && headerCollapsed}
            onReveal={() => setHeaderCollapsed(false)}
          />
      </div>

      <div
        className={cn(
          "relative flex min-w-0 flex-1 flex-col md:min-h-0 md:overflow-hidden",
          isMobile &&
            headerCollapsed &&
            "pt-[var(--wp-chrome-reveal-clearance)]",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col",
              // Crónica y Ruta: barra fija + scroll en el cuerpo.
              // En móvil no puede haber overflow declarado: con un eje en
              // `hidden` el otro computa a `auto` y este contenedor se comería
              // el scroll del documento (y con él, el colapso de la barra).
              "md:min-h-0 md:overflow-x-hidden",
              sourceTab === "itinerary" || sourceTab === "source"
                ? "md:overflow-hidden"
                : "md:overflow-y-auto",
            )}
          >
            {activePending ? (
              activePending.status === "loading" ? (
                <AddSourceProgress
                  stage={activePending.stage}
                  startedAt={activePending.startedAt}
                  onCancel={() => cancelPendingSource(activePending.id)}
                />
              ) : (
                <AddSourceErrorState
                  message={
                    activePending.errorKind === "guest-limit"
                      ? "Crea una cuenta para añadir más fuentes."
                      : activePending.errorMessage
                  }
                  destination={activePending.errorDestination}
                  usedUrls={[
                    ...sources.map((s) => s.url),
                    ...tripPendings.map((p) => p.url),
                  ]}
                  onSelectSuggestion={(url) => {
                    dismissPendingSource(activePending.id)
                    const result = startSourceExtraction(tripId, url)
                    if (!result.ok && result.reason === "max-sources") {
                      setMaxSourcesOpen(true)
                    }
                  }}
                  onRetry={
                    activePending.errorKind === "permanent"
                      ? undefined
                      : () => {
                          const result = retryPendingSource(activePending.id)
                          if (!result.ok && result.reason === "already-loading") {
                            toast.message("Espera a que termine la fuente en curso")
                          } else if (!result.ok && result.reason === "max-sources") {
                            setMaxSourcesOpen(true)
                          }
                        }
                  }
                  onDismiss={() => dismissPendingSource(activePending.id)}
                />
              )
            ) : !currentSource ? (
              <EmptyState
                icon={Plus}
                title="Añade tu primera fuente"
                description="Pega la URL de un artículo de viajes o busca un destino. Destilaremos la ruta para que puedas consolidarla en Mi viaje."
                actionLabel="Añadir fuente"
                onAction={handlePlusClick}
              />
            ) : sourceTab === "basics" ? (
              <div className="space-y-3 px-4 pb-6 pt-4 max-md:pb-[var(--wp-nav-clearance)]">
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
                      outboundSurface="inspiration"
                      outboundAffiliate="partner"
                      onAdd={() => handleAddBasic(basic)}
                    />
                  ))
                )}
                </div>
              </div>
            ) : sourceTab === "source" ? (
              <div className="flex flex-1 flex-col md:min-h-0 md:overflow-hidden">
                <div className="px-4 pb-6 pt-4 max-md:pb-[var(--wp-nav-clearance)] md:min-h-0 md:flex-1 md:overflow-y-auto md:overflow-x-hidden">
                  <div className="panel-column">
                  {isInstagramMediaUrl(currentSource.url) ? (
                    <InstagramEmbed url={currentSource.url} />
                  ) : null}
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
                    onPick={() => setPicking(item)}
                    thumbnailMode="transportIcon"
                    sourceTypeLabel="Desplazamiento"
                  />
                )}
              />
            ) : (
              <div className="flex flex-1 flex-col md:min-h-0 md:overflow-hidden">
                {/* key: reset del virtualizador al cambiar fuente (la query ya vive arriba). */}
                <SourceGroupedList
                  key={`${currentSource.id}-ruta`}
                  groups={groupedItems}
                  emptyTitle="Sin ítems de ruta"
                  emptyDescription="Cuando se destile el artículo, verás actividades, alojamientos y comidas aquí."
                  query={sourceQuery}
                  virtualized={showRutaSearch}
                  onAddAllDay={handleAddAllForSourceDay}
                  isDayComplete={(day, items) =>
                    isSourceDayCompleteOnTrip(trip?.days ?? [], day, items)
                  }
                  toolbar={
                    rutaItemCount > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        className="w-full rounded-xl"
                        disabled={pendingRouteCount === 0}
                        onClick={handleAddSourceRoute}
                        aria-label={
                          pendingRouteCount === 0
                            ? "Todos los ítems de esta ruta ya están en tu viaje"
                            : "Añadir toda la ruta a Mi viaje"
                        }
                      >
                        <ListPlus className="h-3.5 w-3.5" />
                        Añadir toda la ruta a Mi viaje
                      </Button>
                    ) : null
                  }
                  renderItem={(item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      sourceArea={currentSource.area}
                      isAdded={addedItemIds.has(item.id)}
                      addedDayNumbers={addedItemDaysBySourceItemId.get(item.id) ?? []}
                      tripStartDate={trip?.startDate ?? null}
                      onPick={() => setPicking(item)}
                      onFindInSource={() => openChronicleSearch(item.name)}
                    />
                  )}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {picking && trip ? (
        <AddToDayDialog
          open
          onOpenChange={(open) => {
            if (!open) setPicking(null)
          }}
          days={trip.days}
          tripStartDate={trip.startDate ?? null}
          itemName={picking.name}
          itemType={picking.type}
          itemAffiliateUrl={picking.affiliateUrl}
          addedDayNumbers={addedItemDaysBySourceItemId.get(picking.id) ?? []}
          onSelect={(dayId, spanDays) => {
            handleAddItem(picking, dayId, spanDays)
            setPicking(null)
          }}
          onAddDay={() => addDay(trip.id)}
        />
      ) : null}

      <AddSourceDialog
        open={addSourceOpen}
        onOpenChange={setAddSourceOpen}
        initialUrl={initialSourceUrl}
        onSubmit={handleStartExtract}
        guardBeforeSubmit={guardBeforeSubmit}
        trip={trip}
        sources={sources}
        pendingUrls={tripPendings.map((p) => p.url)}
        atSourceCap={atSourceCap}
        loadingPendingCount={loadingPendingCount}
        isMobile={isMobile}
      />

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
    <div id="source-search" className="shrink-0 bg-background px-4 pb-3 pt-4">
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
          autoFocus
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
  onAddAllDay,
  isDayComplete,
  toolbar = null,
}: {
  groups: { day: number | null; items: SourceItem[] }[]
  emptyTitle: string
  emptyDescription: string
  renderItem: (item: SourceItem) => ReactNode
  /** Filtro controlado desde InspirationPanel (compartido con Crónica). */
  query?: string
  /** Lista virtualizada (Ruta). Independiente del buscador: Desplazamientos no virtualiza. */
  virtualized?: boolean
  /** Ruta: añade los ítems de ese grupo al día correspondiente del viaje. */
  onAddAllDay?: (group: { day: number | null; items: SourceItem[] }) => void
  /** True si todos los ítems del grupo ya están en el día que les toca. */
  isDayComplete?: (day: number | null, items: SourceItem[]) => boolean
  /** CTA encima de los grupos (p. ej. copiar la ruta entera). */
  toolbar?: ReactNode
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
      <div className="space-y-5 px-4 pb-6 pt-4 max-md:pb-[var(--wp-nav-clearance)]">
        <div className="panel-column space-y-5">
        {toolbar}
        {filteredGroups.map((group, gi) => (
          <div key={gi} className="space-y-2">
            {group.items.length > 0 && (onAddAllDay || group.day != null) ? (
              <DayGroupHeading
                day={group.day}
                items={group.items}
                onAddAll={onAddAllDay}
                complete={isDayComplete?.(group.day, group.items) ?? false}
              />
            ) : null}
            {group.items.map((item) => renderItem(item))}
          </div>
        ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col md:min-h-0 md:overflow-hidden">
      {hasFilter && filteredGroups.length === 0 ? (
        <>
          {toolbar ? (
            <div className="px-4 pb-2 pt-3">
              <div className="panel-column">{toolbar}</div>
            </div>
          ) : null}
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Ningún ítem coincide con «{needle}».
          </p>
        </>
      ) : (
        <VirtualSourceRows
          groups={filteredGroups}
          renderItem={renderItem}
          resetKey={query}
          onAddAllDay={onAddAllDay}
          isDayComplete={isDayComplete}
          toolbar={toolbar}
        />
      )}
    </div>
  )
}

function DayGroupHeading({
  day,
  items = [],
  onAddAll,
  complete = false,
  compact = false,
}: {
  day: number | null
  items?: SourceItem[]
  onAddAll?: (group: { day: number | null; items: SourceItem[] }) => void
  complete?: boolean
  compact?: boolean
}) {
  const labelClass =
    "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
  const label = day == null ? "Sitios de esta fuente" : `Día ${day}`
  const addDayAria =
    day == null
      ? "Añadir a Mi viaje"
      : `Añadir el día ${day} a Mi viaje`

  if (!onAddAll) {
    if (day == null) return null
    return (
      <p className={cn("px-0.5", labelClass, compact && "pb-2 pt-0.5")}>
        {label}
      </p>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-0.5",
        compact && "pb-2 pt-0.5",
      )}
    >
      <p className={labelClass}>{label}</p>
      {complete ? null : (
        <button
          type="button"
          onClick={() => onAddAll({ day, items })}
          className="inline-flex min-h-8 shrink-0 items-center gap-1 text-xs font-medium text-foreground transition-colors hover:text-muted-foreground"
          aria-label={addDayAria}
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          {day == null ? "Añadir a Mi viaje" : "Añadir día a Mi viaje"}
        </button>
      )}
    </div>
  )
}

type FlatRow =
  | { kind: "header"; key: string; day: number | null; items: SourceItem[] }
  | { kind: "item"; key: string; item: SourceItem; groupGap: boolean }

function flattenSourceGroups(
  groups: { day: number | null; items: SourceItem[] }[],
): FlatRow[] {
  const rows: FlatRow[] = []
  groups.forEach((group, gi) => {
    if (group.items.length > 0) {
      rows.push({
        kind: "header",
        key: `day-${group.day ?? "none"}-${gi}`,
        day: group.day,
        items: group.items,
      })
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

type VirtualSourceRowsProps = {
  groups: { day: number | null; items: SourceItem[] }[]
  renderItem: (item: SourceItem) => ReactNode
  resetKey: string
  onAddAllDay?: (group: { day: number | null; items: SourceItem[] }) => void
  isDayComplete?: (day: number | null, items: SourceItem[]) => boolean
  toolbar?: ReactNode
}

type SourceRow = ReturnType<typeof flattenSourceGroups>[number]

function estimateRowSize(
  row: SourceRow | undefined,
  onAddAllDay?: (group: { day: number | null; items: SourceItem[] }) => void,
) {
  if (!row || row.kind === "header") return onAddAllDay ? 40 : 28
  // card ~80px + pb-2; más aire entre grupos (antes space-y-5)
  return row.groupGap ? 108 : 92
}

/** Filas virtuales: idénticas contra la ventana o contra un contenedor propio. */
function VirtualRowsBody({
  rows,
  virtualizer,
  renderItem,
  onAddAllDay,
  isDayComplete,
}: {
  rows: SourceRow[]
  virtualizer: Virtualizer<HTMLDivElement, Element> | Virtualizer<Window, Element>
  renderItem: (item: SourceItem) => ReactNode
  onAddAllDay?: (group: { day: number | null; items: SourceItem[] }) => void
  isDayComplete?: (day: number | null, items: SourceItem[]) => boolean
}) {
  // Con scroller de ventana, `start` viene en coordenadas del documento:
  // `scrollMargin` lo devuelve al origen de la lista (0 en el otro caso).
  const scrollMargin = virtualizer.options.scrollMargin

  return (
    <div className="panel-column">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vRow) => {
          const row = rows[vRow.index]
          if (!row) return null
          return (
            <div
              key={row.key}
              data-index={vRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${vRow.start - scrollMargin}px)` }}
            >
              {row.kind === "header" ? (
                <DayGroupHeading
                  day={row.day}
                  items={row.items}
                  onAddAll={onAddAllDay}
                  complete={isDayComplete?.(row.day, row.items) ?? false}
                  compact
                />
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

/** Desktop: el scroller es el propio contenedor de la lista. */
function ElementVirtualSourceRows({
  groups,
  renderItem,
  resetKey,
  onAddAllDay,
  isDayComplete,
  toolbar,
}: VirtualSourceRowsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => flattenSourceGroups(groups), [groups])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateRowSize(rows[index], onAddAllDay),
    overscan: 10,
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    virtualizer.scrollToOffset(0)
    // Solo al cambiar el filtro / resetKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6"
    >
      {toolbar ? <div className="panel-column pb-2 pt-3">{toolbar}</div> : null}
      <VirtualRowsBody
        rows={rows}
        virtualizer={virtualizer}
        renderItem={renderItem}
        onAddAllDay={onAddAllDay}
        isDayComplete={isDayComplete}
      />
    </div>
  )
}

/** Móvil: el scroller es el documento (ver `trips-shell`), no la lista. */
function WindowVirtualSourceRows({
  groups,
  renderItem,
  resetKey,
  onAddAllDay,
  isDayComplete,
  toolbar,
}: VirtualSourceRowsProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => flattenSourceGroups(groups), [groups])
  /**
   * Distancia de la lista al origen del documento. Medida contra el rect y no
   * con `offsetTop`: hay ancestros posicionados por el camino y `offsetTop`
   * mediría contra ellos, dejando la lista desplazada la altura del header.
   */
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    // Redondeado: el subpíxel cambiaría el estado en cada frame sin mover nada.
    const measure = () => {
      const next = Math.round(el.getBoundingClientRect().top + window.scrollY)
      setScrollMargin((prev) => (prev === next ? prev : next))
    }
    measure()
    // La cabecera se repliega al bajar: el origen de la lista se mueve con ella.
    // Coalescido a un frame — el `ResizeObserver` sobre el documento dispara en
    // cada paso de esa animación y remedir por evento re-renderiza la lista entera.
    let frame = 0
    const ro = new ResizeObserver(() => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    })
    ro.observe(document.documentElement)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [])

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (index) => estimateRowSize(rows[index], onAddAllDay),
    overscan: 10,
    scrollMargin,
    /*
     * `useWindowVirtualizer` fija el scroller (`window`) ya en el primer
     * render, así que monta filas dentro del commit inicial. Al adjuntarse los
     * refs de `measureElement`, el alto real difiere del estimado y la librería
     * corrige con `flushSync` — desde la fase de commit, que es lo que React
     * rechaza. Con re-render normal la corrección llega un frame después.
     * `useVirtualizer` no lo necesita: su `getScrollElement` devuelve `null` en
     * el primer render y no hay filas que medir todavía.
     */
    useFlushSync: false,
  })

  useEffect(() => {
    window.scrollTo({ top: scrollMargin })
    // Solo al cambiar el filtro / resetKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  return (
    <>
      {toolbar ? (
        <div className="px-4 pb-2 pt-3">
          <div className="panel-column">{toolbar}</div>
        </div>
      ) : null}
      <div ref={listRef} className="px-4 pb-[var(--wp-nav-clearance)]">
        <VirtualRowsBody
          rows={rows}
          virtualizer={virtualizer}
          renderItem={renderItem}
          onAddAllDay={onAddAllDay}
          isDayComplete={isDayComplete}
        />
      </div>
    </>
  )
}

/** Lista virtualizada: solo monta las filas visibles (+ overscan). */
function VirtualSourceRows(props: VirtualSourceRowsProps) {
  const isMobile = useIsMobile()
  // Un virtualizador por scroller: no se puede alternar el hook dentro de uno.
  return isMobile ? (
    <WindowVirtualSourceRows {...props} />
  ) : (
    <ElementVirtualSourceRows {...props} />
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
  onFindInSource,
}: {
  item: SourceItem
  sourceArea: string | null
  isAdded: boolean
  addedDayNumbers: number[]
  tripStartDate?: string | null
  thumbnailMode?: "default" | "transportIcon"
  sourceTypeLabel?: string
  onPick: () => void
  onFindInSource?: () => void
}) {
  const isMobile = useIsMobile()
  return (
    <TravelItemCard
      variant="source"
      title={item.name}
      detail={item.detail}
      type={item.type}
      typeLabel={sourceTypeLabel ?? itemTypeLabel(item.type, item)}
      isAdded={isAdded}
      addedLabel={
        addedDayNumbers.length
          ? formatAddedDaysCompact(addedDayNumbers, tripStartDate)
          : undefined
      }
      href={item.affiliateUrl}
      outboundSurface="inspiration"
      outboundAffiliate={item.affiliateUrl ? "partner" : "auto"}
      thumbnail={
        <InspirationThumbnail
          kind="item"
          item={item}
          area={sourceArea}
          mode={thumbnailMode ?? "default"}
        />
      }
      onSelect={isMobile ? undefined : onPick}
      onFindInSource={onFindInSource}
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
}
