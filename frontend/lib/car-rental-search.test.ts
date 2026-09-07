import assert from "node:assert/strict"
import { resolveAirportCode } from "./airports"
import { FLIGHT_SEARCH_TRACKING_URL } from "./flight-search"
import {
  DISCOVERCARS_AFFILIATE_AID,
  buildDiscoverCarsSearchUrl,
  buildSkyscannerCarHireHref,
  carRentalFormSearchHref,
  isDiscoverCarsUrl,
  isOwnDiscoverCarsUrl,
} from "./car-rental-search"
import type { RoutePlace } from "@/types/itinerary"

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

const edinburgh: RoutePlace = {
  label: "Edimburgo",
  coords: { lng: -3.19, lat: 55.95 },
  kind: "city",
}
const glasgow: RoutePlace = {
  label: "Glasgow",
  coords: { lng: -4.25, lat: 55.86 },
  kind: "city",
}
const ocean: RoutePlace = {
  label: "Mar",
  coords: { lng: -40, lat: 0 },
  kind: "city",
}

assert.equal(resolveAirportCode(edinburgh), "EDI")

function assertCarHireHref(
  href: string | null,
  expected: {
    pickupPlace: string
    dropoffPlace?: string | null
    pickupTime: string
    dropoffTime: string
    currency?: string
  },
) {
  assert.ok(href)
  const wrap = new URL(href)
  assert.equal(`${wrap.origin}${wrap.pathname}`, FLIGHT_SEARCH_TRACKING_URL)
  const dest = wrap.searchParams.get("u")
  assert.ok(dest, "missing Impact u=")
  const inner = new URL(dest)
  assert.equal(inner.origin, "https://www.skyscanner.net")
  assert.equal(inner.pathname, "/g/referrals/v1/cars/day-view")
  assert.equal(inner.searchParams.get("pickupPlace"), expected.pickupPlace)
  assert.equal(inner.searchParams.get("dropoffPlace"), expected.dropoffPlace ?? null)
  assert.equal(inner.searchParams.get("pickupTime"), expected.pickupTime)
  assert.equal(inner.searchParams.get("dropoffTime"), expected.dropoffTime)
  assert.equal(inner.searchParams.get("locale"), "es-ES")
  assert.equal(inner.searchParams.get("market"), "ES")
  assert.equal(inner.searchParams.get("currency"), expected.currency ?? "EUR")
}

assertCarHireHref(
  buildSkyscannerCarHireHref({
    pickup: edinburgh,
    pickupISO: "2026-10-12",
    returnISO: "2026-10-16",
  }),
  {
    pickupPlace: "EDI",
    pickupTime: "2026-10-12T10:00",
    dropoffTime: "2026-10-16T10:00",
  },
)

assertCarHireHref(
  buildSkyscannerCarHireHref({
    pickup: edinburgh,
    dropoff: glasgow,
    pickupISO: "2026-10-12",
    returnISO: "2026-10-16",
    currency: "gbp",
  }),
  {
    pickupPlace: "EDI",
    dropoffPlace: "GLA",
    pickupTime: "2026-10-12T10:00",
    dropoffTime: "2026-10-16T10:00",
    currency: "GBP",
  },
)

assert.equal(
  buildSkyscannerCarHireHref({
    pickup: edinburgh,
    pickupISO: "2026-10-12",
    returnISO: "2026-10-12",
  }),
  null,
)
assert.equal(
  buildSkyscannerCarHireHref({
    pickup: ocean,
    pickupISO: "2026-10-12",
    returnISO: "2026-10-16",
  }),
  null,
)
assert.equal(
  buildSkyscannerCarHireHref({
    pickup: edinburgh,
    pickupISO: null,
    returnISO: "2026-10-16",
  }),
  null,
)

console.log("car-rental-search.test.ts: ok")
