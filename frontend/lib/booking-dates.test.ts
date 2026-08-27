import assert from "node:assert/strict"
import {
  bookingStayHref,
  isBookingStayUrl,
  stayDatesFromDayIndexes,
  stayDayIndexesForItem,
  withBookingStayDates,
} from "./booking-dates"
import type { UserDay, UserDayItem } from "@/types/itinerary"

const BOOKING =
  "https://www.booking.com/hotel/es/foo.es.html?aid=12345&label=blog#hotelTmpl"
const OTHER = "https://example.com/hotel?aid=12345"

function params(href: string | null): URLSearchParams {
  assert.ok(href)
  return new URL(href).searchParams
}

assert.equal(isBookingStayUrl(BOOKING), true)
assert.equal(isBookingStayUrl("https://booking.es/hotel/x"), true)
assert.equal(isBookingStayUrl(OTHER), false)
assert.equal(isBookingStayUrl("not a url"), false)
assert.equal(isBookingStayUrl(null), false)

// Sin fechas o no Booking → idéntico.
assert.equal(withBookingStayDates(BOOKING, null, "2027-09-16"), BOOKING)
assert.equal(withBookingStayDates(BOOKING, "2027-09-14", null), BOOKING)
assert.equal(withBookingStayDates(OTHER, "2027-09-14", "2027-09-16"), OTHER)
assert.equal(withBookingStayDates(null, "2027-09-14", "2027-09-16"), null)

// Checkout no posterior al checkin.
assert.equal(withBookingStayDates(BOOKING, "2027-09-14", "2027-09-14"), BOOKING)

// Check-in pasado → no inyecta.
assert.equal(withBookingStayDates(BOOKING, "2020-01-01", "2020-01-03"), BOOKING)

{
  const href = withBookingStayDates(BOOKING, "2027-09-14", "2027-09-16")
  assert.ok(href)
  const u = new URL(href)
  assert.equal(u.searchParams.get("aid"), "12345")
  assert.equal(u.searchParams.get("label"), "blog")
  assert.equal(u.searchParams.get("checkin"), "2027-09-14")
  assert.equal(u.searchParams.get("checkout"), "2027-09-16")
  assert.equal(u.hash, "#hotelTmpl")
  assert.equal(u.pathname, "/hotel/es/foo.es.html")
}

// Pisa fechas que vinieran en el artículo.
{
  const stale =
    "https://www.booking.com/hotel/es/foo.es.html?aid=99&checkin=2024-01-01&checkout=2024-01-05"
  const href = withBookingStayDates(stale, "2027-09-14", "2027-09-17")
  const q = params(href)
  assert.equal(q.get("aid"), "99")
  assert.equal(q.get("checkin"), "2027-09-14")
  assert.equal(q.get("checkout"), "2027-09-17")
}

assert.deepEqual(stayDatesFromDayIndexes("2027-09-14", [0, 1, 2]), {
  checkin: "2027-09-14",
  checkout: "2027-09-17",
})
assert.deepEqual(stayDatesFromDayIndexes("2027-09-14", [0]), {
  checkin: "2027-09-14",
  checkout: "2027-09-15",
})
assert.equal(stayDatesFromDayIndexes(null, [0]), null)
assert.equal(stayDatesFromDayIndexes("2027-09-14", []), null)

function stay(name: string): UserDayItem {
  return {
    id: name,
    sourceItemId: name,
    sourceId: "manual",
    type: "stay",
    name,
    detail: null,
    sourceAuthor: "",
  }
}

const days: UserDay[] = [
  { id: "d0", label: "", items: [stay("Hotel Foo")] },
  { id: "d1", label: "", items: [stay("Hotel Foo")] },
  { id: "d2", label: "", items: [] },
]
assert.deepEqual(stayDayIndexesForItem(days, stay("Hotel Foo")), [0, 1])
assert.deepEqual(stayDayIndexesForItem(days, { ...stay("X"), type: "activity" }), [])

{
  const spanned = stay("Full Moon")
  spanned.spanDays = 3
  const oneDay: UserDay[] = [
    { id: "d0", label: "", items: [spanned] },
    { id: "d1", label: "", items: [] },
    { id: "d2", label: "", items: [] },
    { id: "d3", label: "", items: [] },
  ]
  assert.deepEqual(stayDayIndexesForItem(oneDay, spanned), [0, 1, 2])
}

{
  const href = bookingStayHref({
    href: BOOKING,
    startDate: "2027-09-14",
    dayIndexes: [0, 1],
  })
  const q = params(href)
  assert.equal(q.get("aid"), "12345")
  assert.equal(q.get("checkin"), "2027-09-14")
  assert.equal(q.get("checkout"), "2027-09-16")
}

console.log("booking-dates.test.ts: ok")
