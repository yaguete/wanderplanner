import assert from "node:assert/strict"
import { applyMcpAffiliateGate } from "./affiliate-gate"
import { isMcpAffiliateLinksEnabled } from "./config"

assert.equal(isMcpAffiliateLinksEnabled(undefined), false)
assert.equal(isMcpAffiliateLinksEnabled(""), false)
assert.equal(isMcpAffiliateLinksEnabled("false"), false)
assert.equal(isMcpAffiliateLinksEnabled("1"), false)
assert.equal(isMcpAffiliateLinksEnabled("TRUE"), true)
assert.equal(isMcpAffiliateLinksEnabled("true"), true)
assert.equal(isMcpAffiliateLinksEnabled(" True "), true)

const payload = {
  layer: "trip" as const,
  results: [
    {
      name: "Hotel Split",
      affiliateUrl: "https://www.booking.com/hotel/hr/split.html?aid=99",
      sourceUrl: "https://blog.example/split",
      wanderplannerUrl: "https://wanderplanner.ai/trips/abc?tab=stay",
    },
  ],
}

{
  const gated = applyMcpAffiliateGate(payload, false)
  const blob = JSON.stringify(gated)
  assert.equal(blob.includes("booking.com"), false)
  assert.equal(blob.includes("aid=99"), false)
  assert.equal(gated.results[0]?.affiliateUrl, null)
  assert.equal(gated.results[0]?.sourceUrl, "https://blog.example/split")
  assert.ok(gated.results[0]?.wanderplannerUrl?.includes("wanderplanner.ai"))
}

{
  const open = applyMcpAffiliateGate(payload, true)
  assert.equal(
    open.results[0]?.affiliateUrl,
    "https://www.booking.com/hotel/hr/split.html?aid=99",
  )
}

console.log("mcp-affiliate-gate: ok")
