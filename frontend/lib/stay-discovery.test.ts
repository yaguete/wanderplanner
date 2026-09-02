import assert from "node:assert/strict"
import { MANUAL_SOURCE_ID } from "./item-provenance"
import { dateISOForDayIndex, toISODate } from "./trip-dates"
import {
  buildAirbnbSearchUrl,
  buildHomeExchangeSearchUrl,
  joinStayPlace,
  splitStayPlace,
  stayDiscoveryHrefs,
} from "./stay-discovery"

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

const checkin = futureISO(40)

assert.equal(buildAirbnbSearchUrl({ destination: "  " }), null)
{
  const href = buildAirbnbSearchUrl({
    destination: "Edimburgo",
    checkin,
    checkout: checkoutFor(checkin, 2),
    adults: 2,
    currency: "EUR",
  })
  assert.ok(href)
  const u = new URL(href)
  assert.equal(u.origin, "https://www.airbnb.es")
  assert.equal(u.pathname, "/s/homes")
  assert.equal(u.searchParams.get("query"), "Edimburgo")
  assert.equal(u.searchParams.get("locale"), "es")
  assert.equal(u.searchParams.get("adults"), "2")
  assert.equal(u.searchParams.get("currency"), "EUR")
  assert.equal(u.searchParams.get("checkin"), checkin)
  assert.equal(u.searchParams.get("checkout"), checkoutFor(checkin, 2))
}

{
  const href = buildAirbnbSearchUrl({ destination: "Edimburgo" })
  assert.ok(href)
  const q = new URL(href).searchParams
  assert.equal(q.get("checkin"), null)
  assert.equal(q.get("checkout"), null)
  assert.equal(q.get("adults"), "1")
}

assert.equal(buildHomeExchangeSearchUrl({ destination: "  " }), null)
{
  const href = buildHomeExchangeSearchUrl({
    destination: "Edimburgo, Reino Unido",
    checkin,
    checkout: checkoutFor(checkin, 2),
    adults: 2,
  })
  assert.ok(href)
  const u = new URL(href)
  assert.equal(u.origin, "https://www.homeexchange.com")
  // El `/es` no es cosmético: sin él «Edimburgo» geocodifica a México y
  // «Londres» a Francia. Ver la cabecera de stay-discovery.ts.
  assert.equal(u.pathname, "/es/search-v2/Edimburgo")
  assert.equal(u.searchParams.get("adults"), "2")
  assert.equal(
    u.searchParams.get("date_ranges"),
    `${checkin}_${checkoutFor(checkin, 2)}`,
  )
}

{
  // La ciudad es UN segmento de path: una barra no puede partir la ruta,
  // y los acentos viajan percent-encoded.
  const slashed = buildHomeExchangeSearchUrl({ destination: "Rímini/Riccione" })
  assert.ok(slashed)
  assert.equal(
    new URL(slashed).pathname,
    "/es/search-v2/R%C3%ADmini%2FRiccione",
  )
  const accented = buildHomeExchangeSearchUrl({ destination: "Milán" })
  assert.ok(accented)
  assert.equal(new URL(accented).pathname, "/es/search-v2/Mil%C3%A1n")
}

{
  const hrefs = stayDiscoveryHrefs({
    destination: "Edimburgo",
    startDate: checkin,
    dayIndexes: [0, 1],
    currency: "EUR",
    numTravelers: 2,
    sourceId: MANUAL_SOURCE_ID,
  })
  assert.ok(hrefs)
  assert.ok(hrefs.booking)
  assert.ok(hrefs.airbnb)
  assert.ok(hrefs.homeExchange)
  assert.equal(new URL(hrefs.booking).searchParams.get("ss"), "Edimburgo")
  assert.equal(new URL(hrefs.airbnb).searchParams.get("query"), "Edimburgo")
  assert.equal(new URL(hrefs.homeExchange).pathname, "/es/search-v2/Edimburgo")
}

{
  assert.equal(
    stayDiscoveryHrefs({
      destination: "Edimburgo",
      startDate: checkin,
      dayIndexes: [0],
      affiliateUrl: "https://www.booking.com/hotel/gb/foo.html?aid=99",
    }),
    null,
  )
}

{
  assert.equal(
    stayDiscoveryHrefs({
      destination: "Edimburgo",
      startDate: checkin,
      dayIndexes: [0],
      sourceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    }),
    null,
  )
}

{
  const hrefs = stayDiscoveryHrefs({
    destination: "  ",
    startDate: checkin,
    dayIndexes: [0],
    sourceId: MANUAL_SOURCE_ID,
  })
  assert.ok(hrefs)
  assert.equal(hrefs.booking, null)
  assert.equal(hrefs.airbnb, null)
  assert.equal(hrefs.homeExchange, null)
}

{
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const past = toISODate(d)
  const hrefs = stayDiscoveryHrefs({
    destination: "Edimburgo",
    startDate: past,
    dayIndexes: [0, 1],
    numTravelers: 2,
    sourceId: MANUAL_SOURCE_ID,
  })
  assert.ok(hrefs?.airbnb)
  assert.ok(hrefs.homeExchange)
  assert.equal(new URL(hrefs.airbnb).searchParams.get("checkin"), null)
  assert.equal(new URL(hrefs.homeExchange).searchParams.get("date_ranges"), null)
}

{
  assert.deepEqual(splitStayPlace(null), { city: "", address: "" })
  assert.deepEqual(splitStayPlace("Budapest"), { city: "Budapest", address: "" })
  assert.deepEqual(splitStayPlace("Király utca 15"), {
    city: "",
    address: "Király utca 15",
  })
  assert.deepEqual(splitStayPlace("Király utca 15, Budapest"), {
    city: "Budapest",
    address: "Király utca 15",
  })
  assert.equal(joinStayPlace("Budapest", ""), "Budapest")
  assert.equal(joinStayPlace("", "Király utca 15"), "Király utca 15")
  assert.equal(joinStayPlace("Budapest", "Király utca 15"), "Király utca 15, Budapest")
  assert.equal(
    joinStayPlace("Budapest", "Király utca 15, Budapest"),
    "Király utca 15, Budapest",
  )
  assert.equal(joinStayPlace("  ", "  "), null)
}

console.log("stay-discovery.test.ts: ok")
