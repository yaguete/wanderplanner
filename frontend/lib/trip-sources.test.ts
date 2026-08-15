import assert from "node:assert/strict"
import { canAddSource, MAX_SOURCES_PER_TRIP, sourceMatchKey } from "./trip-sources"

assert.equal(MAX_SOURCES_PER_TRIP, 5)

assert.equal(canAddSource({ sourceCount: 0, loadingPendingCount: 0 }), true)
assert.equal(canAddSource({ sourceCount: 4, loadingPendingCount: 0 }), true)
assert.equal(canAddSource({ sourceCount: 4, loadingPendingCount: 1 }), false)
assert.equal(canAddSource({ sourceCount: 5, loadingPendingCount: 0 }), false)
assert.equal(canAddSource({ sourceCount: 3, loadingPendingCount: 2 }), false)
assert.equal(canAddSource({ sourceCount: 0, loadingPendingCount: 5 }), false)

assert.equal(
  sourceMatchKey("https://www.x.com/a"),
  sourceMatchKey("http://x.com/a/"),
)
assert.equal(
  sourceMatchKey("https://lacosmopolilla.com/que-ver-en-austria-ruta-10-dias/"),
  sourceMatchKey("https://www.lacosmopolilla.com/que-ver-en-austria-ruta-10-dias"),
)
assert.equal(
  sourceMatchKey("https://blog.com/a?utm_source=x"),
  sourceMatchKey("https://blog.com/a"),
)
assert.notEqual(sourceMatchKey("https://blog.com/a"), sourceMatchKey("https://blog.com/b"))
assert.equal(sourceMatchKey(""), "")

console.log("trip-sources: ok")
