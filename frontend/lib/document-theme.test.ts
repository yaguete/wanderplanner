import assert from "node:assert/strict"
import { themeFromDocumentClass } from "./document-theme"

assert.equal(themeFromDocumentClass(null), "light")
assert.equal(themeFromDocumentClass(undefined), "light")
assert.equal(themeFromDocumentClass(""), "light")
assert.equal(themeFromDocumentClass("font-sans"), "light")
assert.equal(themeFromDocumentClass("dark"), "dark")
assert.equal(themeFromDocumentClass("dark font-sans"), "dark")
assert.equal(themeFromDocumentClass("font-sans dark"), "dark")
assert.equal(themeFromDocumentClass("darkmode"), "light")

console.log("document-theme: ok")
