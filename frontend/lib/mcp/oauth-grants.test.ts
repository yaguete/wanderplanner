import assert from "node:assert/strict"
import { formatGrantDate, parseOAuthGrant, parseOAuthGrantList } from "./oauth-grants"

assert.equal(parseOAuthGrant(null), null)
assert.equal(parseOAuthGrant({ client_id: "x" }), null, "el cliente va anidado")
assert.equal(parseOAuthGrant({ client: { name: "Chat" } }), null, "sin id no vale")

{
  const grant = parseOAuthGrant({
    client: { id: "  abc-1  ", name: "  Mi app  ", uri: "https://example.com" },
    scopes: ["openid", "email", ""],
    granted_at: "2026-01-15T10:30:00.000Z",
  })
  assert.deepEqual(grant, {
    clientId: "abc-1",
    clientName: "Mi app",
    grantedAt: "2026-01-15T10:30:00.000Z",
    scopes: ["openid", "email"],
  })
}

{
  const grant = parseOAuthGrant({
    client: { id: "c1", name: "   " },
    scopes: "openid",
    granted_at: 1,
  })
  assert.equal(grant?.clientName, "Una aplicación")
  assert.deepEqual(grant?.scopes, [])
  assert.equal(grant?.grantedAt, "")
}

assert.deepEqual(parseOAuthGrantList(null), [])
assert.deepEqual(
  parseOAuthGrantList([
    { client: { id: "a", name: "A" }, scopes: [], granted_at: "2026-08-01T00:00:00Z" },
    { nope: true },
    { client: { id: "b", name: "B" }, scopes: ["profile"], granted_at: "2026-08-02T00:00:00Z" },
  ]).map((g) => g.clientId),
  ["a", "b"],
)

assert.equal(formatGrantDate("2026-01-15T10:30:00.000Z"), "15 de enero de 2026")
assert.equal(formatGrantDate("   "), "")
assert.equal(formatGrantDate("ayer"), "")

console.log("mcp-oauth-grants: ok")
