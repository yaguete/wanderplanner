import assert from "node:assert/strict"
import {
  isSuggestedReferenceAdded,
  sortSuggestedReferences,
  SUGGESTED_REFERENCES,
  suggestedReferenceHomeUrl,
} from "./suggested-references"

assert.equal(SUGGESTED_REFERENCES.length, 20)
assert.equal(SUGGESTED_REFERENCES[0]?.host, "lacosmopolilla.com")
assert.equal(SUGGESTED_REFERENCES[4]?.host, "sinmapa.net")
assert.equal(SUGGESTED_REFERENCES.at(-1)?.host, "elviajedesofi.com")

const hosts = SUGGESTED_REFERENCES.map((item) => item.host)
assert.equal(new Set(hosts).size, hosts.length)
for (const host of hosts) {
  assert.equal(host.startsWith("www."), false)
  assert.ok(host.includes("."))
}

assert.equal(suggestedReferenceHomeUrl("lacosmopolilla.com"), "https://lacosmopolilla.com/")
assert.equal(isSuggestedReferenceAdded("www.sinmapa.net", ["sinmapa.net"]), true)
assert.equal(isSuggestedReferenceAdded("sinmapa.net", ["lacosmopolilla.com"]), false)

const sorted = sortSuggestedReferences(SUGGESTED_REFERENCES, ["sinmapa.net", "japonismo.com"])
assert.equal(sorted.at(-2)?.host, "sinmapa.net")
assert.equal(sorted.at(-1)?.host, "japonismo.com")
assert.equal(sorted[0]?.host, "lacosmopolilla.com")
assert.ok(!sorted.slice(0, -2).some((item) => item.host === "sinmapa.net"))

console.log("suggested-references: ok")
