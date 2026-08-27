import assert from "node:assert/strict"
import { isAppShellPath, isForcedLightPath, showsThemeToggle } from "./theme-scope"

assert.equal(isForcedLightPath("/partners"), true)
assert.equal(isForcedLightPath("/partners/"), true)
assert.equal(isForcedLightPath("/partners/algo"), true)
assert.equal(isForcedLightPath("/partnership"), false)
assert.equal(isForcedLightPath("/trips"), false)
assert.equal(isForcedLightPath("/"), false)
assert.equal(isForcedLightPath("/lacosmopolilla"), false)
assert.equal(isForcedLightPath("/login"), false)
assert.equal(isForcedLightPath(null), false)

assert.equal(isAppShellPath("/trips"), true)
assert.equal(isAppShellPath("/trips/abc"), true)
assert.equal(isAppShellPath("/account"), true)
assert.equal(isAppShellPath("/account/settings"), true)
assert.equal(isAppShellPath("/"), false)
assert.equal(isAppShellPath("/partners"), false)
assert.equal(isAppShellPath("/start"), false)

assert.equal(showsThemeToggle("/", "light"), true)
assert.equal(showsThemeToggle("/lacosmopolilla"), true)
assert.equal(showsThemeToggle("/legal/cookies"), true)
assert.equal(showsThemeToggle("/partners", "negative"), false)
assert.equal(showsThemeToggle("/partners", "light"), false)
assert.equal(showsThemeToggle("/", "negative"), false)

console.log("theme-scope: ok")
