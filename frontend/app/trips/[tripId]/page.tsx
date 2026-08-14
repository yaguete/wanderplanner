"use client"

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTrips } from "@/lib/trip-context"
import { useAuth } from "@/lib/auth-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { draftTripNameFor, takePendingSource } from "@/lib/partner-trip"
import { formatGuideLabel } from "@/lib/itinerary-utils"
import InspirationPanel from "@/components/inspiration-panel"
import ItineraryPanel from "@/components/itinerary-panel-v2"
import { AssistantPanelLayer } from "@/components/assistant-dock"
import { TripMobileNav, type TripMobileSection } from "@/components/trip-mobile-nav"
import { NewTripDialog, type NewTripData } from "@/components/new-trip-dialog"
import { Spinner } from "@/components/ui/spinner"
import {
  useTripChrome,
  type TripDesktopPanel,
  type TripPanelState,
} from "@/lib/trip-chrome-context"

const PANELS_KEY = "wp-trip-panels"
/** Con 3 paneles activos, por debajo de este ancho útil se auto-colapsa el sidebar a rail. */
const AUTO_COLLAPSE_SIDEBAR_PX = 1280

const DEFAULT_PANELS: TripPanelState = {
  sources: true,
  plan: true,
  assistant: false,
}

function readPanels(): TripPanelState {
  if (typeof window === "undefined") return DEFAULT_PANELS
  try {
    const raw = localStorage.getItem(PANELS_KEY)
    if (!raw) return DEFAULT_PANELS
    const parsed = JSON.parse(raw) as Partial<TripPanelState>
    const next: TripPanelState = {
      sources: parsed.sources !== false,
      plan: parsed.plan !== false,
      assistant: Boolean(parsed.assistant),
    }
    if (!next.sources && !next.plan && !next.assistant) return DEFAULT_PANELS
    return next
  } catch {
    return DEFAULT_PANELS
  }
}

function panelCount(p: TripPanelState): number {
  return (p.sources ? 1 : 0) + (p.plan ? 1 : 0) + (p.assistant ? 1 : 0)
}

function DesktopPanelSlot({
  active,
  label,
  padStart,
  children,
}: {
  active: boolean
  label: string
  /** Separación respecto al panel activo anterior (evita gaps fantasma con flex:0). */
  padStart?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      inert={!active}
      className={cn(
        "@container min-h-0 overflow-hidden rounded-lg bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        "transition-opacity duration-150 ease-out",
        active
          ? "min-w-0 opacity-100 [contain:layout_paint]"
          : "pointer-events-none w-0 min-w-0 opacity-0 [content-visibility:hidden]",
        active && padStart && "ml-2.5",
      )}
      style={{ flex: active ? "1 1 0%" : "0 0 0%" }}
      aria-hidden={!active}
      aria-label={label}
    >
      <div className="flex h-full min-h-0 flex-col">{children}</div>
    </div>
  )
}

