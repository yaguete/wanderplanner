/**
 * Validación pura de Configuración de cuenta: confirmación de borrado y
 * cambio de contraseña. Sin I/O; la página y el test leen de aquí.
 */
import type { User } from "@supabase/supabase-js"
import type { TravelerProfile } from "@/lib/db/profile-repo"
import { displayNameFor } from "@/lib/user-display"

export const MIN_PASSWORD_LENGTH = 6

/** Lo que `displayNameFor` enseña cuando no hay nombre ni email. */
const FALLBACK_ACCOUNT_LABEL = "Tu cuenta"

function normalizeConfirmation(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es")
}

/**
 * Match tolerante (NFC, espacios, mayúsculas) pero no laxo: los acentos
 * cuentan. Cadena vacía nunca confirma.
 */
export function matchesAccountConfirmation(typed: string, expected: string): boolean {
  const a = normalizeConfirmation(typed)
  const b = normalizeConfirmation(expected)
  if (!a || !b) return false
  return a === b
}

/**
 * Texto que hay que escribir para borrar la cuenta: el mismo que ve el
 * usuario en el menú. Si `displayNameFor` cae al genérico «Tu cuenta»,
 * usamos la parte local del email para no pedir algo que no está en pantalla.
 */
export function confirmationNameFor(
  user: User | null,
  profile: TravelerProfile | null,
): string {
  const shown = displayNameFor(user, profile)
  if (shown !== FALLBACK_ACCOUNT_LABEL) return shown
  const local = user?.email?.trim().split("@")[0]
  return local || shown
}

export function validatePasswordChange(input: {
  current: string
  next: string
  repeat: string
  requiresCurrent: boolean
}): string | null {
  if (input.requiresCurrent && input.current.length === 0) {
    return "Escribe tu contraseña actual."
  }
  if (input.next.length < MIN_PASSWORD_LENGTH) {
    return "La nueva contraseña debe tener al menos 6 caracteres."
  }
  if (input.next !== input.repeat) {
    return "Las contraseñas nuevas no coinciden."
  }
  if (input.requiresCurrent && input.next === input.current) {
    return "La nueva contraseña no puede ser igual a la actual."
  }
  return null
}
