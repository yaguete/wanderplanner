import assert from "node:assert/strict"
import {
  GET_USER_BUDGET_MS,
  hasSupabaseAuthCookie,
  isProtectedPath,
  withTimeout,
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
assert.ok(GET_USER_BUDGET_MS < 25_000)
assert.ok(GET_USER_BUDGET_MS >= 1_000)

async function run() {
  const got = await withTimeout(Promise.resolve(42), 50)
  assert.equal(got, 42)
  const timed = await withTimeout(new Promise<number>(() => {}), 20)
  assert.equal(timed, "timeout")
}

void run()
  .then(() => {
    console.log("middleware-guard: ok")
  })
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
