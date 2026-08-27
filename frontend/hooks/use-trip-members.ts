"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { inviterLabel } from "@/lib/trip-invite-url"

export type TripMember = {
  userId: string
  displayName: string
  avatarUrl: string | null
  emailMasked: string
  isOwner: boolean
  createdAt: string
}

export type TripInviteRow = {
  id: string
  email: string
  createdAt: string
  expiresAt: string
}

export type SharePeer = {
  userId: string
  displayName: string
  avatarUrl: string | null
  emailMasked: string
  alreadyInTrip?: boolean
}

function mapMember(r: Record<string, unknown>): TripMember {
  return {
    userId: String(r.user_id),
    displayName: String(r.display_name ?? "Viajero"),
    avatarUrl: (r.avatar_url as string | null) ?? null,
    emailMasked: String(r.email_masked ?? ""),
    isOwner: Boolean(r.is_owner),
    createdAt: String(r.created_at ?? ""),
  }
}

export function useTripMembers(tripId: string | null, opts?: { isOwner?: boolean }) {
  const isOwner = opts?.isOwner ?? false
  const [members, setMembers] = useState<TripMember[]>([])
  const [invites, setInvites] = useState<TripInviteRow[]>([])
  const [peers, setPeers] = useState<SharePeer[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!tripId || !isSupabaseConfigured()) return
    setLoading(true)
    const supabase = createClient()
    const [m, i, p] = await Promise.all([
      supabase.rpc("list_trip_members", { p_trip_id: tripId }),
      isOwner
        ? supabase.rpc("list_trip_invites", { p_trip_id: tripId })
        : Promise.resolve({ data: [] as unknown[] }),
      supabase.rpc("list_share_peers", { p_trip_id: tripId }),
    ])
    if (Array.isArray(m.data)) setMembers(m.data.map((row) => mapMember(row as Record<string, unknown>)))
    if (Array.isArray(i.data)) {
      setInvites(
        i.data.map((row) => {
          const r = row as Record<string, unknown>
          return {
            id: String(r.id),
            email: String(r.email ?? ""),
            createdAt: String(r.created_at ?? ""),
            expiresAt: String(r.expires_at ?? ""),
          }
        }),
      )
    } else {
      setInvites([])
    }
    if (Array.isArray(p.data)) {
      setPeers(
        p.data
          .map((row) => {
            const r = row as Record<string, unknown>
            return {
              userId: String(r.user_id),
              displayName: String(r.display_name ?? "Viajero"),
              avatarUrl: (r.avatar_url as string | null) ?? null,
              emailMasked: String(r.email_masked ?? ""),
              alreadyInTrip: Boolean(r.already_in_trip),
            }
          })
          .filter((peer) => !peer.alreadyInTrip),
      )
    }
    setLoading(false)
  }, [tripId, isOwner])

  useEffect(() => {
    void reload()
  }, [reload])

  return { members, invites, peers, loading, reload }
}

export function useMyTripInvites() {
  const [invites, setInvites] = useState<
    { inviteId: string; tripId: string; tripName: string; tripCover: string | null; inviterName: string }[]
  >([])

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    const { data } = await supabase.rpc("list_my_trip_invites")
    if (!Array.isArray(data)) {
      setInvites([])
      return
    }
    setInvites(
      data.map((row) => {
        const r = row as Record<string, unknown>
        return {
          inviteId: String(r.invite_id),
          tripId: String(r.trip_id),
          tripName: String(r.trip_name ?? "Viaje"),
          tripCover: (r.trip_cover as string | null) ?? null,
          inviterName: inviterLabel(typeof r.inviter_name === "string" ? r.inviter_name : ""),
        }
      }),
    )
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { invites, reload }
}

/** Ocupantes de todos los viajes del usuario (avatares en Inicio). */
export function useMyTripOccupants() {
  const [byTripId, setByTripId] = useState<Record<string, TripMember[]>>({})

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setByTripId({})
      return
    }
    const supabase = createClient()
    const { data, error } = await supabase.rpc("list_my_trip_occupants")
    if (error || !Array.isArray(data)) {
      setByTripId({})
      return
    }
    const next: Record<string, TripMember[]> = {}
    for (const row of data) {
      const r = row as Record<string, unknown>
      const tripId = String(r.trip_id ?? "")
      if (!tripId) continue
      if (!next[tripId]) next[tripId] = []
      next[tripId].push({
        userId: String(r.user_id),
        displayName: String(r.display_name ?? "Viajero"),
        avatarUrl: (r.avatar_url as string | null) ?? null,
        emailMasked: "",
        isOwner: Boolean(r.is_owner),
        createdAt: "",
      })
    }
    setByTripId(next)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { byTripId, reload }
}
