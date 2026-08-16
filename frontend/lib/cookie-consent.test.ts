import assert from "node:assert/strict"
import { CONSENT_TTL_MS, isAnalyticsAllowed, parseConsent } from "./cookie-consent"

const NOW = Date.parse("2026-08-16T12:00:00Z")

assert.equal(parseConsent(null, NOW), null)
assert.equal(parseConsent("", NOW), null)
assert.equal(parseConsent("{", NOW), null)
assert.equal(parseConsent("not-json", NOW), null)
assert.equal(parseConsent(JSON.stringify({ choice: "all" }), NOW), null)
assert.equal(parseConsent(JSON.stringify({ v: 1, choice: "maybe", decidedAt: NOW }), NOW), null)
assert.equal(parseConsent(JSON.stringify({ v: 2, choice: "all", decidedAt: NOW }), NOW), null)
assert.equal(parseConsent(JSON.stringify({ v: 1, choice: "all", decidedAt: "ayer" }), NOW), null)

const validAll = parseConsent(
  JSON.stringify({ v: 1, choice: "all", decidedAt: NOW - 1000 }),
  NOW,
)
assert.deepEqual(validAll, { v: 1, choice: "all", decidedAt: NOW - 1000 })
assert.equal(isAnalyticsAllowed(validAll), true)

const validNecessary = parseConsent(
  JSON.stringify({ v: 1, choice: "necessary", decidedAt: NOW }),
  NOW,
)
assert.equal(validNecessary?.choice, "necessary")
assert.equal(isAnalyticsAllowed(validNecessary), false)
assert.equal(isAnalyticsAllowed(null), false)

const justInside = parseConsent(
  JSON.stringify({ v: 1, choice: "all", decidedAt: NOW - CONSENT_TTL_MS + 1 }),
  NOW,
)
assert.equal(justInside?.choice, "all")

const expired = parseConsent(
  JSON.stringify({ v: 1, choice: "all", decidedAt: NOW - CONSENT_TTL_MS - 1 }),
  NOW,
)
assert.equal(expired, null)

const future = parseConsent(
  JSON.stringify({ v: 1, choice: "all", decidedAt: NOW + 120_000 }),
  NOW,
)
assert.equal(future, null)

console.log("cookie-consent: ok")
