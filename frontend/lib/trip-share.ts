/** Utilidades puras de compartir viaje: email, tope, peers. */

export const TRIP_SHARE_CAP = 8

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isLikelyEmail(raw: string): boolean {
  return EMAIL_RE.test(normalizeEmail(raw))
}

/** `ana@gmail.com` → `ana•••@gmail.com`. Local corto: primera letra + •••. */
export function maskEmail(raw: string | null | undefined): string {
  const email = normalizeEmail(raw ?? "")
  const at = email.indexOf("@")
  if (at < 1) return email || ""
  const local = email.slice(0, at)
  const domain = email.slice(at)
  const keep = local.length <= 3 ? 1 : 3
  return `${local.slice(0, keep)}•••${domain}`
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
}

export function filterAvailablePeers(
  peers: SharePeer[],
  presentUserIds: Set<string>,
  pendingEmails: Set<string>,
): SharePeer[] {
  return peers.filter((p) => {
    if (presentUserIds.has(p.userId)) return false
    const email = normalizeEmail(p.emailMasked)
    if (email && pendingEmails.has(email)) return false
    return true
  })
}

export function occupancyOf(opts: {
  memberCount: number
  pendingInviteCount: number
}): number {
  return opts.memberCount + opts.pendingInviteCount
}
