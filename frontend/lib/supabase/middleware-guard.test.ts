import assert from "node:assert/strict"
import {
  hasSupabaseAuthCookie,
  isProtectedPath,
  middlewareGate,
} from "./middleware-guard"

assert.equal(isProtectedPath("/trips"), true)
assert.equal(isProtectedPath("/trips/abc"), true)
assert.equal(isProtectedPath("/account"), true)
assert.equal(isProtectedPath("/account/settings"), true)
assert.equal(isProtectedPath("/login"), false)
assert.equal(isProtectedPath("/"), false)
assert.equal(isProtectedPath("/start"), false)
assert.equal(isProtectedPath("/trip"), false)

assert.equal(hasSupabaseAuthCookie([]), false)
assert.equal(hasSupabaseAuthCookie([{ name: "wp-session-persist" }]), false)
assert.equal(
  hasSupabaseAuthCookie([{ name: "sb-kzriijgdkrdruikmpufl-auth-token" }]),
  true,
)
assert.equal(
  hasSupabaseAuthCookie([{ name: "sb-kzriijgdkrdruikmpufl-auth-token.0" }]),
  true,
)
assert.equal(middlewareGate({ isProtected: false, hasToken: false }), "pass")
assert.equal(middlewareGate({ isProtected: false, hasToken: true }), "pass")
assert.equal(middlewareGate({ isProtected: true, hasToken: false }), "login")
assert.equal(
  middlewareGate({ isProtected: true, hasToken: true }),
  "pass",
  "cookie presente: no esperar a GoTrue",
)

// El middleware no hace red: sin cookie, login; con cookie, pasa y refresca el
// cliente. No hay `getUser()` que acotar en Edge.
console.log("middleware-guard: ok")
