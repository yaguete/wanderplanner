import assert from "node:assert/strict"
import { ASSISTANT_SOURCE_ID, MANUAL_SOURCE_ID } from "./item-provenance"
import { dateISOForDayIndex, toISODate } from "./trip-dates"
import {
  BOOKING_AFFILIATE_AID,
  BOOKING_AFFILIATE_LABEL,
  buildAssistantBookingSearchUrl,
  buildDestinationBookingSearchUrl,
  isOwnBookingAffiliateUrl,
  resolveStayAffiliateUrl,
  stayFormSearchHref,
  stayReserveHref,
} from "./booking-search"

function params(href: string | null): URLSearchParams {
  assert.ok(href)
  return new URL(href).searchParams
}

/**
 * Fechas relativas a hoy, nunca constantes: `booking-dates` no pinta checkin/checkout
 * cuando el check-in ya pasó (`checkin < todayISO()`), así que una fecha fija convierte
 * el test en una bomba de relojería — el 29 ago 2026 reventó por un `"2026-08-28"`.
 */
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

const checkinA = futureISO(30)
const checkinB = futureISO(60)
const checkinC = futureISO(90)

{
  assert.equal(buildAssistantBookingSearchUrl({ name: "   " }), null)
  const href = buildAssistantBookingSearchUrl({
    name: "Hotel Goldener Adler",
    region: "Innsbruck",
  })
  assert.ok(href)
  const u = new URL(href)
  assert.equal(u.origin, "https://www.booking.com")
  assert.equal(u.pathname, "/searchresults.es.html")
  const q = u.searchParams
  assert.equal(q.get("aid"), BOOKING_AFFILIATE_AID)
  assert.equal(q.get("label"), BOOKING_AFFILIATE_LABEL)
  assert.equal(q.get("lang"), "es")
  assert.equal(q.get("ss"), "Hotel Goldener Adler Innsbruck")
  assert.equal(q.get("checkin"), null)
  assert.equal(q.get("checkout"), null)
  assert.equal(q.get("group_adults"), null)
}

{
  const href = buildAssistantBookingSearchUrl({
    name: "Gasthof Innsbruck",
    region: "Innsbruck",
  })
  assert.equal(params(href).get("ss"), "Gasthof Innsbruck")
}

{
  const blogger =
    "https://www.booking.com/hotel/at/foo.es.html?aid=12345&label=blog"
  assert.equal(isOwnBookingAffiliateUrl(blogger), false)
  const ours = buildAssistantBookingSearchUrl({ name: "Hotel Foo" })
  assert.equal(isOwnBookingAffiliateUrl(ours), true)
  assert.equal(isOwnBookingAffiliateUrl("https://example.com/?aid=1607597"), false)
}

{
  const stored = "https://www.booking.com/hotel/at/blog.es.html?aid=999"
  assert.equal(
    resolveStayAffiliateUrl({
      type: "stay",
      name: "Hotel Blog",
      sourceId: ASSISTANT_SOURCE_ID,
      affiliateUrl: stored,
    }),
    stored,
  )
  const synthesized = resolveStayAffiliateUrl({
    type: "stay",
    name: "Hotel Nuevo",
    region: "Hallstatt",
    sourceId: ASSISTANT_SOURCE_ID,
  })
  assert.equal(params(synthesized).get("ss"), "Hotel Nuevo Hallstatt")
  assert.equal(params(synthesized).get("aid"), BOOKING_AFFILIATE_AID)
  const manual = resolveStayAffiliateUrl({
    type: "stay",
    name: "Hotel Manual",
    region: "Budapest",
    sourceId: MANUAL_SOURCE_ID,
  })
  assert.equal(params(manual).get("ss"), "Hotel Manual Budapest")
  assert.equal(params(manual).get("aid"), BOOKING_AFFILIATE_AID)
  assert.equal(
    resolveStayAffiliateUrl({
      type: "stay",
      name: "Hotel Fuente",
      sourceId: "src-1",
    }),
    null,
  )
  assert.equal(
    resolveStayAffiliateUrl({
      type: "activity",
      name: "Mirador",
      sourceId: ASSISTANT_SOURCE_ID,
    }),
    null,
  )
}

