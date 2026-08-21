import assert from "node:assert/strict"
import type { User } from "@supabase/supabase-js"
import {
  googleOAuthRedirectTo,
  isRecentlyCreatedUser,
  hasPasswordIdentity,
} from "./auth-google"

function user(partial: Partial<User>): User {
  return {
    id: "u1",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
    ...partial,
  } as User
}

assert.equal(
  isRecentlyCreatedUser({ created_at: new Date(Date.now() - 5_000).toISOString() }, Date.now()),
  true,
)
assert.equal(
  isRecentlyCreatedUser({ created_at: new Date(Date.now() - 200_000).toISOString() }, Date.now()),
  false,
)
assert.equal(isRecentlyCreatedUser({ created_at: null }), false)
assert.equal(isRecentlyCreatedUser({}), false)

assert.equal(hasPasswordIdentity(user({ identities: [{ provider: "google" }] as User["identities"] })), false)
assert.equal(
  hasPasswordIdentity(
    user({ identities: [{ provider: "google" }, { provider: "email" }] as User["identities"] }),
  ),
  true,
)
assert.equal(hasPasswordIdentity(null), false)
assert.equal(
  hasPasswordIdentity(user({ identities: [], app_metadata: { providers: ["google"] } })),
  false,
)
assert.equal(hasPasswordIdentity(user({})), true)

assert.equal(
  googleOAuthRedirectTo("https://wanderplanner.ai", "/trips", true),
  "https://wanderplanner.ai/auth/callback?next=%2Ftrips&remember=1",
)
assert.equal(
  googleOAuthRedirectTo("https://wanderplanner.ai", "/trips/abc", false),
  "https://wanderplanner.ai/auth/callback?next=%2Ftrips%2Fabc&remember=0",
)
assert.equal(
  googleOAuthRedirectTo("https://wanderplanner.ai", "//evil.com", true),
  "https://wanderplanner.ai/auth/callback?next=%2Ftrips&remember=1",
)

console.log("auth-google.test.ts: ok")
