"use client"

import { Suspense, use, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Sparkles } from "lucide-react"
import type { ImperativePanelHandle } from "react-resizable-panels"
import { useTrips } from "@/lib/trip-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { useVirtualKeyboard } from "@/hooks/use-virtual-keyboard"
import { cn } from "@/lib/utils"
import InspirationPanel from "@/components/inspiration-panel"
import ItineraryPanel from "@/components/itinerary-panel-v2"
import { AssistantPanelLayer } from "@/components/assistant-dock"
import { TripBreadcrumb } from "@/components/trip-breadcrumb"
import { TripMobileNav, type TripMobileSection } from "@/components/trip-mobile-nav"
import { NewTripDialog, type NewTripData } from "@/components/new-trip-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"

const PLAN_OPEN_KEY = "wp-plan-open"
const PLAN_LAYOUT_SAVE_ID = "wp-trip-plan-layout"

function readPlanOpen(): boolean {
  if (typeof window === "undefined") return true
  try {
    return localStorage.getItem(PLAN_OPEN_KEY) !== "0"
  } catch {
    return true
  }
}

function TripDetailView({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params)
  const { getTrip, isLoading, addSourceToTrip, updateTrip } = useTrips()
  const router = useRouter()
  const searchParams = useSearchParams()
  const trip = getTrip(tripId)
  const pendingSourceUrl = searchParams.get("source")
  const autoSourceRequested = useRef<string | null>(null)
  const isMobile = useIsMobile()
  const { open: keyboardOpen } = useVirtualKeyboard()
  /** Lectura síncrona: evita true→false tras hidratar y el flash de cierre. */
  const [planOpen, setPlanOpen] = useState(readPlanOpen)
  const [assistantOpen, setAssistantOpen] = useState(false)
  /** Sección activa en la navegación móvil (hermanas, no overlays). */
  const [mobileSection, setMobileSection] = useState<TripMobileSection>("sources")
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const [editTripOpen, setEditTripOpen] = useState(false)
  const [autoSourceError, setAutoSourceError] = useState<string | null>(null)
  const planPanelRef = useRef<ImperativePanelHandle>(null)

  // Solo se concluye que el viaje no existe cuando la carga ha terminado.
  useEffect(() => {
    if (!isLoading && !trip) router.replace("/trips")
  }, [isLoading, trip, router])

  // Viaje llegado desde el CTA de un blog (`/start`): se extrae su fuente una sola vez.
  useEffect(() => {
    if (!pendingSourceUrl || !trip) return
    if (trip.sourceIds.length > 0) return
    const requestKey = `${tripId}:${pendingSourceUrl}`
    if (autoSourceRequested.current === requestKey) return
    autoSourceRequested.current = requestKey
    setAutoSourceError(null)
    // No abrir el formulario mientras el sistema trabaja: solo en error para reintentar.
    void addSourceToTrip(tripId, pendingSourceUrl).catch((error: unknown) => {
      setAutoSourceError(
        error instanceof Error
          ? error.message
          : "No se pudo extraer la fuente. Inténtalo de nuevo.",
      )
      setAddSourceOpen(true)
    })
  }, [pendingSourceUrl, trip, tripId, addSourceToTrip])

  // No consumir `?source=` hasta que la fuente exista: así un fallo conserva la URL para reintentar.
  useEffect(() => {
    if (!pendingSourceUrl || !trip || trip.sourceIds.length === 0) return
    router.replace(`/trips/${tripId}`)
  }, [pendingSourceUrl, trip, tripId, router])

  useEffect(() => {
    try {
      localStorage.setItem(PLAN_OPEN_KEY, planOpen ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [planOpen])

  /** Desktop: sincroniza el panel redimensionable con planOpen (botones / localStorage). */
  useEffect(() => {
    if (isMobile) return
    const id = requestAnimationFrame(() => {
      const panel = planPanelRef.current
      if (!panel) return
      if (planOpen) {
        if (panel.isCollapsed()) panel.expand()
      } else if (!panel.isCollapsed()) {
        panel.collapse()
      }
    })
    return () => cancelAnimationFrame(id)
  }, [planOpen, isMobile])

  /** Al cambiar de viaje, cierra overlays locales; el panel Mi viaje conserva su estado. */
  useEffect(() => {
    setAssistantOpen(false)
    setEditTripOpen(false)
    setMobileSection("sources")
    if (!pendingSourceUrl) setAddSourceOpen(false)
  }, [tripId, pendingSourceUrl])

  useEffect(() => {
    if (isMobile || !assistantOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setAssistantOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [assistantOpen, isMobile])

  if (isLoading && !trip) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  if (!trip) return null

  const closePlan = () => {
    setPlanOpen(false)
  }

  const togglePlan = () => {
    setAddSourceOpen(false)
    const panel = planPanelRef.current
    if (!panel) {
      setPlanOpen((v) => !v)
      return
    }
    if (panel.isCollapsed()) panel.expand()
    else panel.collapse()
  }

  const openAddSource = (open: boolean) => {
    if (open) {
      if (isMobile) {
        setMobileSection("sources")
      } else {
        setAssistantOpen(false)
      }
    }
    setAddSourceOpen(open)
  }

  const inspirationColumn = (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
      <InspirationPanel
        tripId={tripId}
        addSourceOpen={addSourceOpen}
        onAddSourceOpenChange={openAddSource}
        initialSourceUrl={pendingSourceUrl}
        autoSourceError={autoSourceError}
      />

      {!isMobile && !assistantOpen ? (
        <Button
          type="button"
          className="assistant-cta absolute bottom-4 right-3 z-40 h-11 gap-2 rounded-full px-4 text-sm"
          onClick={() => setAssistantOpen(true)}
          aria-controls="inspiration-assistant-panel"
          aria-expanded={false}
        >
          <Sparkles className="h-4 w-4" />
          Asistente
        </Button>
      ) : null}

      {!isMobile ? (
        <AssistantPanelLayer
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          tripId={tripId}
          variant="overlay"
        />
      ) : null}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <TripBreadcrumb
        trip={trip}
        planOpen={planOpen}
        onTogglePlan={togglePlan}
        onEditTrip={() => setEditTripOpen(true)}
      />

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
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "absolute inset-0",
              mobileSection === "sources" ? "visible z-[1]" : "invisible pointer-events-none",
            )}
            aria-hidden={mobileSection !== "sources"}
          >
            <InspirationPanel
              tripId={tripId}
              addSourceOpen={addSourceOpen}
              onAddSourceOpenChange={openAddSource}
              initialSourceUrl={pendingSourceUrl}
              autoSourceError={autoSourceError}
            />
          </div>

          <div
            className={cn(
              "absolute inset-0",
              mobileSection === "plan" ? "visible z-[1]" : "invisible pointer-events-none",
            )}
            aria-hidden={mobileSection !== "plan"}
          >
            <ItineraryPanel tripId={tripId} />
          </div>

          <AssistantPanelLayer
            open={mobileSection === "assistant"}
            onOpenChange={(open) => {
              if (open) setMobileSection("assistant")
              else setMobileSection("sources")
            }}
            tripId={tripId}
            variant="section"
          />

          <TripMobileNav
            active={mobileSection}
            onChange={setMobileSection}
            hidden={keyboardOpen}
          />
        </div>
      ) : (
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId={PLAN_LAYOUT_SAVE_ID}
          className="min-h-0 flex-1"
        >
          <ResizablePanel defaultSize={65} minSize={30} className="min-h-0 min-w-0">
            {inspirationColumn}
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className={cn(
              "w-px bg-border transition-opacity",
              !planOpen && "pointer-events-none opacity-0",
            )}
          />

          <ResizablePanel
            ref={planPanelRef}
            id="trip-plan-panel"
            collapsible
            collapsedSize={0}
            defaultSize={planOpen ? 35 : 0}
            minSize={20}
            maxSize={50}
            onCollapse={() => setPlanOpen(false)}
            onExpand={() => setPlanOpen(true)}
            className={cn(
              "min-h-0 overflow-hidden bg-background",
              planOpen && "border-l border-border",
            )}
            aria-label="Mi viaje"
            aria-hidden={!planOpen}
          >
            <div className={cn("flex h-full min-h-0 flex-col", !planOpen && "invisible")}>
              <ItineraryPanel tripId={tripId} onClose={closePlan} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
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
