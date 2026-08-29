import assert from "node:assert/strict"
import { isMcpEnabled } from "./config"

assert.equal(isMcpEnabled(undefined), false)
assert.equal(isMcpEnabled(""), false)
assert.equal(isMcpEnabled("false"), false)
assert.equal(isMcpEnabled("FALSE"), false)
assert.equal(isMcpEnabled("1"), false)
assert.equal(isMcpEnabled("yes"), false)
assert.equal(isMcpEnabled("TRUE"), true)
assert.equal(isMcpEnabled("true"), true)
assert.equal(isMcpEnabled(" True "), true)

console.log("mcp-enabled: ok")
