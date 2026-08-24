import { authHeaders } from "@/lib/api-auth"
import { AUTH_EMAIL_EXISTS } from "@/lib/auth-errors"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export type InviteLookup = {
  status: "valid" | "expired" | "unknown"
  tripName?: string
  inviterName?: string
  email?: string
  hasAccount?: boolean
}

export async function sendTripInvite(
  tripId: string,
  body: { email?: string; userId?: string },
): Promise<{ status: string; emailSent?: boolean }> {
  const headers = await authHeaders()
  const r = await fetch(`${API_BASE}/trips/${tripId}/invites`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body.email ? { email: body.email } : { userId: body.userId }),
  })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) {
    const detail = typeof json.detail === "string" ? json.detail : "No se pudo enviar la invitación"
    throw new Error(detail)
  }
  return json as { status: string; emailSent?: boolean }
}

export async function lookupInvite(token: string): Promise<InviteLookup> {
  const r = await fetch(`${API_BASE}/invites/${encodeURIComponent(token)}`)
  if (!r.ok) return { status: "unknown" }
  return (await r.json()) as InviteLookup
}

export async function confirmInviteSignup(token: string, userId: string): Promise<void> {
  const r = await fetch(`${API_BASE}/invites/${encodeURIComponent(token)}/confirm-signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  })
  if (!r.ok && r.status !== 403) {
    throw new Error("No se pudo confirmar el alta")
  }
}

export async function completeInviteSignup(
  token: string,
  body: { password: string; displayName: string },
): Promise<{ ok: true; status: string } | { ok: false; exists: boolean; error: string }> {
  const headers = await authHeaders()
  const r = await fetch(`${API_BASE}/invites/${encodeURIComponent(token)}/complete-signup`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ password: body.password, displayName: body.displayName }),
  })
  const json = (await r.json().catch(() => ({}))) as { status?: string; detail?: unknown }
  if (r.status === 409) {
    return { ok: false, exists: true, error: AUTH_EMAIL_EXISTS }
  }
  if (!r.ok) {
    const detail = typeof json.detail === "string" ? json.detail : "No se pudo crear la cuenta"
    return { ok: false, exists: false, error: detail }
  }
  return { ok: true, status: String(json.status ?? "created") }
}
