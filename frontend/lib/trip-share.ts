/** Utilidades puras de compartir viaje: email, tope, peers. */

export const TRIP_SHARE_CAP = 8

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isLikelyEmail(raw: string): boolean {
  return EMAIL_RE.test(normalizeEmail(raw))
}

export function canInviteToTrip(opts: {
  isOwner: boolean
  isGuest: boolean
  occupancy: number
}): boolean {
  return opts.isOwner && !opts.isGuest && opts.occupancy < TRIP_SHARE_CAP
}

export type SharePeer = {
  userId: string
  displayName: string
  avatarUrl: string | null
  emailMasked: string
  alreadyInTrip?: boolean
}

export function filterAvailablePeers(
  peers: SharePeer[],
  presentUserIds: Set<string>,
): SharePeer[] {
  return peers.filter((p) => !presentUserIds.has(p.userId) && !p.alreadyInTrip)
}

export function occupancyOf(opts: {
  memberCount: number
  pendingInviteCount: number
}): number {
  return opts.memberCount + opts.pendingInviteCount
}
