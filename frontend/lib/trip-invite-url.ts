/** Construcción del enlace público `/invite/{token}`. Puro. */

export function invitePath(token: string): string {
  const t = token.trim()
  if (!t) return "/invite"
  return `/invite/${encodeURIComponent(t)}`
}

export function inviteUrl(origin: string, token: string): string {
  const base = origin.replace(/\/+$/, "")
  return `${base}${invitePath(token)}`
}

/** Login que vuelve a la invitación. Quien ya tiene cuenta no debe ir al alta. */
export function inviteLoginPath(token: string): string {
  return `/login?next=${encodeURIComponent(invitePath(token))}`
}

/** `next` seguro tras aceptar: solo rutas internas de viaje. */
export function tripPathAfterAccept(tripId: string): string {
  const id = tripId.trim()
  if (!id || id.includes("/") || id.includes("..")) return "/trips"
  return `/trips/${id}`
}

/** Extrae el viaje de la respuesta de `accept_trip_invite`. */
export function tripIdFromAcceptPayload(data: unknown): string {
  if (!data || typeof data !== "object") return ""
  const tripId = "trip_id" in data ? String((data as { trip_id: unknown }).trip_id ?? "") : ""
  return tripId.trim()
}

/** `expired` / `gone` / `unknown` no deben navegar. */
export function acceptStatusFromPayload(data: unknown): string {
  if (!data || typeof data !== "object") return ""
  const status = "status" in data ? (data as { status: unknown }).status : ""
  return typeof status === "string" ? status : ""
}

export function isFailedAcceptStatus(status: string): boolean {
  return status === "expired" || status === "gone" || status === "unknown"
}

export const ANON_INVITER = "Una persona"

/** Nombre a mostrar del que invita: nunca el local-part del email. */
export function inviterLabel(name: string | null | undefined): string {
  const t = (name ?? "").trim()
  return t || ANON_INVITER
}
