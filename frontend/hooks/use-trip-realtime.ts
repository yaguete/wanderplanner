"use client"

import { useEffect, useRef } from "react"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { useAuth } from "@/lib/auth-context"
import { useTrips } from "@/lib/trip-context"
import type { Trip } from "@/types/itinerary"

/**
 * Realtime del viaje abierto. Filtro `id=eq.{tripId}` — no suscribir `sources`.
 * `trip_members` tiene replica identity full: el DELETE trae `user_id`.
 */
export function useTripRealtime(tripId: string | null, enabled: boolean) {
  const { user } = useAuth()
  const { trips, applyRemoteTrip, dropTrip } = useTrips()
  const tripRef = useRef<Trip | undefined>(undefined)
  tripRef.current = trips.find((t) => t.id === tripId)

  useEffect(() => {
    if (!tripId || !enabled || !isSupabaseConfigured()) return
    if (process.env.NEXT_PUBLIC_TRIP_REALTIME_ENABLED === "false") return
    const supabase = createClient()
    const channel = supabase
      .channel(`trip:${tripId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${tripId}` },
        (payload) => {
          const next = payload.new as { version?: number }
          const current = tripRef.current
          if (!current || typeof next.version !== "number") return
          if (next.version <= (current.version ?? 1)) return
          applyRemoteTrip({
            ...current,
            version: next.version,
            name: typeof (payload.new as { name?: string }).name === "string"
              ? (payload.new as { name: string }).name
              : current.name,
          })
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "trip_members", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          const removed = (payload.old as { user_id?: string } | null)?.user_id
          if (removed && user?.id && removed === user.id) dropTrip(tripId)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [tripId, enabled, applyRemoteTrip, dropTrip, user?.id])
}
