import assert from "node:assert/strict"
import {
  FLIGHT_SEARCH_TRACKING_URL,
  flightSearchHrefForItem,
  isMirroredFlightRoundtrip,
} from "./flight-search"
import type { RoutePlace, RoutePlaceKind, TransportRoute, UserDay } from "@/types/itinerary"

function place(
  label: string,
  lng: number,
  lat: number,
  kind: RoutePlaceKind = "city",
): RoutePlace {
  return { label, coords: { lng, lat }, kind }
}

const BCN = place("Barcelona", 2.173, 41.385)
const BUD = place("Budapest", 19.04, 47.498)
const VIE = place("Vienna", 16.373, 48.208)
const OCEAN = place("Mar", -40, 0)

function route(partial: Partial<TransportRoute> & Pick<TransportRoute, "from" | "to">): TransportRoute {
  return { mode: "flight", ...partial }
}

function daysWith(
  outbound: TransportRoute,
  returning?: TransportRoute,
): UserDay[] {
  return [
    {
      id: "d0",
      label: "",
      items: [
        {
          id: "out",
          sourceItemId: "out",
          sourceId: "manual",
          type: "transport",
          name: "Barcelona → Budapest",
          detail: null,
          sourceAuthor: "",
          route: outbound,
        },
      ],
    },
    { id: "d1", label: "", items: [] },
    { id: "d2", label: "", items: [] },
    { id: "d3", label: "", items: [] },
    { id: "d4", label: "", items: [] },
    { id: "d5", label: "", items: [] },
    {
      id: "d6",
      label: "",
      items: returning
        ? [
            {
              id: "ret",
              sourceItemId: "ret",
              sourceId: "manual",
              type: "transport",
              name: "Vuelta",
              detail: null,
              sourceAuthor: "",
              route: returning,
            },
          ]
        : [],
    },
  ]
}

const trip7 = {
  startDate: "2027-09-14",
  numDays: 7,
  numTravelers: 2,
}

function assertSkyscannerHref(
  href: string | undefined,
  expected: {
    page: "day-view" | "calendar-month-view"
    origin: string
    destination: string
    outboundDate?: string
    inboundDate?: string
    adults: string
  },
) {
  assert.ok(href)
  const wrap = new URL(href)
  assert.equal(`${wrap.origin}${wrap.pathname}`, FLIGHT_SEARCH_TRACKING_URL)
  const dest = wrap.searchParams.get("u")
  assert.ok(dest, "missing Impact u=")
  const inner = new URL(dest)
  assert.equal(inner.origin, "https://www.skyscanner.net")
  assert.equal(inner.pathname, `/g/referrals/v1/flights/${expected.page}`)
  assert.equal(inner.searchParams.get("origin"), expected.origin)
  assert.equal(inner.searchParams.get("destination"), expected.destination)
  assert.equal(inner.searchParams.get("adultsv2"), expected.adults)
  assert.equal(inner.searchParams.get("locale"), "es-ES")
  assert.equal(inner.searchParams.get("market"), "ES")
  assert.equal(inner.searchParams.get("currency"), "EUR")
  if (expected.page === "day-view") {
    assert.equal(inner.searchParams.get("outboundDate"), expected.outboundDate ?? null)
    assert.equal(inner.searchParams.get("inboundDate"), expected.inboundDate ?? null)
    assert.equal(inner.searchParams.get("cabinclass"), "economy")
  } else {
    assert.equal(inner.searchParams.get("outboundDate"), null)
    assert.equal(inner.searchParams.get("inboundDate"), null)
    assert.equal(inner.searchParams.get("cabinclass"), null)
  }
}

// Tren / coche / taxi / bus / ferry / sin modo → null.
for (const mode of ["train", "car", "taxi", "bus", "ferry", null] as const) {
  assert.equal(
    flightSearchHrefForItem({
      route: route({ from: BCN, to: BUD, mode, leg: "outbound" }),
      dayIndex: 0,
      trip: trip7,
      days: daysWith(route({ from: BCN, to: BUD, mode, leg: "outbound" })),
    }),
    null,
  )
}

// Sin IATA en un extremo → null.
assert.equal(
  flightSearchHrefForItem({
    route: route({ from: BCN, to: OCEAN, leg: "outbound" }),
    dayIndex: 0,
    trip: trip7,
    days: daysWith(route({ from: BCN, to: OCEAN, leg: "outbound" })),
  }),
  null,
)

// Fixture URL exacta: ida BCN→BUD, 7 días, 2 viajeros, sin tramo de retorno
// → round-trip con startDate y endDate (criterio de aceptación).
const accept = flightSearchHrefForItem({
  route: route({ from: BCN, to: BUD, leg: "outbound" }),
  dayIndex: 0,
  trip: trip7,
  days: daysWith(route({ from: BCN, to: BUD, leg: "outbound" })),
})
assert.equal(accept?.from, "BCN")
assert.equal(accept?.to, "BUD")
assert.equal(accept?.roundTrip, true)
assertSkyscannerHref(accept?.href, {
  page: "day-view",
  origin: "BCN",
  destination: "BUD",
  outboundDate: "2027-09-14",
  inboundDate: "2027-09-20",
  adults: "2",
})

