import assert from "node:assert/strict"
import {
  ONBOARDING_OUTCOME_KEY,
  ONBOARDING_RECENT_KEY,
  ONBOARDING_RECENT_TTL_MS,
  ONBOARDING_SESSION_KEY,
  claimAutoShow,
  funnelOutcomeFrom,
  hasLocalUserOnboardingSeen,
  isTripDetailPath,
  markOnboardingSeen,
  onboardingCta,
  onboardingSeenKey,
  parseRecentStamp,
  persistLocalUserOnboardingSeen,
  promoteGuestOnboarding,
  readOnboardingFunnelOutcome,
  shouldAutoShow,
  type StorageLike,
} from "./onboarding"
import { tripIdFromPath } from "./trip-paths"

const NOW = Date.parse("2026-08-21T12:00:00Z")
const USER = "user-abc"

function memoryStorage(): StorageLike & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v)
    },
  }
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error("private")
    },
    setItem: () => {
      throw new Error("private")
    },
  }
}

function guestInput(
  overrides: Partial<Parameters<typeof shouldAutoShow>[0]> & {
    session?: StorageLike
    local?: StorageLike
  } = {},
) {
  return {
    route: "trip-detail" as const,
    authLoading: false,
    isGuest: true,
    userId: "anon-1",
    gateOpen: false,
    now: NOW,
    session: memoryStorage(),
    local: memoryStorage(),
    ...overrides,
  }
}

function userInput(
  overrides: Partial<Parameters<typeof shouldAutoShow>[0]> & {
    session?: StorageLike
    local?: StorageLike
  } = {},
) {
  return {
    route: "trip-detail" as const,
    authLoading: false,
    isGuest: false,
    userId: USER,
    gateOpen: false,
    now: NOW,
    session: memoryStorage(),
    local: memoryStorage(),
    profileSeen: false,
    ...overrides,
  }
}

assert.equal(isTripDetailPath("/trips/abc"), true)
assert.equal(isTripDetailPath("/trips/abc/"), true)
assert.equal(isTripDetailPath("/trips"), false)
assert.equal(isTripDetailPath("/trips/"), false)
assert.equal(isTripDetailPath("/account"), false)
assert.equal(isTripDetailPath("/trips/abc/edit"), false)
assert.equal(isTripDetailPath(null), false)
assert.equal(tripIdFromPath("/trips/abc"), "abc")
assert.equal(tripIdFromPath("/trips/abc/"), "abc")
assert.equal(tripIdFromPath("/trips"), null)
assert.equal(tripIdFromPath("/account"), null)

{
  // 1. Invitado, pestaña limpia, sin sello reciente → abre.
  const input = guestInput()
  assert.equal(shouldAutoShow(input), true)
  assert.equal(claimAutoShow(input), true)
  assert.equal(input.session.getItem(ONBOARDING_SESSION_KEY), "open")
  assert.ok(parseRecentStamp(input.local.getItem(ONBOARDING_RECENT_KEY), NOW))
  // Remount de la misma pestaña (Strict Mode): sigue debiendo abrir.
  assert.equal(shouldAutoShow(input), true)
}

{
  // 2. Invitado, segunda pestaña dentro de los 45 min → no abre.
  const local = memoryStorage()
  local.setItem(ONBOARDING_RECENT_KEY, JSON.stringify({ at: NOW - 10 * 60 * 1000 }))
  const secondTab = guestInput({ session: memoryStorage(), local })
  assert.equal(shouldAutoShow(secondTab), false)
}

{
  // 3. Invitado, sello caducado (46 min) → abre.
  const local = memoryStorage()
  local.setItem(
    ONBOARDING_RECENT_KEY,
    JSON.stringify({ at: NOW - ONBOARDING_RECENT_TTL_MS - 60_000 }),
  )
  assert.equal(shouldAutoShow(guestInput({ local })), true)
}

{
  // 4. Registrado sin marca local ni de perfil → abre; con marca → no.
  const clean = userInput()
  assert.equal(shouldAutoShow(clean), true)
  const seen = memoryStorage()
  seen.setItem(onboardingSeenKey(USER), "1")
  assert.equal(shouldAutoShow(userInput({ local: seen })), false)

  // Tras reclamar, un remount de la pestaña sigue abriendo.
  const claimed = userInput()
  assert.equal(claimAutoShow(claimed), true)
  assert.equal(shouldAutoShow(claimed), true)
  markOnboardingSeen({
    isGuest: false,
    userId: USER,
    trigger: "auto",
    outcome: "completed",
    now: NOW,
    session: claimed.session,
    local: claimed.local,
  })
  assert.equal(shouldAutoShow({ ...claimed, session: memoryStorage() }), false)
}

{
  // 4b. Registrado: sin respuesta del perfil (otro navegador / incógnito) → no abre.
  assert.equal(shouldAutoShow(userInput({ profileSeen: null })), false)
  assert.equal(shouldAutoShow(userInput({ profileSeen: undefined })), false)
  assert.equal(shouldAutoShow(userInput({ profileSeen: true })), false)
  assert.equal(shouldAutoShow(userInput({ profileSeen: false })), true)
}

