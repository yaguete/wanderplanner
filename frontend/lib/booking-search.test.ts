import assert from "node:assert/strict"
import { ASSISTANT_SOURCE_ID, MANUAL_SOURCE_ID } from "./item-provenance"
import {
  BOOKING_AFFILIATE_AID,
  BOOKING_AFFILIATE_LABEL,
  buildAssistantBookingSearchUrl,
  isOwnBookingAffiliateUrl,
  resolveStayAffiliateUrl,
  stayReserveHref,
} from "./booking-search"

function params(href: string | null): URLSearchParams {
  assert.ok(href)
  return new URL(href).searchParams
}

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
    startDate: "2027-09-14",
    dayIndexes: [0, 1],
    currency: "eur",
    numTravelers: 3,
  })
  const q = params(href)
  assert.equal(q.get("aid"), BOOKING_AFFILIATE_AID)
  assert.equal(q.get("ss"), "Hotel Goldener Adler Innsbruck")
  assert.equal(q.get("checkin"), "2027-09-14")
  assert.equal(q.get("checkout"), "2027-09-16")
  assert.equal(q.get("selected_currency"), "EUR")
  assert.equal(q.get("group_adults"), "3")
}

{
  const href = stayReserveHref({
    type: "stay",
    name: "Full Moon Budapest",
    region: "Budapest",
    sourceId: MANUAL_SOURCE_ID,
    startDate: "2026-08-28",
    dayIndexes: [0, 1, 2],
    currency: "EUR",
    numTravelers: 2,
  })
  const q = params(href)
  assert.equal(q.get("aid"), BOOKING_AFFILIATE_AID)
  assert.equal(q.get("ss"), "Full Moon Budapest")
  assert.equal(q.get("checkin"), "2026-08-28")
  assert.equal(q.get("checkout"), "2026-08-31")
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
    startDate: "2027-09-14",
    dayIndexes: [0],
    currency: "USD",
    numTravelers: 4,
  })
  const q = params(href)
  assert.equal(q.get("aid"), "12345")
  assert.equal(q.get("label"), "blog")
  assert.equal(q.get("checkin"), "2027-09-14")
  assert.equal(q.get("checkout"), "2027-09-15")
  assert.equal(q.get("selected_currency"), null)
  assert.equal(q.get("group_adults"), null)
}

console.log("booking-search.test.ts: ok")
