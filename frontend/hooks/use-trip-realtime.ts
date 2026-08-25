"use client"

import { useEffect, useRef } from "react"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { useAuth } from "@/lib/auth-context"
import { useTrips } from "@/lib/trip-context"

const COALESCE_MS = 300

/**
 * Realtime del viaje abierto. Filtro `id=eq.{tripId}` — no suscribir `sources`.
 * Skip del eco propio contra `savedTrip().version` (el estado React va retrasado).
 * Ingesta por la cola del syncer: refetch del documento + fusión a 3 bandas.
 * `trip_members` tiene replica identity full: el DELETE trae `user_id`.
 */
export function useTripRealtime(tripId: string | null, enabled: boolean) {
  const { user } = useAuth()
  const { ingestRemote, savedTrip, dropTrip } = useTrips()
  const ingestRef = useRef(ingestRemote)
  ingestRef.current = ingestRemote
  const savedRef = useRef(savedTrip)
  savedRef.current = savedTrip

  useEffect(() => {
    if (!tripId || !enabled || !isSupabaseConfigured()) return
    if (process.env.NEXT_PUBLIC_TRIP_REALTIME_ENABLED === "false") return
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const channel = supabase
      .channel(`trip:${tripId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${tripId}` },
        (payload) => {
          const next = payload.new as { version?: number }
          const incoming = typeof next.version === "number" ? next.version : null
          const savedVer = savedRef.current(tripId)?.version ?? 1
          if (incoming !== null && incoming <= savedVer) return
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => {
            timer = null
            void ingestRef.current(tripId)
          }, COALESCE_MS)
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
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [tripId, enabled, dropTrip, user?.id])
}
