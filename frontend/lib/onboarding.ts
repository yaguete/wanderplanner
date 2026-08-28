/**
 * Onboarding de primer impacto: cuándo autoabrir, cómo persistir y el handoff.
 *
 * Storages inyectados para testear sin `window`. Reloj inyectado para el TTL.
 *
 * Invitado: `sessionStorage` (esta pestaña) + sello corto en `localStorage`
 * (45 min, anti-multipestaña). Registrado: `localStorage` por `userId` y
 * `profiles.onboarding_seen_at` (una vez en la vida de la cuenta). Hasta que
 * el perfil responde, no autoabre: el problema era repetirlo en incógnito.
 */

export const ONBOARDING_SESSION_KEY = "wp-onboarding-session"
export const ONBOARDING_RECENT_KEY = "wp-onboarding-recent"
export const ONBOARDING_SEEN_PREFIX = "wp-onboarding-seen"
export const ONBOARDING_OUTCOME_KEY = "wp-onboarding-outcome"
/** Anti-multipestaña para invitados: una visita, no una pestaña. */
export const ONBOARDING_RECENT_TTL_MS = 45 * 60 * 1000

export const ONBOARDING_OPEN_EVENT = "wp-onboarding-open"
export const ADD_SOURCE_OPEN_EVENT = "wp-add-source-open"
export const REVEAL_SOURCES_EVENT = "wp-reveal-sources"

export type RevealSourcesDetail = {
  /** Pestaña del panel Fuentes; sin `tab` solo revela el panel. */
  tab?: "itinerary"
}

export type OnboardingRoute = "trip-detail" | "other"
export type OnboardingTrigger = "auto" | "replay"
export type OnboardingOutcome = "completed" | "skipped" | "dismissed"
export type OnboardingFunnelOutcome = "completed" | "skipped" | "unseen"
export type OnboardingCtaAction = "add_source" | "view_extraction" | "view_trip"
export type OnboardingMode = "guest" | "user"

export type StorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export type ShouldAutoShowInput = {
  route: OnboardingRoute
  authLoading: boolean
  isGuest: boolean
  userId: string | null | undefined
  gateOpen: boolean
  now: number
  session: StorageLike
  local: StorageLike
  /**
   * Cuenta registrada: `false` = el perfil confirma que nunca lo vio;
   * `true` / `null` / omitido = no autoabrir (ya visto, o aún no sabemos).
   * Los invitados lo ignoran.
   */
  profileSeen?: boolean | null
}

export type MarkOnboardingSeenInput = {
  isGuest: boolean
  userId: string | null | undefined
  trigger: OnboardingTrigger
  outcome: OnboardingOutcome
  now: number
  session: StorageLike
  local: StorageLike
}

function safeGet(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value)
  } catch {
    /* Safari privado / cuota */
  }
}

export function onboardingSeenKey(userId: string): string {
  return `${ONBOARDING_SEEN_PREFIX}:${userId}`
}

export { isTripDetailPath } from "./trip-paths"

export function parseRecentStamp(raw: string | null, now: number): number | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== "object") return null
    const at = (data as { at?: unknown }).at
    if (typeof at !== "number" || !Number.isFinite(at)) return null
    if (at > now + 60_000) return null
    if (now - at > ONBOARDING_RECENT_TTL_MS) return null
    return at
  } catch {
    return null
  }
}

function sessionState(session: StorageLike): "open" | "done" | null {
  const raw = safeGet(session, ONBOARDING_SESSION_KEY)
  if (raw === "open" || raw === "1") return "open"
  if (raw === "done") return "done"
  return null
}

function guestRecentlySeen(local: StorageLike, now: number): boolean {
  return parseRecentStamp(safeGet(local, ONBOARDING_RECENT_KEY), now) != null
}

function userAlreadySeen(local: StorageLike, userId: string): boolean {
  return safeGet(local, onboardingSeenKey(userId)) === "1"
}

export function shouldAutoShow(input: ShouldAutoShowInput): boolean {
  if (input.authLoading) return false
  if (input.gateOpen) return false
  if (input.route !== "trip-detail") return false

  const tab = sessionState(input.session)
  // Esta pestaña ya lo tiene en pantalla (p. ej. remount de Strict Mode).
  if (tab === "open") return true
  if (tab === "done") return false

  if (input.isGuest) {
    if (guestRecentlySeen(input.local, input.now)) return false
    return true
  }

  const userId = (input.userId ?? "").trim()
  if (!userId) return false
  if (userAlreadySeen(input.local, userId)) return false
  // Sin confirmación del perfil no abrimos: otro navegador no debe repetirlo.
  if (input.profileSeen !== false) return false
  return true
}