function TripDetailView({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params)
  const { getTrip, isLoading, startSourceExtraction, updateTrip, getTripSources } = useTrips()
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const trip = getTrip(tripId)
  const querySource = searchParams.get("source")?.trim() || null
  const [stashedSource, setStashedSource] = useState<string | null>(null)
  const autoSourceRequested = useRef<string | null>(null)
  const pendingSourceUrl = querySource || stashedSource
  const isMobile = useIsMobile()
  const { setChrome, setAutoCollapsed } = useTripChrome()

  const [panels, setPanels] = useState<TripPanelState>(DEFAULT_PANELS)
  const [panelsHydrated, setPanelsHydrated] = useState(false)
  const [mobileSection, setMobileSection] = useState<TripMobileSection>("sources")
  const [mobileNavHidden, setMobileNavHidden] = useState(false)
  const mobileSectionRef = useRef(mobileSection)
  mobileSectionRef.current = mobileSection
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const [editTripOpen, setEditTripOpen] = useState(false)

  const selectMobileSection = useCallback((section: TripMobileSection) => {
    setMobileSection(section)
    setMobileNavHidden(false)
  }, [])

  const onSourcesHeaderCollapsed = useCallback((collapsed: boolean) => {
    if (mobileSectionRef.current === "sources") setMobileNavHidden(collapsed)
  }, [])
  const onPlanHeaderCollapsed = useCallback((collapsed: boolean) => {
    if (mobileSectionRef.current === "plan") setMobileNavHidden(collapsed)
  }, [])

  // Evitar mismatch SSR/cliente: leer localStorage tras montar.
  useEffect(() => {
    setPanels(readPanels())
    setPanelsHydrated(true)
  }, [])

  useEffect(() => {
    if (authLoading || isLoading || !user) return
    if (!trip) router.replace("/trips")
  }, [authLoading, isLoading, user, trip, router])

  useEffect(() => {
    if (querySource) return
    setStashedSource(takePendingSource(tripId))
  }, [tripId, querySource])

  useEffect(() => {
    if (!pendingSourceUrl || !trip) return
    if (trip.sourceIds.length > 0) return
    const requestKey = `${tripId}:${pendingSourceUrl}`
    if (autoSourceRequested.current === requestKey) return
    const result = startSourceExtraction(tripId, pendingSourceUrl)
    if (result.ok) autoSourceRequested.current = requestKey
  }, [pendingSourceUrl, trip, tripId, startSourceExtraction])

  useEffect(() => {
    if (!trip?.referrer) return
    const first = getTripSources(tripId)[0]
    if (!first) return
    const guide = formatGuideLabel(first)
    if (!guide || trip.name === guide) return
    if (trip.name === first.area || trip.name === draftTripNameFor(first.url)) {
      updateTrip(trip.id, {
        name: guide,
        startDate: trip.startDate,
        endDate: trip.endDate,
        numDays: trip.numDays,
        expectations: trip.expectations ?? null,
        origin: trip.origin ?? null,
        numTravelers: trip.numTravelers ?? null,
        currency: trip.currency || "EUR",
      })
    }
  }, [trip, tripId, getTripSources, updateTrip])

  useEffect(() => {
    if (!pendingSourceUrl || !trip || trip.sourceIds.length === 0) return
    router.replace(`/trips/${tripId}`)
  }, [pendingSourceUrl, trip, tripId, router])

  useEffect(() => {
    if (!panelsHydrated) return
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify(panels))
    } catch {
      /* ignore */
    }
  }, [panels, panelsHydrated])
  // Al cambiar de viaje, cierra dialogs locales (ajuste en render, no efecto).
  const [layoutTripId, setLayoutTripId] = useState(tripId)
  if (layoutTripId !== tripId) {
    setLayoutTripId(tripId)
    setEditTripOpen(false)
    setMobileSection("sources")
    setMobileNavHidden(false)
    if (!pendingSourceUrl) setAddSourceOpen(false)
  }

  /** Auto-colapso del sidebar con 3 paneles en viewports estrechos. */
  useEffect(() => {
    if (isMobile) {
      setAutoCollapsed(false)
      return
    }
    const update = () => {
      const three = panelCount(panels) === 3
      setAutoCollapsed(three && window.innerWidth < AUTO_COLLAPSE_SIDEBAR_PX)
    }
    update()
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("resize", update)
      setAutoCollapsed(false)
    }
  }, [panels, isMobile, setAutoCollapsed])

  const togglePanel = useCallback((panel: TripDesktopPanel) => {
    setPanels((prev) => {
      const turningOff = prev[panel]
      if (turningOff && panelCount(prev) <= 1) return prev
      return { ...prev, [panel]: !prev[panel] }
    })
  }, [])

  /** Publica toggles en el header del shell (solo desktop). */
  useEffect(() => {
    if (isMobile || !trip) {
      setChrome(null)
      return
    }
    setChrome({
      panels,
      onTogglePanel: togglePanel,
    })
    return () => setChrome(null)
  }, [isMobile, trip, panels, togglePanel, setChrome])

  const openAddSource = useCallback(
    (open: boolean) => {
      if (open && isMobile) selectMobileSection("sources")
      setAddSourceOpen(open)
    },
    [isMobile, selectMobileSection],
  )

  const revealSources = useCallback(() => {
    if (isMobile) selectMobileSection("sources")
    else setPanels((prev) => ({ ...prev, sources: true }))
  }, [isMobile, selectMobileSection])

  const openEditTrip = useCallback(() => setEditTripOpen(true), [])

  const handleAssistantOpenChange = useCallback((open: boolean) => {
    setPanels((prev) => {
      if (open) return { ...prev, assistant: true }
      if (panelCount(prev) <= 1) return prev
      return { ...prev, assistant: false }
    })
  }, [])

  const sourcesNode = useMemo(
    () => (
      <InspirationPanel
        tripId={tripId}
        addSourceOpen={addSourceOpen}
        onAddSourceOpenChange={openAddSource}
        initialSourceUrl={pendingSourceUrl}
        onRevealSources={revealSources}
        onHeaderCollapsedChange={onSourcesHeaderCollapsed}
        activeOnMobile={mobileSection === "sources"}
      />
    ),
    [tripId, addSourceOpen, openAddSource, pendingSourceUrl, revealSources, onSourcesHeaderCollapsed, mobileSection],
  )
  const planNode = useMemo(
    () => (
      <ItineraryPanel
        tripId={tripId}
        onEditTrip={openEditTrip}
        onHeaderCollapsedChange={onPlanHeaderCollapsed}
        activeOnMobile={mobileSection === "plan"}
      />
    ),
    [tripId, openEditTrip, onPlanHeaderCollapsed, mobileSection],
  )

  const assistantOpen = panels.assistant
  const assistantNode = useMemo(
    () => (
      <AssistantPanelLayer
        open={assistantOpen}
        onOpenChange={handleAssistantOpenChange}
        tripId={tripId}
        variant="panel"
      />
    ),
    [assistantOpen, handleAssistantOpenChange, tripId],
  )

  if (isLoading && !trip) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  if (!trip) return null

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <NewTripDialog
        open={editTripOpen}
        mode="edit"
        initial={{
          name: trip.name,
          startDate: trip.startDate,
          endDate: trip.endDate,
          numDays: trip.numDays,
          expectations: trip.expectations ?? null,
          origin: trip.origin ?? null,
          numTravelers: trip.numTravelers ?? null,
          currency: trip.currency || "EUR",
        }}
        itineraryDayCount={trip.days.length}
        onOpenChange={setEditTripOpen}
        onSubmit={(data: NewTripData) => {
          const result = updateTrip(trip.id, {
            name: data.name,
            startDate: data.startDate,
            endDate: data.endDate,
            numDays: data.numDays,
            expectations: data.expectations,
            origin: data.origin,
            numTravelers: data.numTravelers,
            currency: data.currency,
          })
          if (!result.ok) return { error: result.error }
          setEditTripOpen(false)
        }}
      />

      {isMobile ? (
        <div
          className="relative min-h-0 flex-1 overflow-hidden"
          style={
            mobileNavHidden
              ? ({ "--wp-nav-height": "var(--wp-nav-height-compact)" } as CSSProperties)
              : undefined
          }
        >
          <div
            className={cn(
              "@container absolute inset-0",
              mobileSection === "sources" ? "visible z-[1]" : "invisible pointer-events-none",
            )}
            aria-hidden={mobileSection !== "sources"}
          >
            {sourcesNode}
          </div>

          <div
            className={cn(
              "@container absolute inset-0",
              mobileSection === "plan" ? "visible z-[1]" : "invisible pointer-events-none",
            )}
            aria-hidden={mobileSection !== "plan"}
          >
            {planNode}
          </div>

          <AssistantPanelLayer
            open={mobileSection === "assistant"}
            onOpenChange={(open) => {
              if (open) selectMobileSection("assistant")
              else selectMobileSection("sources")
            }}
            tripId={tripId}
            variant="section"
            bottomNav={
              <TripMobileNav
                variant="embedded"
                active={mobileSection}
                onChange={selectMobileSection}
              />
            }
          />

          {mobileSection !== "assistant" ? (
            <TripMobileNav
              active={mobileSection}
              onChange={selectMobileSection}
              compact={mobileNavHidden}
            />
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            "flex min-h-0 flex-1 p-2.5 pt-0",
            !panelsHydrated && "invisible",
          )}
        >
          <DesktopPanelSlot active={panels.sources} label="Fuentes" padStart={false}>
            {sourcesNode}
          </DesktopPanelSlot>

          <DesktopPanelSlot active={panels.plan} label="Viaje" padStart={panels.sources}>
            {planNode}
          </DesktopPanelSlot>

          <DesktopPanelSlot
            active={panels.assistant}
            label="Asistente"
            padStart={panels.sources || panels.plan}
          >
            {assistantNode}
          </DesktopPanelSlot>
        </div>
      )}
    </div>
  )
}

export default function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  return (
    <Suspense fallback={null}>
      <TripDetailView params={params} />
    </Suspense>
  )
}
