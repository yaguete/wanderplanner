import assert from "node:assert/strict"
import { ASSISTANT_SOURCE_ID, MANUAL_SOURCE_ID } from "./item-provenance"
import { dateISOForDayIndex, toISODate } from "./trip-dates"
import {
  CIVITATIS_AFFILIATE_AID,
  STAY22_AFFILIATE_AID,
  activityDiscoveryHrefs,
  buildCivitatisSearchUrl,
  buildGetYourGuideSearchUrl,
  civitatisPlaceLabel,
  civitatisSlugFromLabel,
  looksLikeStreetAddress,
} from "./activity-search"

function futureISO(daysFromToday: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromToday)
  return toISODate(d)
}

const checkin = futureISO(40)

assert.equal(looksLikeStreetAddress("Király utca 15"), true)
assert.equal(looksLikeStreetAddress("Budapest"), false)

assert.equal(civitatisSlugFromLabel("Múnich"), "munich")
assert.equal(civitatisSlugFromLabel("Nueva York"), "nueva-york")
assert.equal(civitatisSlugFromLabel("Budapest, Hungría"), "budapest")
assert.equal(civitatisSlugFromLabel("Király utca 15, Budapest"), null)
assert.equal(civitatisSlugFromLabel("  "), null)

assert.equal(
  civitatisPlaceLabel({ selectedPlaceLabel: "Praga", destinationHint: "Budapest" }),
  "Praga",
)
assert.equal(
  civitatisPlaceLabel({
    selectedPlaceLabel: "Király utca 15",
    destinationHint: "Budapest, Hungría",
  }),
  "Budapest",
)
assert.equal(
  civitatisPlaceLabel({ selectedPlaceLabel: null, destinationHint: null }),
  null,
)
assert.equal(
  civitatisPlaceLabel({ selectedPlaceLabel: "Prague", destinationHint: null }),
  "Prague",
)

{
  const href = buildCivitatisSearchUrl("Múnich")
  assert.equal(href, `https://www.civitatis.com/es/munich/?aid=${CIVITATIS_AFFILIATE_AID}`)
  assert.equal(buildCivitatisSearchUrl("Király utca 15"), null)
}

{
  const href = buildGetYourGuideSearchUrl({
    address: "Budapest",
    checkin,
    checkout: dateISOForDayIndex(checkin, 1),
    adults: 2,
  })
  assert.ok(href)
  const u = new URL(href)
  assert.equal(u.origin, "https://www.stay22.com")
  assert.equal(u.pathname, "/allez/getyourguide")
  assert.equal(u.searchParams.get("aid"), STAY22_AFFILIATE_AID)
  assert.equal(u.searchParams.get("address"), "Budapest")
  assert.equal(u.searchParams.get("checkin"), checkin)
  assert.equal(u.searchParams.get("checkout"), dateISOForDayIndex(checkin, 1))
  assert.equal(u.searchParams.get("adults"), "2")
  assert.equal(u.searchParams.get("lang"), "es")
}

{
  const href = buildGetYourGuideSearchUrl({
    address: "Budapest",
    coords: { lng: 19.04, lat: 47.5 },
    checkin,
    checkout: dateISOForDayIndex(checkin, 1),
  })
  assert.ok(href)
  const q = new URL(href).searchParams
  assert.equal(q.get("lat"), "47.5")
  assert.equal(q.get("lng"), "19.04")
}

assert.equal(buildGetYourGuideSearchUrl({ address: "  " }), null)

{
  const stored = activityDiscoveryHrefs({
    sourceId: MANUAL_SOURCE_ID,
    affiliateUrl: "https://www.civitatis.com/es/budapest/paseo/?aid=1006",
    selectedPlaceLabel: "Budapest",
  })
  assert.equal(stored, null)
}

{
  const fromSource = activityDiscoveryHrefs({
    sourceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    selectedPlaceLabel: "Budapest",
  })
  assert.equal(fromSource, null)
}

{
  const manual = activityDiscoveryHrefs({
    sourceId: MANUAL_SOURCE_ID,
    selectedPlaceLabel: "Múnich",
    startDate: checkin,
    dayIndex: 0,
    spanDays: 1,
    numTravelers: 2,
  })
  assert.ok(manual)
  assert.equal(
    manual.civitatis,
    `https://www.civitatis.com/es/munich/?aid=${CIVITATIS_AFFILIATE_AID}`,
  )
  assert.ok(manual.getYourGuide)
  const gyg = new URL(manual.getYourGuide)
  assert.equal(gyg.searchParams.get("aid"), STAY22_AFFILIATE_AID)
  assert.equal(gyg.searchParams.get("address"), "Múnich")
  assert.equal(gyg.searchParams.get("checkin"), checkin)
  assert.equal(gyg.searchParams.get("checkout"), dateISOForDayIndex(checkin, 1))
}

{
  const assistant = activityDiscoveryHrefs({
    sourceId: ASSISTANT_SOURCE_ID,
    destinationHint: "Nueva York",
    startDate: checkin,
    dayIndex: 2,
    spanDays: 3,
  })
  assert.ok(assistant)
  assert.equal(
    assistant.civitatis,
    `https://www.civitatis.com/es/nueva-york/?aid=${CIVITATIS_AFFILIATE_AID}`,
  )
  const gyg = new URL(assistant.getYourGuide!)
  assert.equal(gyg.searchParams.get("checkout"), dateISOForDayIndex(checkin, 5))
}

{
  const street = activityDiscoveryHrefs({
    sourceId: MANUAL_SOURCE_ID,
    selectedPlaceLabel: "Király utca 15",
    destinationHint: "Budapest",
  })
  assert.ok(street)
  assert.equal(
    street.civitatis,
    `https://www.civitatis.com/es/budapest/?aid=${CIVITATIS_AFFILIATE_AID}`,
  )
  assert.equal(new URL(street.getYourGuide!).searchParams.get("address"), "Király utca 15")
}

{
  const empty = activityDiscoveryHrefs({
    sourceId: MANUAL_SOURCE_ID,
  })
  assert.ok(empty)
  assert.equal(empty.civitatis, null)
  assert.equal(empty.getYourGuide, null)
}

{
  const typed = activityDiscoveryHrefs({
    sourceId: MANUAL_SOURCE_ID,
    addressHint: "Prague",
    destinationHint: "Praga",
  })
  assert.ok(typed)
  assert.equal(
    typed.civitatis,
    `https://www.civitatis.com/es/praga/?aid=${CIVITATIS_AFFILIATE_AID}`,
  )
  assert.equal(new URL(typed.getYourGuide!).searchParams.get("address"), "Prague")
}

console.log("activity-search.test.ts: ok")
