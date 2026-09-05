import assert from "node:assert/strict"
import { ASSISTANT_SOURCE_ID, MANUAL_SOURCE_ID } from "./item-provenance"
import { dateISOForDayIndex, toISODate } from "./trip-dates"
import { BOOKING_AFFILIATE_AID } from "./booking-search"
import { itemDiscoveryLinks, partnerCtaLabel } from "./item-discovery-links"

function futureISO(daysFromToday: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromToday)
  return toISODate(d)
}

function checkoutFor(checkin: string, nights: number): string {
  const iso = dateISOForDayIndex(checkin, nights)
  assert.ok(iso)
  return iso
}

const SOURCE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
const checkin = futureISO(40)

assert.equal(partnerCtaLabel("https://www.booking.com/hotel/es/x.html?aid=99"), "Ver en Booking")
assert.equal(partnerCtaLabel("https://www.airbnb.es/rooms/1"), "Ver en Airbnb")
assert.equal(partnerCtaLabel("https://www.civitatis.com/es/budapest/paseo"), "Ver en Civitatis")
assert.equal(
  partnerCtaLabel("https://operator.example/tour", "GuruWalk"),
  "Ver en GuruWalk",
)
assert.equal(partnerCtaLabel("https://operator.example/tour"), "Ver reserva")

{
  const blogger =
    "https://www.booking.com/hotel/hu/foo.html?aid=99&label=blog"
  const links = itemDiscoveryLinks({
    type: "stay",
    affiliateUrl: blogger,
    sourceId: SOURCE_ID,
    destination: "Budapest",
    startDate: checkin,
    dayIndexes: [0, 1],
    dayIndex: 0,
    spanDays: 2,
  })
  assert.equal(links.kind, "partner")
  if (links.kind !== "partner") throw new Error("expected partner")
  assert.equal(links.affiliate, "partner")
  assert.equal(links.label, "Ver en Booking")
  const u = new URL(links.href)
  assert.equal(u.searchParams.get("aid"), "99")
  assert.equal(u.searchParams.get("label"), "blog")
  assert.equal(u.searchParams.get("checkin"), checkin)
  assert.equal(u.searchParams.get("checkout"), checkoutFor(checkin, 2))
}

{
  const links = itemDiscoveryLinks({
    type: "activity",
    affiliateUrl: "https://www.civitatis.com/es/budapest/paseo/?aid=1006",
    sourceId: SOURCE_ID,
    destination: "Budapest",
    startDate: checkin,
    dayIndexes: [0],
    dayIndex: 0,
    spanDays: 1,
  })
  assert.equal(links.kind, "partner")
  if (links.kind !== "partner") throw new Error("expected partner")
  assert.equal(links.affiliate, "partner")
  assert.equal(links.label, "Ver en Civitatis")
  assert.ok(links.href.includes("civitatis.com"))
  assert.equal(new URL(links.href).searchParams.get("checkin"), null)
}

{
  const links = itemDiscoveryLinks({
    type: "stay",
    sourceId: SOURCE_ID,
    allowFromSource: true,
    destination: "Edimburgo",
    startDate: checkin,
    dayIndexes: [0, 1],
    dayIndex: 0,
    spanDays: 2,
    currency: "EUR",
    numTravelers: 2,
  })
  assert.equal(links.kind, "own")
  if (links.kind !== "own") throw new Error("expected own")
  assert.ok(links.stay?.booking)
  assert.ok(links.stay?.airbnb)
  assert.ok(links.stay?.homeExchange)
  assert.equal(new URL(links.stay.booking).searchParams.get("aid"), BOOKING_AFFILIATE_AID)
  assert.equal(new URL(links.stay.booking).searchParams.get("ss"), "Edimburgo")
}

{
  const links = itemDiscoveryLinks({
    type: "stay",
    sourceId: SOURCE_ID,
    destination: "Edimburgo",
    startDate: checkin,
    dayIndexes: [0],
    dayIndex: 0,
    spanDays: 1,
  })
  assert.equal(links.kind, "none")
}

{
  const links = itemDiscoveryLinks({
    type: "activity",
    sourceId: SOURCE_ID,
    allowFromSource: true,
    destination: "Budapest",
    selectedPlaceLabel: "Budapest",
    startDate: checkin,
    dayIndexes: [0],
    dayIndex: 0,
    spanDays: 1,
    numTravelers: 2,
  })
  assert.equal(links.kind, "own")
  if (links.kind !== "own") throw new Error("expected own")
  assert.ok(links.activity?.civitatis)
  assert.ok(links.activity?.getYourGuide)
}

{
  const food = itemDiscoveryLinks({
    type: "food",
    sourceId: SOURCE_ID,
    allowFromSource: true,
    destination: "Budapest",
    startDate: checkin,
    dayIndexes: [0],
    dayIndex: 0,
    spanDays: 1,
  })
  assert.equal(food.kind, "none")

  const transport = itemDiscoveryLinks({
    type: "transport",
    sourceId: MANUAL_SOURCE_ID,
    destination: "Budapest",
    startDate: checkin,
    dayIndexes: [0],
    dayIndex: 0,
    spanDays: 1,
  })
  assert.equal(transport.kind, "none")
}

{
  const links = itemDiscoveryLinks({
    type: "stay",
    affiliateUrl: "n/a",
    sourceId: SOURCE_ID,
    allowFromSource: true,
    destination: "Budapest",
    startDate: checkin,
    dayIndexes: [0],
    dayIndex: 0,
    spanDays: 1,
  })
  assert.equal(links.kind, "own")
}

{
  const links = itemDiscoveryLinks({
    type: "stay",
    affiliateUrl: "/",
    sourceId: ASSISTANT_SOURCE_ID,
    destination: "Budapest",
    startDate: checkin,
    dayIndexes: [0],
    dayIndex: 0,
    spanDays: 1,
  })
  assert.equal(links.kind, "own")
}

{
  const links = itemDiscoveryLinks({
    type: "stay",
    sourceId: MANUAL_SOURCE_ID,
    destination: "  ",
    startDate: checkin,
    dayIndexes: [0],
    dayIndex: 0,
    spanDays: 1,
  })
  assert.equal(links.kind, "own")
  if (links.kind !== "own") throw new Error("expected own")
  assert.equal(links.hint, "Escribe una ciudad para buscar alojamiento.")
}

console.log("item-discovery-links.test.ts: ok")
