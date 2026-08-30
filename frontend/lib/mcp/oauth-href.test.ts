import assert from "node:assert/strict"
import { describeScope, splitScopes } from "./oauth-href"

assert.deepEqual(splitScopes(null), [])
assert.deepEqual(splitScopes(""), [])
assert.deepEqual(splitScopes("  openid   email\tprofile "), ["openid", "email", "profile"])
assert.deepEqual(
  splitScopes("openid email profile phone offline_access"),
  ["openid", "email", "profile", "phone", "offline_access"],
)

assert.equal(describeScope("openid"), "Identificarte en WanderPlanner")
assert.equal(describeScope("email"), "Ver tu correo")
assert.equal(describeScope("profile"), "Ver tu nombre y foto de perfil")
assert.equal(describeScope("phone"), "Ver tu teléfono")
assert.equal(describeScope("offline_access"), "Mantener la conexión")
assert.equal(describeScope("custom.foo"), "custom.foo")

console.log("mcp-oauth-href: ok")
