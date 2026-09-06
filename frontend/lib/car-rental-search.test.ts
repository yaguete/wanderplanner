import assert from "node:assert/strict"
import {
  DISCOVERCARS_AFFILIATE_AID,
  buildDiscoverCarsSearchUrl,
  carRentalFormSearchHref,
  isDiscoverCarsUrl,
  isOwnDiscoverCarsUrl,
} from "./car-rental-search"

assert.equal(DISCOVERCARS_AFFILIATE_AID, "lacosmopolilla")

const home = buildDiscoverCarsSearchUrl()
assert.equal(home, "https://www.discovercars.com/es?a_aid=lacosmopolilla")
assert.equal(carRentalFormSearchHref(), home)
assert.equal(
  carRentalFormSearchHref({
    city: "Edimburgo",
    startDate: "2026-09-08",
    pickupIndex: 1,
    returnIndex: 4,
  }),
  home,
)

assert.equal(isDiscoverCarsUrl(home), true)
assert.equal(isDiscoverCarsUrl("https://book.discovercars.com/es"), true)
assert.equal(isDiscoverCarsUrl("https://www.booking.com/"), false)
assert.equal(isDiscoverCarsUrl("https://discovercars.com.evil.example/"), false)
assert.equal(isDiscoverCarsUrl("not a url"), false)

assert.equal(isOwnDiscoverCarsUrl(home), true)
assert.equal(
  isOwnDiscoverCarsUrl("https://www.discovercars.com/es?a_aid=otro"),
  false,
)
assert.equal(isOwnDiscoverCarsUrl("https://www.discovercars.com/es"), false)

const params = { city: "Roma" }
buildDiscoverCarsSearchUrl(params)
assert.deepEqual(params, { city: "Roma" })

console.log("car-rental-search.test.ts: ok")
