"use client"

import { use, useEffect, useState, type CSSProperties } from "react"
import { useRouter } from "next/navigation"
import { Sparkles } from "lucide-react"
import { useTrips } from "@/lib/trip-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import InspirationPanel from "@/components/inspiration-panel"
import ItineraryPanel from "@/components/itinerary-panel-v2"
import { AssistantPanelLayer, PLAN_PANEL_RIGHT_OFFSET } from "@/components/assistant-dock"
import { TripBreadcrumb } from "@/components/trip-breadcrumb"
import { Button } from "@/components/ui/button"

const PLAN_OPEN_KEY = "wp-plan-open"

export default function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params)
  const { getTrip } = useTrips()
  const router = useRouter()
  const trip = getTrip(tripId)
  const isMobile = useIsMobile()
  const [planOpen, setPlanOpen] = useState(true)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!trip) router.replace("/trips")
  }, [trip, router])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PLAN_OPEN_KEY)
      if (stored === "0") setPlanOpen(false)
      else if (stored === "1") setPlanOpen(true)
    } catch {
      /* ignore */
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(PLAN_OPEN_KEY, planOpen ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [planOpen, hydrated])

  useEffect(() => {
    if (!planOpen && !assistantOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (assistantOpen) {
        setAssistantOpen(false)
        return
      }
      if (planOpen) setPlanOpen(false)
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
          setPlanOpen((v) => !v)
        }}
        addSourceOpen={addSourceOpen}
        onToggleAddSource={() => {
          setAssistantOpen(false)
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
            onClick={() => setPlanOpen(false)}
          />
        ) : null}

        <aside
          id="trip-plan-panel"
          aria-label="Mi viaje"
          aria-hidden={!planOpen}
          className={cn(
            "absolute z-30 flex flex-col overflow-hidden bg-background transition-transform duration-200 ease-out",
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
          <ItineraryPanel tripId={tripId} onClose={() => setPlanOpen(false)} />
        </aside>

        {!assistantOpen ? (
          <Button
            type="button"
            variant="outline"
            className={cn(
              "absolute bottom-4 z-40 h-11 gap-2 rounded-full px-4 text-sm shadow-md transition-[right] duration-200",
              shiftAssistantForPlan ? "right-[var(--plan-panel-offset)]" : "right-3",
            )}
            style={
              shiftAssistantForPlan
                ? ({ "--plan-panel-offset": PLAN_PANEL_RIGHT_OFFSET } as CSSProperties)
                : undefined
            }
            onClick={() => {
              if (isMobile) setPlanOpen(false)
              setAssistantOpen(true)
            }}
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
          shiftForPlan={shiftAssistantForPlan}
        />
      </div>
    </div>
  )
}
