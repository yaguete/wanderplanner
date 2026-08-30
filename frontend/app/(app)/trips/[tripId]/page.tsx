"use client"

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTrips } from "@/lib/trip-context"
import { useAuth } from "@/lib/auth-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { useStableList } from "@/hooks/use-stable-list"
import { cn } from "@/lib/utils"
import { draftTripNameFor, takePendingSource } from "@/lib/partner-trip"
import { formatGuideLabel } from "@/lib/itinerary-utils"
import { confidentTripDestinationLabel } from "@/lib/assistant-suggestions"
import {
  ADD_SOURCE_OPEN_EVENT,
  REVEAL_SOURCES_EVENT,
} from "@/lib/onboarding"
import InspirationPanel from "@/components/inspiration-panel"
import ItineraryPanel from "@/components/itinerary-panel-v2"
import dynamic from "next/dynamic"
import { TripMobileNav, type TripMobileSection } from "@/components/trip-mobile-nav"
import { NewTripDialog, type NewTripData } from "@/components/new-trip-dialog"
import { OpeningTripStatus, useOpeningTrip } from "@/components/opening-trip"
import { shouldBounceMissingTrip } from "@/lib/trip-open-guard"
import { parseTripTabParam, tripDetailPath } from "@/lib/trip-tab"
import { TripPanelsEmpty } from "@/components/trip-panel-toggles"
import {
  useTripChrome,
  type TripDesktopPanel,
  type TripPanelState,
} from "@/lib/trip-chrome-context"
import { useTripRealtime } from "@/hooks/use-trip-realtime"

const AssistantPanelLayer = dynamic(
  () => import("@/components/assistant-dock").then((m) => m.AssistantPanelLayer),
  { ssr: false },
)

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
    return {
      sources: parsed.sources !== false,
      plan: parsed.plan !== false,
      assistant: Boolean(parsed.assistant),
    }
  } catch {
    return DEFAULT_PANELS
  }
}

function panelCount(p: TripPanelState): number {
  return (p.sources ? 1 : 0) + (p.plan ? 1 : 0) + (p.assistant ? 1 : 0)
}

/**
 * Hueco de panel (Fuentes / Viaje / Asistente). **Un solo nodo para las dos
 * disposiciones**: quién se ve lo decide CSS (`max-md:` / `md:`), no el árbol.
 *
 * Antes había dos ramas de JSX (`isMobile ? … : …`). Cruzar 768 px movía los
 * paneles a otra posición del árbol, así que React desmontaba y volvía a montar
 * `InspirationPanel` y `ItineraryPanel` enteros —cientos de tarjetas— de golpe,
 * y el panel Fuentes perdía pestaña, búsqueda y scroll en cada cambio de
 * tamaño. No es hipotético en producción: un iPad mini al girar, o el
 * multitarea a pantalla partida, cruzan el breakpoint.
 *
 * Es además la regla que ya declara el shell en `trips-shell.tsx`: los
 * breakpoints van en CSS, no en `useIsMobile()`. `isMobile` se queda solo para
 * `inert` / `aria-hidden`, que son atributos y no cambian la forma del árbol.
 */
