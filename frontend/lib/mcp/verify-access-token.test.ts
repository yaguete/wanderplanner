import assert from "node:assert/strict"
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose"
import { verifyAccessToken } from "./verify-access-token"

const ISSUER = "https://example.supabase.co/auth/v1"
const SECRET = "test-hs256-secret-at-least-32-chars!"
const secretKey = new TextEncoder().encode(SECRET)

async function hs256(claims: Record<string, unknown>, opts?: {
  aud?: string
  iss?: string
  exp?: number | string
}): Promise<string> {
  const exp = opts?.exp ?? Math.floor(Date.now() / 1000) + 3600
  return new SignJWT({
    sub: "user-1",
    client_id: "oauth-client-1",
    role: "authenticated",
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(opts?.iss ?? ISSUER)
    .setAudience(opts?.aud ?? "authenticated")
    .setExpirationTime(exp)
    .sign(secretKey)
}

async function main() {
{
  const exp = Math.floor(Date.now() / 1000) + 7200
  const token = await hs256({ scope: "openid email" }, { exp })
  const info = await verifyAccessToken({ token, issuer: ISSUER, secret: SECRET })
  assert.ok(info, "HS256 válido")
  assert.equal(info.clientId, "oauth-client-1")
  assert.equal(info.token, token)
  assert.deepEqual(info.scopes, ["openid", "email"])
  assert.equal(info.expiresAt, exp)
  assert.equal(info.extra?.sub, "user-1")
  assert.equal(typeof info.expiresAt, "number")
  assert.ok(info.expiresAt! > 1_700_000_000, "expiresAt en segundos, no milisegundos")
}

{
  const { publicKey, privateKey } = await generateKeyPair("ES256")
  const jwk = await exportJWK(publicKey)
  jwk.kid = "k1"
  jwk.alg = "ES256"
  jwk.use = "sig"
  const getKey = createLocalJWKSet({ keys: [jwk] })
  const token = await new SignJWT({
    sub: "user-jwks",
    client_id: "oauth-client-jwks",
    role: "authenticated",
  })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setIssuer(ISSUER)
    .setAudience("authenticated")
    .setExpirationTime("2h")
    .sign(privateKey)
  const info = await verifyAccessToken({ token, issuer: ISSUER, getKey })
  assert.ok(info, "JWKS local válido")
  assert.equal(info.clientId, "oauth-client-jwks")
  assert.equal(info.extra?.sub, "user-jwks")
}

{
  const token = await hs256({})
  const info = await verifyAccessToken({
    token,
    issuer: ISSUER,
    secret: "otro-secreto-que-no-firma-nada-xyz",
  })
  assert.equal(info, undefined, "firma mala")
}

{
  const token = await hs256({ client_id: "" })
  const info = await verifyAccessToken({ token, issuer: ISSUER, secret: SECRET })
  assert.equal(info, undefined, "client_id vacío")
}

{
  const token = await new SignJWT({
    sub: "user-1",
    role: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience("authenticated")
    .setExpirationTime("2h")
    .sign(secretKey)
  const info = await verifyAccessToken({ token, issuer: ISSUER, secret: SECRET })
  assert.equal(info, undefined, "sin client_id (token de sesión web)")
}

{
  const token = await hs256({}, { iss: "https://otro.supabase.co/auth/v1" })
  const info = await verifyAccessToken({ token, issuer: ISSUER, secret: SECRET })
  assert.equal(info, undefined, "iss ajeno")
}

{
  const token = await hs256({}, { exp: Math.floor(Date.now() / 1000) - 30 })
  const info = await verifyAccessToken({ token, issuer: ISSUER, secret: SECRET })
  assert.equal(info, undefined, "exp pasado")
}

{
  const token = await hs256({ is_anonymous: true })
  const info = await verifyAccessToken({ token, issuer: ISSUER, secret: SECRET })
  assert.equal(info, undefined, "invitado anónimo")
}

{
  const token = await hs256({}, { aud: "https://wanderplanner.ai/mcp" })
  const info = await verifyAccessToken({ token, issuer: ISSUER, secret: SECRET })
  assert.equal(info, undefined, "aud distinto de authenticated")
}

{
  const token = await hs256({})
  const info = await verifyAccessToken({ token, issuer: ISSUER, secret: SECRET })
  assert.ok(info)
  assert.ok(Array.isArray(info.scopes))
  assert.equal(info.scopes.length, 0, "scopes nunca undefined")
}

console.log("mcp-verify-token: ok")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
