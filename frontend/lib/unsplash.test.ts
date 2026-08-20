import assert from "node:assert/strict"
import { coverQueriesFromSource, genericCoverQuery } from "./unsplash"

const fromArea = coverQueriesFromSource({ area: "Costa Vasca" })
assert.equal(fromArea[0], "Costa Vasca")
assert.equal(fromArea.at(-1), genericCoverQuery("Costa Vasca"))
assert.ok(!fromArea.slice(0, -1).includes("España"))

const withCountryInArea = coverQueriesFromSource({ area: "Costa Vasca, España" })
assert.equal(withCountryInArea[0], "Costa Vasca, España")
assert.ok(!withCountryInArea.includes("España"))
assert.equal(withCountryInArea.at(-1), genericCoverQuery("Costa Vasca, España"))

const japanEnglish = coverQueriesFromSource({ area: "Hokkaido, Japan" })
assert.equal(japanEnglish[0], "Hokkaido, Japan")
assert.ok(japanEnglish.includes("Japón"))
assert.equal(japanEnglish.at(-1), genericCoverQuery("Hokkaido, Japan"))

assert.deepEqual(coverQueriesFromSource({ area: null }), [genericCoverQuery("viaje")])
assert.deepEqual(coverQueriesFromSource({ area: "   " }), [genericCoverQuery("viaje")])

console.log("unsplash.test.ts: ok")
