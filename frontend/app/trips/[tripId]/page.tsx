"use client"

import { Suspense, use, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PanelRightClose, PanelRightOpen, Plus, Sparkles, X } from "lucide-react"
import type { ImperativePanelHandle } from "react-resizable-panels"
import { useTrips } from "@/lib/trip-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import InspirationPanel from "@/components/inspiration-panel"
import ItineraryPanel from "@/components/itinerary-panel-v2"
import { AssistantPanelLayer } from "@/components/assistant-dock"
import { TripBreadcrumb } from "@/components/trip-breadcrumb"
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
  const { getTrip, isLoading, addSourceToTrip } = useTrips()
  const router = useRouter()
  const searchParams = useSearchParams()
  const trip = getTrip(tripId)
  const pendingSourceUrl = searchParams.get("source")
  const autoSourceRequested = useRef(false)
  const isMobile = useIsMobile()
  /** Lectura síncrona: evita true→false tras hidratar y el flash de cierre. */
  const [planOpen, setPlanOpen] = useState(readPlanOpen)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  /**
   * La transición solo tras el primer paint (o un toggle).
   * Si no, al cambiar de viaje el remount anima el panel “escapándose” a la derecha.
   * Solo aplica al overlay móvil.
   */
  const [planAnimEnabled, setPlanAnimEnabled] = useState(false)
  const planPanelRef = useRef<ImperativePanelHandle>(null)

  // Solo se concluye que el viaje no existe cuando la carga ha terminado.
  useEffect(() => {
    if (!isLoading && !trip) router.replace("/trips")
  }, [isLoading, trip, router])

  // Viaje llegado desde el CTA de un blog (`/start`): se extrae su fuente una sola vez.
  useEffect(() => {
    if (!pendingSourceUrl || !trip || autoSourceRequested.current) return
    autoSourceRequested.current = true
    router.replace(`/trips/${tripId}`)
    if (trip.sourceIds.length > 0) return
    void addSourceToTrip(tripId, pendingSourceUrl).catch(() => {
      setAddSourceOpen(true)
    })
  }, [pendingSourceUrl, trip, tripId, addSourceToTrip, router])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPlanAnimEnabled(true))
    })
    return () => cancelAnimationFrame(id)
  }, [])

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
    setAddSourceOpen(false)
  }, [tripId])

  useEffect(() => {
    if (!planOpen && !assistantOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (assistantOpen) {
        setAssistantOpen(false)
        return
      }
      if (planOpen) {
        setPlanAnimEnabled(true)
        setPlanOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [planOpen, assistantOpen])

  if (isLoading && !trip) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  if (!trip) return null

  const closePlan = () => {
    setPlanAnimEnabled(true)
    setPlanOpen(false)
  }

  const togglePlan = () => {
    setAddSourceOpen(false)
    if (isMobile) {
      setAssistantOpen(false)
      setPlanAnimEnabled(true)
      setPlanOpen((v) => !v)
      return
    }
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
      setAssistantOpen(false)
      setPlanAnimEnabled(true)
      setPlanOpen(false)
    }
    setAddSourceOpen(open)
  }

  const inspirationColumn = (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
      <InspirationPanel
        tripId={tripId}
        addSourceOpen={addSourceOpen}
        onAddSourceOpenChange={openAddSource}
      />

      {!isMobile && !assistantOpen ? (
        <Button
          type="button"
          variant="outline"
          className="absolute bottom-4 right-3 z-40 h-11 gap-2 rounded-full px-4 text-sm shadow-md"
          onClick={() => setAssistantOpen(true)}
          aria-controls="inspiration-assistant-panel"
          aria-expanded={false}
        >
          <Sparkles className="h-4 w-4" />
          Asistente
        </Button>
      ) : null}

      <AssistantPanelLayer
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        tripId={tripId}
      />
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <TripBreadcrumb
        trip={trip}
        planOpen={planOpen}
        onTogglePlan={togglePlan}
        addSourceOpen={addSourceOpen}
        onToggleAddSource={() => {
          setAssistantOpen(false)
          setPlanAnimEnabled(true)
          setPlanOpen(false)
          setAddSourceOpen((v) => !v)
        }}
      />

      {isMobile ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {inspirationColumn}

          {planOpen ? (
            <button
              type="button"
              className="absolute inset-0 z-20 bg-foreground/20"
              aria-label="Cerrar Mi viaje"
              onClick={closePlan}
            />
          ) : null}

          <aside
            id="trip-plan-panel"
            aria-label="Mi viaje"
            aria-hidden={!planOpen}
            className={cn(
              "absolute z-30 flex flex-col overflow-hidden bg-background",
              planAnimEnabled && "transition-transform duration-200 ease-out",
              "inset-0 w-full border-l border-border",
              planOpen ? "translate-x-0" : "pointer-events-none translate-x-full",
            )}
          >
            <ItineraryPanel tripId={tripId} onClose={closePlan} />
          </aside>

          {!assistantOpen ? (
            <div className="absolute bottom-4 right-3 z-[50] flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-full bg-background shadow-md"
                onClick={() => {
                  setAssistantOpen(false)
                  setPlanAnimEnabled(true)
                  setPlanOpen(false)
                  setAddSourceOpen((v) => !v)
                }}
                aria-pressed={addSourceOpen}
                aria-label={addSourceOpen ? "Cancelar añadir fuente" : "Añadir fuente"}
              >
                {addSourceOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-full bg-background shadow-md"
                onClick={() => {
                  setPlanAnimEnabled(true)
                  setPlanOpen(false)
                  setAddSourceOpen(false)
                  setAssistantOpen(true)
                }}
                aria-controls="inspiration-assistant-panel"
                aria-expanded={false}
                aria-label="Abrir asistente"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={planOpen ? "secondary" : "default"}
                size="icon"
                className={cn(
                  "h-11 w-11 rounded-full shadow-md",
                  planOpen ? "bg-muted text-foreground hover:bg-muted/80" : "shadow-primary/20",
                )}
                onClick={togglePlan}
                aria-pressed={planOpen}
                aria-controls="trip-plan-panel"
                aria-label={planOpen ? "Cerrar Mi viaje" : "Abrir Mi viaje"}
              >
                {planOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : null}
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