{
  const href = stayReserveHref({
    type: "stay",
    name: "Hotel Goldener Adler",
    region: "Innsbruck",
    sourceId: ASSISTANT_SOURCE_ID,
    startDate: checkinA,
    dayIndexes: [0, 1],
    currency: "eur",
    numTravelers: 3,
  })
  const q = params(href)
  assert.equal(q.get("aid"), BOOKING_AFFILIATE_AID)
  assert.equal(q.get("ss"), "Hotel Goldener Adler Innsbruck")
  assert.equal(q.get("checkin"), checkinA)
  assert.equal(q.get("checkout"), checkoutFor(checkinA, 2))
  assert.equal(q.get("selected_currency"), "EUR")
  assert.equal(q.get("group_adults"), "3")
}

{
  const href = stayReserveHref({
    type: "stay",
    name: "Full Moon Budapest",
    region: "Budapest",
    sourceId: MANUAL_SOURCE_ID,
    startDate: checkinB,
    dayIndexes: [0, 1, 2],
    currency: "EUR",
    numTravelers: 2,
  })
  const q = params(href)
  assert.equal(q.get("aid"), BOOKING_AFFILIATE_AID)
  assert.equal(q.get("ss"), "Full Moon Budapest")
  assert.equal(q.get("checkin"), checkinB)
  assert.equal(q.get("checkout"), checkoutFor(checkinB, 3))
  assert.equal(q.get("selected_currency"), "EUR")
  assert.equal(q.get("group_adults"), "2")
}

{
  const blogger =
    "https://www.booking.com/hotel/at/foo.es.html?aid=12345&label=blog"
  const href = stayReserveHref({
    type: "stay",
    name: "Hotel Blog",
    sourceId: "src-1",
    affiliateUrl: blogger,
    startDate: checkinC,
    dayIndexes: [0],
    currency: "USD",
    numTravelers: 4,
  })
  const q = params(href)
  assert.equal(q.get("aid"), "12345")
  assert.equal(q.get("label"), "blog")
  assert.equal(q.get("checkin"), checkinC)
  assert.equal(q.get("checkout"), checkoutFor(checkinC, 1))
  assert.equal(q.get("selected_currency"), null)
  assert.equal(q.get("group_adults"), null)
}

{
  assert.equal(buildDestinationBookingSearchUrl("   "), null)
  const href = buildDestinationBookingSearchUrl("Budapest")
  const q = params(href)
  assert.equal(q.get("ss"), "Budapest")
  assert.equal(q.get("aid"), BOOKING_AFFILIATE_AID)
  assert.equal(q.get("label"), BOOKING_AFFILIATE_LABEL)
  assert.equal(q.get("checkin"), null)
}

{
  const href = stayFormSearchHref({
    destination: "Budapest",
    startDate: checkinA,
    dayIndexes: [0, 1, 2],
    currency: "EUR",
    numTravelers: 2,
  })
  const q = params(href)
  assert.equal(q.get("ss"), "Budapest")
  assert.equal(q.get("aid"), BOOKING_AFFILIATE_AID)
  assert.equal(q.get("checkin"), checkinA)
  assert.equal(q.get("checkout"), checkoutFor(checkinA, 3))
  assert.equal(q.get("selected_currency"), "EUR")
  assert.equal(q.get("group_adults"), "2")
}

{
  assert.equal(
    stayFormSearchHref({
      destination: "  ",
      startDate: checkinA,
      dayIndexes: [0],
    }),
    null,
  )
}

{
  assert.equal(
    stayFormSearchHref({
      destination: "Budapest",
      startDate: checkinA,
      dayIndexes: [0],
      affiliateUrl: "https://www.booking.com/hotel/hu/foo.html?aid=99",
    }),
    null,
  )
}

{
  assert.equal(
    stayFormSearchHref({
      destination: "Budapest",
      startDate: checkinA,
      dayIndexes: [0],
      sourceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    }),
    null,
  )
}

{
  const href = stayFormSearchHref({
    destination: "Budapest",
    startDate: checkinA,
    dayIndexes: [0],
    sourceId: MANUAL_SOURCE_ID,
  })
  assert.ok(href)
  assert.equal(params(href).get("ss"), "Budapest")
}

{
  assert.equal(
    resolveStayAffiliateUrl({
      type: "stay",
      name: "Hotel Fuente",
      region: "Innsbruck",
      sourceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    }),
    null,
  )
}

console.log("booking-search.test.ts: ok")