{
  // 4c. Invitado ignora la marca de perfil (esa columna es de cuenta registrada).
  assert.equal(shouldAutoShow(guestInput({ profileSeen: true })), true)
}

{
  // 5. authLoading → nunca abre.
  assert.equal(shouldAutoShow(guestInput({ authLoading: true })), false)
  assert.equal(shouldAutoShow(userInput({ authLoading: true })), false)
}

{
  // 6. RegistrationGate abierto → nunca abre.
  assert.equal(shouldAutoShow(guestInput({ gateOpen: true })), false)
}

{
  // 7. Ruta distinta de trip-detail → nunca auto-abre.
  assert.equal(shouldAutoShow(guestInput({ route: "other" })), false)
  assert.equal(shouldAutoShow(userInput({ route: "other" })), false)
}

{
  // 8. Invitado que completa y luego hace upgrade → marca copiada a localStorage.
  const session = memoryStorage()
  const local = memoryStorage()
  markOnboardingSeen({
    isGuest: true,
    userId: USER,
    trigger: "auto",
    outcome: "completed",
    now: NOW,
    session,
    local,
  })
  assert.equal(local.getItem(onboardingSeenKey(USER)), null)
  promoteGuestOnboarding({ userId: USER, session, local })
  assert.equal(local.getItem(onboardingSeenKey(USER)), "1")
  assert.equal(
    shouldAutoShow(
      userInput({ session: memoryStorage(), local, userId: USER }),
    ),
    false,
  )
}

{
  // 9. Replay de invitado cerrado → no escribe localStorage.
  const session = memoryStorage()
  const local = memoryStorage()
  markOnboardingSeen({
    isGuest: true,
    userId: "anon-1",
    trigger: "replay",
    outcome: "completed",
    now: NOW,
    session,
    local,
  })
  assert.equal(session.getItem(ONBOARDING_SESSION_KEY), "done")
  assert.equal(local.getItem(ONBOARDING_RECENT_KEY), null)
  assert.equal(local.store.size, 0)
}

{
  // 10. localStorage que lanza → no revienta, decide abrir.
  assert.equal(
    shouldAutoShow(guestInput({ local: throwingStorage() })),
    true,
  )
  assert.equal(
    shouldAutoShow(userInput({ local: throwingStorage() })),
    true,
  )
  assert.doesNotThrow(() =>
    markOnboardingSeen({
      isGuest: true,
      userId: "anon-1",
      trigger: "auto",
      outcome: "skipped",
      now: NOW,
      session: throwingStorage(),
      local: throwingStorage(),
    }),
  )
}

assert.equal(onboardingCta({ sourceCount: 0, loadingPendingCount: 0 }), "add_source")
assert.equal(onboardingCta({ sourceCount: 0, loadingPendingCount: 1 }), "view_extraction")
assert.equal(onboardingCta({ sourceCount: 1, loadingPendingCount: 1 }), "view_extraction")
assert.equal(onboardingCta({ sourceCount: 1, loadingPendingCount: 0 }), "view_trip")

// Invitado / primer viaje: el último clic lleva al asistente, que es donde ya
// ha aterrizado. Sin fuente ninguna sigue mandando pegar un artículo.
assert.equal(
  onboardingCta({ sourceCount: 1, loadingPendingCount: 0, assistantFirst: true }),
  "open_assistant",
)
assert.equal(
  onboardingCta({ sourceCount: 0, loadingPendingCount: 1, assistantFirst: true }),
  "open_assistant",
)
assert.equal(
  onboardingCta({ sourceCount: 0, loadingPendingCount: 0, assistantFirst: true }),
  "add_source",
)

assert.equal(funnelOutcomeFrom("completed"), "completed")
assert.equal(funnelOutcomeFrom("skipped"), "skipped")
assert.equal(funnelOutcomeFrom("dismissed"), "skipped")
assert.equal(funnelOutcomeFrom(null), "unseen")
assert.equal(funnelOutcomeFrom("nope"), "unseen")

{
  const session = memoryStorage()
  assert.equal(readOnboardingFunnelOutcome(session), "unseen")
  session.setItem(ONBOARDING_OUTCOME_KEY, "completed")
  assert.equal(readOnboardingFunnelOutcome(session), "completed")
}

{
  const local = memoryStorage()
  assert.equal(hasLocalUserOnboardingSeen(local, USER), false)
  persistLocalUserOnboardingSeen(local, USER)
  assert.equal(hasLocalUserOnboardingSeen(local, USER), true)
  assert.equal(local.getItem(onboardingSeenKey(USER)), "1")
}

assert.equal(parseRecentStamp(null, NOW), null)
assert.equal(parseRecentStamp("{", NOW), null)
assert.equal(parseRecentStamp(JSON.stringify({ at: NOW + 120_000 }), NOW), null)

console.log("onboarding: ok")
