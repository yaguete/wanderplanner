import assert from "node:assert/strict"
import { completeAuthNavigation, hrefWithNext, safeNext } from "./auth-next"
import { loginWithConsent, signupWithConsent } from "./mcp/oauth-href"

assert.equal(safeNext(null), "/trips")
assert.equal(safeNext(undefined), "/trips")
assert.equal(safeNext(""), "/trips")
assert.equal(safeNext("/trips"), "/trips")
assert.equal(safeNext("/trips/abc"), "/trips/abc")
assert.equal(safeNext("/reset-password"), "/reset-password")
assert.equal(safeNext("/trips?foo=1"), "/trips?foo=1")
assert.equal(safeNext("//evil.com"), "/trips")
assert.equal(safeNext("https://evil.com"), "/trips")
assert.equal(safeNext("https://evil.com/trips"), "/trips")
assert.equal(safeNext("evil.com"), "/trips")
assert.equal(safeNext("//evil.com", "/account"), "/account")

assert.equal(hrefWithNext("/signup", "/trips"), "/signup")
assert.equal(hrefWithNext("/login", null), "/login")
assert.equal(
  hrefWithNext("/signup", "/oauth/consent?authorization_id=abc"),
  `/signup?next=${encodeURIComponent("/oauth/consent?authorization_id=abc")}`,
)
assert.equal(
  hrefWithNext("/login", "/oauth/consent?authorization_id=abc"),
  `/login?next=${encodeURIComponent("/oauth/consent?authorization_id=abc")}`,
)
assert.equal(hrefWithNext("/signup", "//evil.com"), "/signup")

assert.equal(
  loginWithConsent("abc"),
  `/login?next=${encodeURIComponent("/oauth/consent?authorization_id=abc")}`,
)
assert.equal(
  signupWithConsent("abc"),
  `/signup?next=${encodeURIComponent("/oauth/consent?authorization_id=abc")}`,
)

{
  const assigned: string[] = []
  const previous = globalThis.window
  ;(globalThis as unknown as { window: { location: { assign: (url: string) => void } } }).window = {
    location: { assign: (url: string) => assigned.push(url) },
  }
  try {
    completeAuthNavigation("//evil.com")
    completeAuthNavigation("/trips/abc")
    assert.deepEqual(assigned, ["/trips", "/trips/abc"])
  } finally {
    if (previous === undefined) {
      Reflect.deleteProperty(globalThis, "window")
    } else {
      globalThis.window = previous
    }
  }
}

console.log("auth-next: ok")
