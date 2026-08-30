import assert from "node:assert/strict"
import { describeScope, isShownScope, splitScopes } from "./oauth-href"

assert.deepEqual(splitScopes(null), [])
assert.deepEqual(splitScopes(""), [])
assert.deepEqual(splitScopes("  openid   email\tprofile "), ["openid", "email", "profile"])
// `phone` no se enumera: el cliente lo pide, pero WanderPlanner no guarda
// teléfono, así que no se entrega nada y anunciarlo prometería un dato inexistente.
// Si algún día se guarda (login por SMS, 2FA), vuelve a la lista.
assert.deepEqual(
  splitScopes("openid email profile phone offline_access"),
  ["openid", "email", "profile", "offline_access"],
)
assert.deepEqual(splitScopes("phone"), [], "solo teléfono: nada que enumerar")
assert.equal(isShownScope("phone"), false)
assert.equal(isShownScope("email"), true)
// Un scope desconocido se enumera: se falla del lado de enseñarlo.
assert.equal(isShownScope("custom.foo"), true)
assert.deepEqual(splitScopes("openid custom.foo"), ["openid", "custom.foo"])

assert.equal(describeScope("openid"), "Identificarte en WanderPlanner")
assert.equal(describeScope("email"), "Ver tu correo")
assert.equal(describeScope("profile"), "Ver tu nombre y foto de perfil")
assert.equal(describeScope("offline_access"), "Mantener la conexión")
assert.equal(describeScope("custom.foo"), "custom.foo")

console.log("mcp-oauth-href: ok")
