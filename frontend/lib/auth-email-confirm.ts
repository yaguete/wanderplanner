import { safeNext } from "@/lib/auth-next"

/**
 * Recorte de `EmailOtpType` que el producto acepta en `/auth/confirm`.
 * Fuera: `magiclink` (sería entrar sin contraseña), `invite` (no existe) y
 * `email` (docs de Supabase; aquí las plantillas mandan el type concreto).
 */
export const EMAIL_CONFIRM_TYPES = ["signup", "email_change", "recovery"] as const
export type EmailConfirmType = (typeof EMAIL_CONFIRM_TYPES)[number]

const ALLOWED = new Set<string>(EMAIL_CONFIRM_TYPES)

export function parseEmailConfirmType(
  raw: string | null | undefined,
): EmailConfirmType | null {
  if (!raw || !ALLOWED.has(raw)) return null
  return raw as EmailConfirmType
}

/**
 * Destino post-verify. `safeNext` rechaza open-redirects.
 * `recovery` sin `next` cae en `/reset-password`, no en `/trips`: si no, la
 * sesión de recuperación aterriza en el listado y `/reset-password` dice
 * que el enlace caducó.
 */
export function emailConfirmNext(
  type: EmailConfirmType,
  rawNext: string | null | undefined,
): string {
  const fallback = type === "recovery" ? "/reset-password" : "/trips"
  return safeNext(rawNext, fallback)
}

export function emailConfirmIsRecovery(
  type: EmailConfirmType | null,
  next: string,
): boolean {
  return type === "recovery" || next === "/reset-password"
}
