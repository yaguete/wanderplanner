import assert from "node:assert/strict"
import { safeNext } from "./auth-next"

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

console.log("auth-next: ok")
