"use client"

import { useState } from "react"
import { Share2 } from "lucide-react"
import { ShareRouteDialog } from "@/components/share-route-dialog"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { useAuth } from "@/lib/auth-context"
import { tripHasShareablePlan } from "@/lib/share-briefing"
import type { Trip } from "@/types/itinerary"
import { cn } from "@/lib/utils"

export function ShareRouteButton({ trip }: { trip: Trip }) {
  const { isGuest } = useAuth()
  const { requireAccount } = useRegistrationGate()
  const [open, setOpen] = useState(false)
  const canShare = tripHasShareablePlan(trip)

  return (
    <>
      <button
        type="button"
        disabled={!canShare}
        onClick={() => {
          if (!canShare) return
          if (isGuest && !requireAccount("share-plan")) return
          setOpen(true)
        }}
        className={cn(
          "inline-flex h-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
          "hover:bg-sidebar-accent hover:text-foreground",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "w-8 md:w-auto md:gap-1.5 md:px-2.5",
          "disabled:pointer-events-none disabled:opacity-40",
        )}
        aria-label="Compartir"
        title={canShare ? "Compartir" : "Añade algo a tu ruta para poder compartirla"}
      >
        <Share2 className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        <span className="hidden text-sm font-medium md:inline">Compartir</span>
      </button>
      <ShareRouteDialog tripId={trip.id} open={open} onOpenChange={setOpen} />
    </>
  )
}
