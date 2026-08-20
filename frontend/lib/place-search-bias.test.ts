import assert from "node:assert/strict"
import { placeSearchBias, queryLooksGeographicallyQualified } from "./place-search-bias"

const island: [number, number] = [-61.679, 12.116]

assert.equal(queryLooksGeographicallyQualified("Granada"), false)
assert.equal(queryLooksGeographicallyQualified("Gernika"), false)
assert.equal(queryLooksGeographicallyQualified("Granada, España"), true)
assert.equal(queryLooksGeographicallyQualified("Provincia de Granada, españa"), true)
assert.equal(queryLooksGeographicallyQualified("Uganda"), true)

{
  const bias = placeSearchBias("Granada", { proximity: island })
  assert.deepEqual(bias.proximity, island)
  assert.equal(bias.countryCodes.includes("gd"), false)
}

{
  const bias = placeSearchBias("Granada, España", { proximity: island, countryCodes: ["gd"] })
  assert.equal(bias.proximity, null)
  assert.ok(bias.countryCodes.includes("es"))
}

{
  const bias = placeSearchBias("Provincia de Granada, españa", { proximity: island })
  assert.equal(bias.proximity, null)
  assert.ok(bias.countryCodes.includes("es"))
  assert.equal(bias.countryCodes.includes("gd"), false)
}

{
  const bias = placeSearchBias("Gernika", { proximity: [-2.68, 43.31], countryCodes: ["es"] })
  assert.deepEqual(bias.proximity, [-2.68, 43.31])
  assert.deepEqual(bias.countryCodes, ["es"])
}

{
  const bias = placeSearchBias("Grenada", { proximity: island })
  assert.ok(bias.countryCodes.includes("gd"))
}

console.log("place-search-bias: ok")
