import assert from "node:assert/strict"
import {
  applyPersistMode,
  parsePersistMode,
  persistCookieOptions,
  persistModeFromRemember,
  persistModeFromRememberParam,
  SESSION_PERSIST_MAX_AGE,
} from "./auth-session-persist"

assert.equal(parsePersistMode(null), "always")
assert.equal(parsePersistMode(undefined), "always")
assert.equal(parsePersistMode(""), "always")
assert.equal(parsePersistMode("always"), "always")
assert.equal(parsePersistMode("garbage"), "always")
assert.equal(parsePersistMode("session"), "session")

assert.equal(persistModeFromRemember(true), "always")
assert.equal(persistModeFromRemember(false), "session")

assert.equal(persistModeFromRememberParam(null), null)
assert.equal(persistModeFromRememberParam(undefined), null)
assert.equal(persistModeFromRememberParam(""), null)
assert.equal(persistModeFromRememberParam("1"), "always")
assert.equal(persistModeFromRememberParam("0"), "session")
assert.equal(persistModeFromRememberParam("yes"), null)

const withAge = { path: "/", sameSite: "lax" as const, maxAge: 123, expires: new Date("2030-01-01") }
assert.deepEqual(applyPersistMode("always", withAge), withAge)

const sessioned = applyPersistMode("session", withAge)
assert.equal(sessioned.maxAge, undefined)
assert.equal(sessioned.expires, undefined)
assert.equal(sessioned.path, "/")
assert.equal(sessioned.sameSite, "lax")
assert.equal(withAge.maxAge, 123, "no mutar el original")

const alreadySession = { path: "/", sameSite: "lax" as const }
assert.deepEqual(applyPersistMode("session", alreadySession), alreadySession)

const deletion = { path: "/", maxAge: 0 }
assert.deepEqual(applyPersistMode("session", deletion), deletion)
const deletionNeg = { path: "/", maxAge: -1 }
assert.deepEqual(applyPersistMode("session", deletionNeg), deletionNeg)
assert.deepEqual(applyPersistMode("always", deletion), deletion)

const opts = persistCookieOptions()
assert.equal(opts.maxAge, SESSION_PERSIST_MAX_AGE)
assert.equal(opts.sameSite, "lax")
assert.equal(opts.path, "/")
assert.deepEqual(persistCookieOptions(), opts)

console.log("auth-session-persist.test.ts: ok")
