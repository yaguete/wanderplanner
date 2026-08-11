import assert from "node:assert/strict"
import { canAddSource, MAX_SOURCES_PER_TRIP } from "./trip-sources"

assert.equal(MAX_SOURCES_PER_TRIP, 5)

assert.equal(canAddSource({ sourceCount: 0, loadingPendingCount: 0 }), true)
assert.equal(canAddSource({ sourceCount: 4, loadingPendingCount: 0 }), true)
assert.equal(canAddSource({ sourceCount: 4, loadingPendingCount: 1 }), false)
assert.equal(canAddSource({ sourceCount: 5, loadingPendingCount: 0 }), false)
assert.equal(canAddSource({ sourceCount: 3, loadingPendingCount: 2 }), false)
assert.equal(canAddSource({ sourceCount: 0, loadingPendingCount: 5 }), false)

console.log("trip-sources: ok")
