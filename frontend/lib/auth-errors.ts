/**
 * Copy en español para errores de GoTrue / supabase-js.
 * `updateUser` con un email inválido a veces llega con `message: "{}"`.
 */

export const AUTH_ERROR_FALLBACK = "Algo ha fallado. Inténtalo de nuevo."
export const AUTH_EMAIL_EXISTS = "Ya hay una cuenta con este email. Entra o usa otro."

function asText(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value instanceof Error) return asText(value.message)
  try {
    const dumped = JSON.stringify(value)
    return dumped === "{}" || dumped === "[]" ? "{}" : dumped
  } catch {
    return ""
  }
}

function isBlankMessage(msg: string): boolean {
  return !msg || msg === "{}" || msg === "[object Object]"
}

export function authErrorMessage(error: unknown): string {
  const rec = error && typeof error === "object" ? (error as Record<string, unknown>) : null
  const code = typeof rec?.code === "string" ? rec.code : ""
  const message = asText(
    rec?.message ?? rec?.msg ?? rec?.error_description ?? (typeof error === "string" ? error : ""),
  )
  const blob = `${code} ${message}`.toLowerCase()

  if (
    code === "email_exists" ||
    code === "user_already_exists" ||
    code === "identity_already_exists" ||
    /already been registered|already registered|user already exists/.test(blob)
  ) {
    return AUTH_EMAIL_EXISTS
  }

  if (
    code === "email_address_invalid" ||
    /unable to validate email|invalid.*(e-?mail|format)|e-?mail.*invalid/.test(blob)
  ) {
    return "El email no es válido."
  }
  // Cuerpo vacío de GoTrue al rechazar el email en `updateUser`.
  if (message === "{}" || (code === "validation_failed" && isBlankMessage(message))) {
    return "El email no es válido."
  }

  if (code === "invalid_credentials" || /invalid login credentials/.test(blob)) {
    return "Email o contraseña incorrectos."
  }
  if (code === "email_not_confirmed" || /email not confirmed/.test(blob)) {
    return "Confirma el email antes de entrar."
  }
  if (code === "weak_password" || /password should be at least|password is too weak/.test(blob)) {
    return "La contraseña debe tener al menos 6 caracteres."
  }
  // Tope de 60 s entre recuperaciones al mismo email (GoTrue 429).
  if (
    code === "over_request_rate_limit" ||
    /for security purposes|only request this after|60 seconds/.test(blob)
  ) {
    return "Espera un minuto antes de pedir otro."
  }
  if (code === "over_email_send_rate_limit" || /rate limit/.test(blob)) {
    return "Hemos enviado demasiados correos. Espera un momento."
  }
  if (/captcha/i.test(blob)) {
    return "Confirma que no eres un robot."
  }

  if (isBlankMessage(message)) return AUTH_ERROR_FALLBACK
  return message
}

/**
 * GoTrue, con confirmación de email o anti-enumeración, no devuelve error si el
 * correo ya existe: responde 200 con un user sin `identities` y sin sesión.
 * Tratarlo como alta real manda al usuario a `/trips` y el middleware al login.
 */
export function isDuplicateSignUp(data: {
  user?: { identities?: unknown[] | null } | null
  session?: unknown
}): boolean {
  if (data.session) return false
  const identities = data.user?.identities
  return Array.isArray(identities) && identities.length === 0
}
