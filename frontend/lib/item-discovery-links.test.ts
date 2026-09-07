import assert from "node:assert/strict"
import { ASSISTANT_SOURCE_ID, MANUAL_SOURCE_ID } from "./item-provenance"
import { dateISOForDayIndex, toISODate } from "./trip-dates"
import { BOOKING_AFFILIATE_AID } from "./booking-search"
import { itemDiscoveryLinks, partnerCtaLabel, rentalFormDiscoveryLinks, taskReserveAction } from "./item-discovery-links"

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

{
  assert.equal(
    taskReserveAction({
      type: "stay",
      sourceId: SOURCE_ID,
      affiliateUrl: "https://www.booking.com/hotel/x.html?aid=99",
    }),
    "partner",
  )
  assert.equal(
    taskReserveAction({ type: "stay", sourceId: SOURCE_ID, affiliateUrl: null }),
    "own-search",
  )
  assert.equal(
    taskReserveAction({ type: "stay", sourceId: MANUAL_SOURCE_ID, affiliateUrl: null }),
    "own-search",
  )
  assert.equal(
    taskReserveAction({ type: "activity", sourceId: ASSISTANT_SOURCE_ID, affiliateUrl: null }),
    "own-search",
  )
  assert.equal(
    taskReserveAction({
      type: "stay",
      sourceId: MANUAL_SOURCE_ID,
      affiliateUrl: "https://www.booking.com/hotel/x.html?aid=99",
    }),
    "partner",
  )
  assert.equal(
    taskReserveAction({ type: "food", sourceId: MANUAL_SOURCE_ID, affiliateUrl: null }),
    "none",
  )
assert.equal(
  taskReserveAction({ type: "activity", sourceId: SOURCE_ID, affiliateUrl: "n/a" }),
  "own-search",
)
assert.equal(
  taskReserveAction({
    type: "transport",
    sourceId: MANUAL_SOURCE_ID,
    affiliateUrl: null,
    route: {
      from: { label: "Edimburgo", coords: { lng: -3.19, lat: 55.95 }, kind: "city" },
      to: { label: "Edimburgo", coords: { lng: -3.19, lat: 55.95 }, kind: "city" },
      mode: "car",
      carUse: "rental",
    },
  }),
  "own-search",
)
assert.equal(
  taskReserveAction({
    type: "transport",
    sourceId: MANUAL_SOURCE_ID,
    affiliateUrl: null,
    route: {
      from: { label: "A", coords: { lng: 1, lat: 2 }, kind: "city" },
      to: { label: "B", coords: { lng: 3, lat: 4 }, kind: "city" },
      mode: "car",
      carUse: "owned",
    },
  }),
  "none",
)
assert.equal(
  partnerCtaLabel("https://www.discovercars.com/es?a_aid=lacosmopolilla"),
  "Ver en DiscoverCars",
)
}

{
  const links = itemDiscoveryLinks({
    type: "transport",
    sourceId: MANUAL_SOURCE_ID,
    destination: "Edimburgo",
    startDate: checkin,
    dayIndexes: [1, 2, 3, 4],
    dayIndex: 1,
    spanDays: 4,
    route: {
      from: { label: "Edimburgo", coords: { lng: -3.19, lat: 55.95 }, kind: "city" },
      to: { label: "Edimburgo", coords: { lng: -3.19, lat: 55.95 }, kind: "city" },
      mode: "car",
      carUse: "rental",
    },
  })
  assert.equal(links.kind, "own")
  if (links.kind !== "own") throw new Error("expected own")
  assert.equal(
    links.carRental?.discovercars,
    "https://www.discovercars.com/es?a_aid=lacosmopolilla",
  )
  assert.ok(links.carRental?.skyscanner)
  const wrap = new URL(links.carRental.skyscanner)
  assert.equal(wrap.hostname, "skyscanner.pxf.io")
  assert.equal(links.hint, undefined)
}

{
  const stored = "https://www.discovercars.com/es?a_aid=blogger"
  const links = itemDiscoveryLinks({
    type: "transport",
    affiliateUrl: stored,
    sourceId: SOURCE_ID,
    destination: "Edimburgo",
    startDate: checkin,
    dayIndexes: [0],
    dayIndex: 0,
    spanDays: 1,
    route: {
      from: { label: "Edimburgo", coords: { lng: -3.19, lat: 55.95 }, kind: "city" },
      to: { label: "Edimburgo", coords: { lng: -3.19, lat: 55.95 }, kind: "city" },
      mode: "car",
      carUse: "rental",
    },
  })
  assert.equal(links.kind, "partner")
  if (links.kind !== "partner") throw new Error("expected partner")
  assert.equal(links.affiliate, "partner")
  assert.ok(links.href.includes("discovercars.com"))
}

{
  const partner = rentalFormDiscoveryLinks({
    affiliateUrl: "https://www.discovercars.com/es?a_aid=source_partner",
    sourceId: SOURCE_ID,
    destination: "Edimburgo",
    startDate: checkin,
    pickupIndex: 1,
    spanDays: 4,
  })
  assert.equal(partner.kind, "partner")
  if (partner.kind !== "partner") throw new Error("expected partner")
  assert.equal(partner.affiliate, "partner")
  assert.equal(partner.href, "https://www.discovercars.com/es?a_aid=source_partner")
  assert.equal(partner.label, "Ver en DiscoverCars")

  const own = rentalFormDiscoveryLinks({
    affiliateUrl: null,
    sourceId: SOURCE_ID,
    destination: "Edimburgo",
    startDate: checkin,
    pickupIndex: 1,
    spanDays: 4,
    pickup: {
      label: "Edimburgo",
      coords: { lng: -3.19, lat: 55.95 },
      kind: "city",
    },
  })
  assert.equal(own.kind, "own")
  if (own.kind !== "own") throw new Error("expected own")
  assert.equal(own.carRental?.discovercars, "https://www.discovercars.com/es?a_aid=lacosmopolilla")
  assert.ok(own.carRental?.skyscanner)
  assert.equal(own.hint, undefined)
}

console.log("item-discovery-links.test.ts: ok")