// Retorno en tren → solo ida, aunque los extremos reflejen.
{
  const out = route({ from: BCN, to: BUD, leg: "outbound" })
  const back = route({ from: BUD, to: BCN, mode: "train", leg: "return" })
  const hit = flightSearchHrefForItem({
    route: out,
    dayIndex: 0,
    trip: trip7,
    days: daysWith(out, back),
  })
  assertSkyscannerHref(hit?.href, {
    page: "day-view",
    origin: "BCN",
    destination: "BUD",
    outboundDate: "2027-09-14",
    adults: "2",
  })
  assert.equal(hit?.roundTrip, false)
}

// Traslado interno → solo ida.
{
  const internal = route({ from: BCN, to: BUD })
  const hit = flightSearchHrefForItem({
    route: internal,
    dayIndex: 3,
    trip: trip7,
    days: [{ id: "x", label: "", items: [] }],
  })
  assertSkyscannerHref(hit?.href, {
    page: "day-view",
    origin: "BCN",
    destination: "BUD",
    outboundDate: "2027-09-17",
    adults: "2",
  })
}

// leg return → solo ida.
{
  const back = route({ from: BUD, to: BCN, leg: "return" })
  const hit = flightSearchHrefForItem({
    route: back,
    dayIndex: 6,
    trip: trip7,
    days: daysWith(route({ from: BCN, to: BUD, leg: "outbound" }), back),
  })
  assertSkyscannerHref(hit?.href, {
    page: "day-view",
    origin: "BUD",
    destination: "BCN",
    outboundDate: "2027-09-20",
    adults: "2",
  })
}

// Open-jaw (ida BCN→BUD, vuelta VIE→BCN) → solo ida.
{
  const out = route({ from: BCN, to: BUD, leg: "outbound" })
  const back = route({ from: VIE, to: BCN, leg: "return" })
  const hit = flightSearchHrefForItem({
    route: out,
    dayIndex: 0,
    trip: trip7,
    days: daysWith(out, back),
  })
  assertSkyscannerHref(hit?.href, {
    page: "day-view",
    origin: "BCN",
    destination: "BUD",
    outboundDate: "2027-09-14",
    adults: "2",
  })
}

// Ida + retorno que refleja (vuelo) → round-trip con el día del retorno.
{
  const out = route({ from: BCN, to: BUD, leg: "outbound" })
  const back = route({ from: BUD, to: BCN, leg: "return" })
  const hit = flightSearchHrefForItem({
    route: out,
    dayIndex: 0,
    trip: trip7,
    days: daysWith(out, back),
  })
  assertSkyscannerHref(hit?.href, {
    page: "day-view",
    origin: "BCN",
    destination: "BUD",
    outboundDate: "2027-09-14",
    inboundDate: "2027-09-20",
    adults: "2",
  })
}

// Fecha pasada → sin fechas, con origen/destino/pasajeros.
{
  const hit = flightSearchHrefForItem({
    route: route({ from: BCN, to: BUD, leg: "outbound" }),
    dayIndex: 0,
    trip: { startDate: "2020-01-01", numDays: 7, numTravelers: 2 },
    days: daysWith(route({ from: BCN, to: BUD, leg: "outbound" })),
  })
  assertSkyscannerHref(hit?.href, {
    page: "calendar-month-view",
    origin: "BCN",
    destination: "BUD",
    adults: "2",
  })
}

// numTravelers 0 → adults=1; 14 → adults=9.
{
  const hit1 = flightSearchHrefForItem({
    route: route({ from: BCN, to: BUD, leg: "outbound" }),
    dayIndex: 0,
    trip: { startDate: null, numDays: 7, numTravelers: 0 },
    days: daysWith(route({ from: BCN, to: BUD, leg: "outbound" })),
  })
  assertSkyscannerHref(hit1?.href, {
    page: "calendar-month-view",
    origin: "BCN",
    destination: "BUD",
    adults: "1",
  })

  const hit9 = flightSearchHrefForItem({
    route: route({ from: BCN, to: BUD, leg: "outbound" }),
    dayIndex: 0,
    trip: { startDate: null, numDays: 7, numTravelers: 14 },
    days: daysWith(route({ from: BCN, to: BUD, leg: "outbound" })),
  })
  assertSkyscannerHref(hit9?.href, {
    page: "calendar-month-view",
    origin: "BCN",
    destination: "BUD",
    adults: "9",
  })
}

// Ida y vuelta espejadas en avión; open-jaw y vuelta en tren no.
{
  const mirrored = daysWith(
    route({ from: BCN, to: BUD, leg: "outbound" }),
    route({ from: BUD, to: BCN, leg: "return" }),
  )
  assert.equal(isMirroredFlightRoundtrip(mirrored), true)

  const openJaw = daysWith(
    route({ from: BCN, to: BUD, leg: "outbound" }),
    route({ from: VIE, to: BCN, leg: "return" }),
  )
  assert.equal(isMirroredFlightRoundtrip(openJaw), false)

  const trainBack = daysWith(
    route({ from: BCN, to: BUD, leg: "outbound" }),
    route({ from: BUD, to: BCN, mode: "train", leg: "return" }),
  )
  assert.equal(isMirroredFlightRoundtrip(trainBack), false)
}

console.log("flight-search.test.ts: ok")
