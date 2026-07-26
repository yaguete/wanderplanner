"use client"

import { use, useEffect, useState, type CSSProperties } from "react"
import { useRouter } from "next/navigation"
import { PanelRightClose, PanelRightOpen, Plus, Sparkles, X } from "lucide-react"
import { useTrips } from "@/lib/trip-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import InspirationPanel from "@/components/inspiration-panel"
import ItineraryPanel from "@/components/itinerary-panel-v2"
import { AssistantPanelLayer, PLAN_PANEL_RIGHT_OFFSET } from "@/components/assistant-dock"
import { TripBreadcrumb } from "@/components/trip-breadcrumb"
import { Button } from "@/components/ui/button"

const PLAN_OPEN_KEY = "wp-plan-open"

function readPlanOpen(): boolean {
  if (typeof window === "undefined") return true
  try {
    return localStorage.getItem(PLAN_OPEN_KEY) !== "0"
  } catch {
    return true
  }
}

export default function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params)
  const { getTrip } = useTrips()
  const router = useRouter()
  const trip = getTrip(tripId)
  const isMobile = useIsMobile()
  /** Lectura síncrona: evita true→false tras hidratar y el flash de cierre. */
  const [planOpen, setPlanOpen] = useState(readPlanOpen)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  /**
   * La transición solo tras el primer paint (o un toggle).
   * Si no, al cambiar de viaje el remount anima el panel “escapándose” a la derecha.
   */
  const [planAnimEnabled, setPlanAnimEnabled] = useState(false)

  useEffect(() => {
    if (!trip) router.replace("/trips")
  }, [trip, router])

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

  if (!trip) return null

  const shiftAssistantForPlan = planOpen && !isMobile

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <TripBreadcrumb
        trip={trip}
        planOpen={planOpen}
        onTogglePlan={() => {
          setAddSourceOpen(false)
          if (isMobile) setAssistantOpen(false)
          setPlanAnimEnabled(true)
          setPlanOpen((v) => !v)
        }}
        addSourceOpen={addSourceOpen}
        onToggleAddSource={() => {
          setAssistantOpen(false)
          setPlanAnimEnabled(true)
          setPlanOpen(false)
          setAddSourceOpen((v) => !v)
        }}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="relative h-full min-h-0 overflow-hidden">
          <InspirationPanel
            tripId={tripId}
            addSourceOpen={addSourceOpen}
            onAddSourceOpenChange={(open) => {
              if (open) {
                setAssistantOpen(false)
                setPlanAnimEnabled(true)
                setPlanOpen(false)
              }
              setAddSourceOpen(open)
            }}
          />
        </div>

        {isMobile && planOpen ? (
          <button
            type="button"
            className="absolute inset-0 z-20 bg-foreground/20"
            aria-label="Cerrar Mi viaje"
            onClick={() => {
              setPlanAnimEnabled(true)
              setPlanOpen(false)
            }}
          />
        ) : null}

        <aside
          id="trip-plan-panel"
          aria-label="Mi viaje"
          aria-hidden={!planOpen}
          className={cn(
            "absolute z-30 flex flex-col overflow-hidden bg-background",
            planAnimEnabled && "transition-transform duration-200 ease-out",
            isMobile
              ? "inset-0 w-full border-l border-border"
              : "bottom-2 right-2 top-2 w-[min(560px,calc(100vw-2rem))] rounded-xl border border-border shadow-[0_16px_48px_rgba(0,0,0,0.14)]",
            planOpen
              ? "translate-x-0"
              : cn(
                  "pointer-events-none",
                  isMobile ? "translate-x-full" : "translate-x-[calc(100%+0.5rem)]",
                ),
          )}
        >
          <ItineraryPanel
            tripId={tripId}
            onClose={() => {
              setPlanAnimEnabled(true)
              setPlanOpen(false)
            }}
          />
        </aside>

        {/* Móvil: FABs inferiores (sustituyen al breadcrumb). Se ocultan solo con el asistente. */}
        {isMobile && !assistantOpen ? (
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
              onClick={() => {
                setAddSourceOpen(false)
                setAssistantOpen(false)
                setPlanAnimEnabled(true)
                setPlanOpen((v) => !v)
              }}
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

        {/* Desktop: FAB del asistente (breadcrumb conserva + / Mi viaje). */}
        {!isMobile && !assistantOpen ? (
          <Button
            type="button"
            variant="outline"
            className={cn(
              "absolute bottom-4 z-40 h-11 gap-2 rounded-full px-4 text-sm shadow-md",
              planAnimEnabled && "transition-[right] duration-200",
              shiftAssistantForPlan ? "right-[var(--plan-panel-offset)]" : "right-3",
            )}
            style={
              shiftAssistantForPlan
                ? ({ "--plan-panel-offset": PLAN_PANEL_RIGHT_OFFSET } as CSSProperties)
                : undefined
            }
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
          shiftForPlan={shiftAssistantForPlan}
        />
      </div>
    </div>
  )
}
