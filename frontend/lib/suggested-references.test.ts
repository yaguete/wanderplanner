import assert from "node:assert/strict"
import {
  isSuggestedReferenceAdded,
  parseSuggestedLang,
  sortSuggestedReferences,
  SUGGESTED_REFERENCES,
  suggestedLangLabel,
  suggestedReferenceHomeUrl,
  suggestedReferencesForLang,
} from "./suggested-references"

assert.equal(parseSuggestedLang("en"), "en")
assert.equal(parseSuggestedLang("es"), "es")
assert.equal(parseSuggestedLang("fr"), "es")
assert.equal(parseSuggestedLang(null), "es")
assert.equal(suggestedLangLabel("en"), "En inglés")

const spanish = suggestedReferencesForLang("es")
const english = suggestedReferencesForLang("en")
assert.equal(spanish.length, 25)
assert.equal(english.length, 16)
assert.equal(spanish.length + english.length, SUGGESTED_REFERENCES.length)

assert.equal(spanish[0]?.host, "lacosmopolilla.com")
assert.equal(spanish[4]?.host, "sinmapa.net")
assert.equal(spanish.at(-1)?.host, "ibamos.com")
assert.ok(spanish.some((item) => item.host === "acrobatadelcamino.com"))
assert.ok(spanish.some((item) => item.host === "nativodelviaje.com"))

assert.equal(english[0]?.host, "nomadicmatt.com")
assert.equal(english.at(-1)?.host, "handluggageonly.co.uk")
assert.ok(english.every((item) => item.lang === "en"))

const hosts = SUGGESTED_REFERENCES.map((item) => item.host)
assert.equal(new Set(hosts).size, hosts.length)
for (const host of hosts) {
  assert.equal(host.startsWith("www."), false)
  assert.ok(host.includes("."))
}

assert.equal(suggestedReferenceHomeUrl("lacosmopolilla.com"), "https://lacosmopolilla.com/")
assert.equal(isSuggestedReferenceAdded("www.sinmapa.net", ["sinmapa.net"]), true)
assert.equal(isSuggestedReferenceAdded("sinmapa.net", ["lacosmopolilla.com"]), false)

const sorted = sortSuggestedReferences(spanish, ["sinmapa.net", "japonismo.com"])
assert.equal(sorted.at(-2)?.host, "sinmapa.net")
assert.equal(sorted.at(-1)?.host, "japonismo.com")
assert.equal(sorted[0]?.host, "lacosmopolilla.com")
assert.ok(!sorted.slice(0, -2).some((item) => item.host === "sinmapa.net"))

console.log("suggested-references: ok")