function writeSessionClaim(session: StorageLike, state: "open" | "done"): void {
  safeSet(session, ONBOARDING_SESSION_KEY, state)
}

function writeRecentStamp(local: StorageLike, now: number): void {
  safeSet(local, ONBOARDING_RECENT_KEY, JSON.stringify({ at: now }))
}

function writeUserSeen(local: StorageLike, userId: string): void {
  safeSet(local, onboardingSeenKey(userId), "1")
}

export function hasLocalUserOnboardingSeen(local: StorageLike, userId: string): boolean {
  const id = userId.trim()
  return id ? userAlreadySeen(local, id) : false
}

export function persistLocalUserOnboardingSeen(local: StorageLike, userId: string): void {
  const id = userId.trim()
  if (id) writeUserSeen(local, id)
}

function writeOutcome(session: StorageLike, outcome: OnboardingOutcome): void {
  safeSet(session, ONBOARDING_OUTCOME_KEY, outcome)
}

/**
 * Persiste el cierre. El auto-show ya reclamó la pestaña / el sello;
 * aquí se escribe el resultado y, en cuenta, la marca permanente.
 *
 * Replay de invitado: no toca `localStorage` (la próxima visita sigue
 * autoabriendo). Sí marca la pestaña para no repetir el modal al ir al viaje.
 */
export function markOnboardingSeen(input: MarkOnboardingSeenInput): void {
  writeSessionClaim(input.session, "done")
  writeOutcome(input.session, input.outcome)

  if (input.trigger === "replay" && input.isGuest) return

  if (input.isGuest) {
    if (input.trigger === "auto") writeRecentStamp(input.local, input.now)
    return
  }

  const userId = (input.userId ?? "").trim()
  if (userId) writeUserSeen(input.local, userId)
}

/**
 * Al autoabrir: reclama pestaña + sello (invitado) o marca local de cuenta
 * (registrado) *antes* de pintar, para que la pestaña de al lado no abra otro.
 * La marca durable (`profiles.onboarding_seen_at`) la escribe el provider.
 */
export function claimAutoShow(input: ShouldAutoShowInput): boolean {
  if (!shouldAutoShow(input)) return false
  writeSessionClaim(input.session, "open")
  if (input.isGuest) {
    writeRecentStamp(input.local, input.now)
  } else {
    const userId = (input.userId ?? "").trim()
    if (userId) writeUserSeen(input.local, userId)
  }
  return true
}

/** Tras `upgradeGuest`: si esta pestaña ya vio el onboarding, no repetirlo. */
export function promoteGuestOnboarding(input: {
  userId: string | null | undefined
  session: StorageLike
  local: StorageLike
}): void {
  const userId = (input.userId ?? "").trim()
  if (!userId) return
  if (sessionState(input.session) == null) return
  writeUserSeen(input.local, userId)
}

export function funnelOutcomeFrom(raw: string | null): OnboardingFunnelOutcome {
  if (raw === "completed") return "completed"
  if (raw === "skipped" || raw === "dismissed") return "skipped"
  return "unseen"
}

export function readOnboardingFunnelOutcome(session?: StorageLike): OnboardingFunnelOutcome {
  const store =
    session ?? (typeof window !== "undefined" ? window.sessionStorage : null)
  if (!store) return "unseen"
  return funnelOutcomeFrom(safeGet(store, ONBOARDING_OUTCOME_KEY))
}

export function onboardingCta(input: {
  sourceCount: number
  loadingPendingCount: number
}): OnboardingCtaAction {
  if (input.sourceCount <= 0 && input.loadingPendingCount <= 0) return "add_source"
  if (input.loadingPendingCount > 0) return "view_extraction"
  return "view_trip"
}

export function openOnboarding(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(ONBOARDING_OPEN_EVENT))
}

export function openAddSourceFromOnboarding(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(ADD_SOURCE_OPEN_EVENT))
}

export function revealSourcesFromOnboarding(detail?: RevealSourcesDetail): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(REVEAL_SOURCES_EVENT, { detail }))
}

/** Fuentes → pestaña Ruta (CTA cuando ya hay fuente extraída). */
export function focusSourceRutaFromOnboarding(): void {
  revealSourcesFromOnboarding({ tab: "itinerary" })
}
