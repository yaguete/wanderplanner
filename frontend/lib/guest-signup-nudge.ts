/**
 * Temporizador del banner de registro para invitados (motivo `home`).
 *
 * La primera vez: 3 minutos desde que entra al shell. Las siguientes, 5 minutos
 * desde que cierra el auto-aviso. Invitar, añadir fuente, ir a inicio, etc. no
 * pasan por aquí: `requireAccount(reason)` sigue abriendo al momento.
 */

export const GUEST_SIGNUP_NUDGE_FIRST_MS = 3 * 60 * 1000
export const GUEST_SIGNUP_NUDGE_REPEAT_MS = 5 * 60 * 1000

export function guestSignupNudgeDelay(input: {
  now: number
  sessionStartedAt: number
  autoNudgeCount: number
}): number {
  if (input.autoNudgeCount > 0) return GUEST_SIGNUP_NUDGE_REPEAT_MS
  const elapsed = Math.max(0, input.now - input.sessionStartedAt)
  return Math.max(0, GUEST_SIGNUP_NUDGE_FIRST_MS - elapsed)
}
