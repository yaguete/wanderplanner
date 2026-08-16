import assert from "node:assert/strict"
import {
  GUEST_CLAIM_TTL_MS,
  isStashUsable,
  parseStash,
  type GuestClaimStash,
} from "./guest-trip-claim"

const NOW = Date.parse("2026-08-16T12:00:00Z")
const GUEST = "guest-uuid"
const ACCOUNT = "account-uuid"

const valid: GuestClaimStash = {
  token: "abc123",
  guestUserId: GUEST,
  at: NOW - 1000,
}

assert.equal(parseStash(null), null)
assert.equal(parseStash(""), null)
assert.equal(parseStash("{"), null)
assert.equal(parseStash("not-json"), null)
assert.equal(parseStash("[]"), null)
assert.equal(parseStash(JSON.stringify({ token: "x" })), null)
assert.equal(parseStash(JSON.stringify({ token: "x", guestUserId: GUEST })), null)
assert.equal(parseStash(JSON.stringify({ token: "", guestUserId: GUEST, at: NOW })), null)
assert.equal(parseStash(JSON.stringify({ token: "x", guestUserId: "", at: NOW })), null)
assert.equal(
  parseStash(JSON.stringify({ token: "x", guestUserId: GUEST, at: "ayer" })),
  null,
)
assert.equal(parseStash(JSON.stringify({ token: 1, guestUserId: GUEST, at: NOW })), null)

assert.deepEqual(parseStash(JSON.stringify(valid)), valid)

assert.equal(isStashUsable(valid, NOW, ACCOUNT), true)
assert.equal(isStashUsable(valid, NOW, GUEST), false, "mismo userId")

const expired: GuestClaimStash = { ...valid, at: NOW - GUEST_CLAIM_TTL_MS - 1 }
assert.equal(isStashUsable(expired, NOW, ACCOUNT), false)

const justInside: GuestClaimStash = { ...valid, at: NOW - GUEST_CLAIM_TTL_MS + 1 }
assert.equal(isStashUsable(justInside, NOW, ACCOUNT), true)

const fromFuture: GuestClaimStash = { ...valid, at: NOW + 120_000 }
assert.equal(isStashUsable(fromFuture, NOW, ACCOUNT), false)

console.log("guest-trip-claim tests passed")
