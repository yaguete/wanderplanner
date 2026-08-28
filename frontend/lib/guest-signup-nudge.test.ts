import assert from "node:assert/strict"
import {
  GUEST_SIGNUP_NUDGE_FIRST_MS,
  GUEST_SIGNUP_NUDGE_REPEAT_MS,
  guestSignupNudgeDelay,
} from "./guest-signup-nudge"

const START = Date.parse("2026-08-28T18:00:00Z")

assert.equal(
  guestSignupNudgeDelay({ now: START, sessionStartedAt: START, autoNudgeCount: 0 }),
  GUEST_SIGNUP_NUDGE_FIRST_MS,
)

assert.equal(
  guestSignupNudgeDelay({
    now: START + 2 * 60 * 1000,
    sessionStartedAt: START,
    autoNudgeCount: 0,
  }),
  60 * 1000,
)

assert.equal(
  guestSignupNudgeDelay({
    now: START + GUEST_SIGNUP_NUDGE_FIRST_MS,
    sessionStartedAt: START,
    autoNudgeCount: 0,
  }),
  0,
)

assert.equal(
  guestSignupNudgeDelay({
    now: START + GUEST_SIGNUP_NUDGE_FIRST_MS + 90_000,
    sessionStartedAt: START,
    autoNudgeCount: 0,
  }),
  0,
)

assert.equal(
  guestSignupNudgeDelay({
    now: START + 30_000,
    sessionStartedAt: START,
    autoNudgeCount: 1,
  }),
  GUEST_SIGNUP_NUDGE_REPEAT_MS,
)

assert.equal(
  guestSignupNudgeDelay({
    now: START + 10 * 60 * 1000,
    sessionStartedAt: START,
    autoNudgeCount: 4,
  }),
  GUEST_SIGNUP_NUDGE_REPEAT_MS,
)

console.log("guest-signup-nudge: ok")