function TripPanelSlot({
  mobileActive,
  desktopActive,
  effectiveActive,
  label,
  padStart,
  children,
}: {
  mobileActive: boolean
  desktopActive: boolean
  /** El que manda para `inert` / `aria-hidden`: eso sí depende del viewport. */
  effectiveActive: boolean
  label: string
  /** Separación respecto al panel activo anterior (evita gaps fantasma con flex:0). */
  padStart?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      inert={!effectiveActive}
      className={cn(
        "@container",
        // Móvil: la sección activa va en flujo (el scroller es el documento);
        // la inactiva, `display:none` — el componente sigue montado.
        mobileActive ? "max-md:flex max-md:flex-1 max-md:flex-col" : "max-md:hidden",
        // Escritorio: tarjeta con alto acotado y `flex` alícuota.
        "md:block md:min-h-0 md:overflow-hidden md:rounded-lg md:bg-background",
        "md:shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:transition-opacity md:duration-150 md:ease-out",
        desktopActive
          ? "md:min-w-0 md:flex-[1_1_0%] md:opacity-100 md:[contain:layout_paint]"
          : "md:pointer-events-none md:w-0 md:min-w-0 md:flex-[0_0_0%] md:opacity-0 md:[content-visibility:hidden]",
        desktopActive && padStart && "md:ml-2.5",
      )}
      aria-hidden={!effectiveActive}
      aria-label={label}
    >
      <div className="flex flex-col max-md:flex-1 md:h-full md:min-h-0">{children}</div>
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
  useTripRealtime(tripId, Boolean(trip))
  const tripSources = useStableList(getTripSources(tripId))
  const emptyDestination = useMemo(
    () => (trip ? confidentTripDestinationLabel(trip, tripSources) : null),
    [trip, tripSources],
  )
  const querySource = searchParams.get("source")?.trim() || null
  const queryTab = parseTripTabParam(searchParams.get("tab"))
  const [stashedSource, setStashedSource] = useState<string | null>(null)
  const autoSourceRequested = useRef<string | null>(null)
  const pendingSourceUrl = querySource || stashedSource
  const isMobile = useIsMobile()
  const { setChrome, setAutoCollapsed } = useTripChrome()
  const { openingTrip, clearOpeningTrip } = useOpeningTrip()

  const [panels, setPanels] = useState<TripPanelState>(DEFAULT_PANELS)
  const [panelsHydrated, setPanelsHydrated] = useState(false)
  const [mobileSection, setMobileSection] = useState<TripMobileSection>(
    queryTab ? "plan" : "sources",
  )
  const [mobileNavHidden, setMobileNavHidden] = useState(false)
  const mobileSectionRef = useRef(mobileSection)
  mobileSectionRef.current = mobileSection
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const [editTripOpen, setEditTripOpen] = useState(false)

  /**
   * Móvil: las tres secciones comparten un único scroller (el documento, para
   * que el navegador pueda colapsar su barra de direcciones), así que la
   * posición de cada una se guarda a mano al salir de ella.
   */
  const sectionScrollRef = useRef<Partial<Record<TripMobileSection, number>>>({})

  const selectMobileSection = useCallback((section: TripMobileSection) => {
    setMobileSection((prev) => {
      if (prev !== section) sectionScrollRef.current[prev] = window.scrollY
      return section
    })
    setMobileNavHidden(false)
  }, [])

  /**
   * Restaura el scroll al volver a una sección. El Asistente es la excepción:
   * es un chat con composer anclado al teclado y conserva shell fijo, así que
   * el documento se congela arriba mientras dura (y ahí el navegador no colapsa
   * su barra — como cualquier chat en móvil).
   */
  useEffect(() => {
    if (!isMobile) return
    if (mobileSection === "assistant") {
      window.scrollTo(0, 0)
      document.documentElement.dataset.wpScrollLock = "1"
      return () => {
        delete document.documentElement.dataset.wpScrollLock
      }
    }
    window.scrollTo(0, sectionScrollRef.current[mobileSection] ?? 0)
  }, [isMobile, mobileSection])

  const onSourcesHeaderCollapsed = useCallback((collapsed: boolean) => {
    if (mobileSectionRef.current === "sources") setMobileNavHidden(collapsed)
  }, [])
  const onPlanHeaderCollapsed = useCallback((collapsed: boolean) => {
    if (mobileSectionRef.current === "plan") setMobileNavHidden(collapsed)
  }, [])

  // Evitar mismatch SSR/cliente: leer localStorage tras montar.
  useEffect(() => {
    const stored = readPanels()
    if (queryTab) stored.plan = true
    setPanels(stored)
    setPanelsHydrated(true)
    // Solo al montar: un tab posterior lo aplica el efecto de queryTab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!queryTab) return
    setMobileSection((prev) => (prev === "plan" ? prev : "plan"))
    setPanels((prev) => (prev.plan ? prev : { ...prev, plan: true }))
  }, [queryTab])

  useEffect(() => {
    if (
      !shouldBounceMissingTrip({
        authLoading,
        tripsPending: isLoading,
        userId: user?.id ?? null,
        tripFound: Boolean(trip),
        openingTripId: openingTrip?.id ?? null,
        tripId,
      })
    ) {
      return
    }
    clearOpeningTrip()
    router.replace("/trips")
  }, [authLoading, isLoading, user, trip, tripId, openingTrip, router, clearOpeningTrip])

  useEffect(() => {
    if (trip && openingTrip?.id === trip.id) clearOpeningTrip()
  }, [trip, openingTrip, clearOpeningTrip])

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
    router.replace(tripDetailPath(tripId, queryTab))
  }, [pendingSourceUrl, trip, tripId, router, queryTab])

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
    setMobileSection(queryTab ? "plan" : "sources")
    setMobileNavHidden(false)
    sectionScrollRef.current = {}
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
    setPanels((prev) => ({ ...prev, [panel]: !prev[panel] }))
  }, [])

  /** Publica toggles en el header del shell (solo desktop). En canvas vacío
   *  no: las tres tarjetas del empty state ya abren cada panel. */
  useEffect(() => {
    if (isMobile || !trip || !panelsHydrated || panelCount(panels) === 0) {
      setChrome(null)
      return
    }
    setChrome({
      panels,
      onTogglePanel: togglePanel,
    })
    return () => setChrome(null)
  }, [isMobile, trip, panels, panelsHydrated, togglePanel, setChrome])

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

  useEffect(() => {
    const onAddSource = () => openAddSource(true)
    const onRevealSources = () => revealSources()
    window.addEventListener(ADD_SOURCE_OPEN_EVENT, onAddSource)
    window.addEventListener(REVEAL_SOURCES_EVENT, onRevealSources)
    return () => {
      window.removeEventListener(ADD_SOURCE_OPEN_EVENT, onAddSource)
      window.removeEventListener(REVEAL_SOURCES_EVENT, onRevealSources)
    }
  }, [openAddSource, revealSources])

  const openEditTrip = useCallback(() => setEditTripOpen(true), [])

  const handleAssistantOpenChange = useCallback((open: boolean) => {
    setPanels((prev) => ({ ...prev, assistant: open }))
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
        initialViewMode={queryTab ?? "itinerary"}
        desktopSolo={
          !isMobile &&
          panelsHydrated &&
          panels.plan &&
          !panels.sources &&
          !panels.assistant
        }
      />
    ),
    [
      tripId,
      openEditTrip,
      onPlanHeaderCollapsed,
      mobileSection,
      queryTab,
      isMobile,
      panelsHydrated,
      panels.plan,
      panels.sources,
      panels.assistant,
    ],
  )

  const assistantOpen = panels.assistant
  const wantAssistant = isMobile ? mobileSection === "assistant" : assistantOpen
  const [assistantMounted, setAssistantMounted] = useState(false)
  if (wantAssistant && !assistantMounted) setAssistantMounted(true)

  const assistantNode = useMemo(
    () =>
      assistantMounted ? (
        <AssistantPanelLayer
          open={assistantOpen}
          onOpenChange={handleAssistantOpenChange}
          tripId={tripId}
          variant="panel"
        />
      ) : null,
    [assistantMounted, assistantOpen, handleAssistantOpenChange, tripId],
  )

  if (!trip) {
    if (isLoading || authLoading || openingTrip?.id === tripId) {
      return (
        <div className="flex h-full flex-1 flex-col items-center justify-center">
          <OpeningTripStatus name={openingTrip?.id === tripId ? openingTrip.name : undefined} />
        </div>
      )
    }
    return null
  }

  return (
    <div className="flex flex-1 flex-col md:h-full md:min-h-0 md:overflow-hidden">
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

      {/*
        Un solo árbol para móvil y escritorio: cruzar 768 px cambia clases, no
        la posición de los paneles, así que ni `InspirationPanel` ni
        `ItineraryPanel` se remontan (ver `TripPanelSlot`).

        Móvil: las secciones no se apilan en `absolute inset-0` — con el
        documento como scroller la activa tiene que estar en flujo para darle
        altura al documento; la inactiva va con `display:none` y su posición de
        scroll la guarda `sectionScrollRef`.
      */}
      <div
        className={cn(
          "relative flex flex-1 flex-col md:min-h-0 md:flex-row md:p-2.5 md:pt-0",
          !panelsHydrated && "md:invisible",
        )}
        style={
          isMobile && mobileNavHidden
            ? ({ "--wp-nav-height": "var(--wp-nav-height-compact)" } as CSSProperties)
            : undefined
        }
      >
        {!isMobile && panelCount(panels) === 0 ? (
          <TripPanelsEmpty onSelect={togglePanel} destination={emptyDestination} />
        ) : null}

        <TripPanelSlot
          mobileActive={mobileSection === "sources"}
          desktopActive={panels.sources}
          effectiveActive={isMobile ? mobileSection === "sources" : panels.sources}
          label="Fuentes"
          padStart={false}
        >
          {sourcesNode}
        </TripPanelSlot>

        <TripPanelSlot
          mobileActive={mobileSection === "plan"}
          desktopActive={panels.plan}
          effectiveActive={isMobile ? mobileSection === "plan" : panels.plan}
          label="Viaje"
          padStart={panels.sources}
        >
          {planNode}
        </TripPanelSlot>

        {/* El asistente sí cambia de forma (chat a pantalla completa vs panel),
            y es barato: pocas tarjetas, montado en diferido. Sigue ramificando. */}
        {isMobile ? (
          assistantMounted ? (
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
          ) : null
        ) : (
          <TripPanelSlot
            mobileActive={false}
            desktopActive={panels.assistant}
            effectiveActive={panels.assistant}
            label="Asistente"
            padStart={panels.sources || panels.plan}
          >
            {assistantNode}
          </TripPanelSlot>
        )}

        {isMobile && mobileSection !== "assistant" ? (
          <TripMobileNav
            active={mobileSection}
            onChange={selectMobileSection}
            compact={mobileNavHidden}
          />
        ) : null}
      </div>
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
