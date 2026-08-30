/**
 * Grants OAuth del usuario (asistentes conectados). El SDK anida el cliente:
 * `grant.client.id` / `grant.client.name`. `revokeGrant` recibe `{ clientId }`.
 */
import { formatLegalDate } from "@/lib/legal"

export type ConnectedGrant = {
  clientId: string
  clientName: string
  grantedAt: string
  scopes: readonly string[]
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

export function parseOAuthGrant(raw: unknown): ConnectedGrant | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const client = asRecord(rec.client)
  if (!client) return null
  const clientId = typeof client.id === "string" ? client.id.trim() : ""
  if (!clientId) return null
  const name = typeof client.name === "string" ? client.name.trim() : ""
  const grantedAt = typeof rec.granted_at === "string" ? rec.granted_at : ""
  const scopes = Array.isArray(rec.scopes)
    ? rec.scopes.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : []
  return {
    clientId,
    clientName: name || "Una aplicación",
    grantedAt,
    scopes,
  }
}

export function parseOAuthGrantList(raw: unknown): ConnectedGrant[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((row) => {
    const grant = parseOAuthGrant(row)
    return grant ? [grant] : []
  })
}

/** `2026-01-15T10:30:00.000Z` → `15 de enero de 2026`. Vacío si no hay día. */
export function formatGrantDate(iso: string): string {
  const day = iso.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ""
  return formatLegalDate(day)
}
