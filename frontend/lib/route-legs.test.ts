import assert from "node:assert/strict"
import type { Trip, UserDay, UserDayItem } from "@/types/itinerary"
import {
  buildRouteLegItem,
  dayHasNonLegContent,
  findLegItem,
  formatLegName,
  hasRouteLeg,
  parseRoutePlace,
  parseTransportRoute,
  reanchorRouteLegs,
  rescueLegsFromRemovedDays,
  sanitizeUserDayItem,
  suggestLegEndpoints,
  tripOriginFromCityAnchor,
  upsertLegInDays,
} from "./route-legs"
import { haversineKm, HUB_MAX_DISTANCE_KM } from "./mapbox"

function place(label: string, lng: number, lat: number) {
  return { label, coords: { lng, lat }, kind: "city" as const }
}

function makeDays(n: number, fill?: (i: number) => UserDayItem[]): UserDay[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `day-${i}`,
    label: "",
    items: fill?.(i) ?? [],
  }))
}

// ── Parsing defensivo ────────────────────────────────────────────────────────

assert.equal(parseRoutePlace(null), null)
assert.equal(parseRoutePlace({ label: "  ", coords: { lng: 1, lat: 2 } }), null)
assert.equal(parseRoutePlace({ label: "BCN", coords: [2, 41] }), null)
assert.equal(
  parseRoutePlace({ label: "BCN", coords: { lng: NaN, lat: 41 } }),
  null,
)
assert.deepEqual(
  parseRoutePlace({
    label: "  Barcelona  ",
    coords: { lng: 2.17, lat: 41.38 },
    kind: "city",
  }),
  place("Barcelona", 2.17, 41.38),
)
assert.equal(
  parseRoutePlace({
    label: "X",
    coords: { lng: 1, lat: 2 },
    kind: "spaceship",
  })?.kind,
  "other",
)

assert.equal(parseTransportRoute(null), null)
assert.equal(
  parseTransportRoute({ from: place("A", 1, 2) }),
  null,
)
assert.deepEqual(
  parseTransportRoute({
    from: place("Barcelona", 2.17, 41.38),
    to: place("Granada", -3.6, 37.17),
    mode: "avión",
    leg: "ida",
  }),
  {
    from: place("Barcelona", 2.17, 41.38),
    to: place("Granada", -3.6, 37.17),
    mode: null,
  },
)
assert.equal(
  parseTransportRoute({
    from: place("A", 1, 2),
    to: place("B", 3, 4),
    mode: "flight",
    leg: "outbound",
  })?.leg,
  "outbound",
)

{
  const item: UserDayItem = {
    id: "1",
    sourceItemId: "s",
    sourceId: "manual",
    type: "transport",
    name: "X",
    detail: null,
    sourceAuthor: "Tú",
    route: { from: place("A", 1, 2), to: { label: "", coords: { lng: 1, lat: 2 }, kind: "city" } } as never,
  }
  const cleaned = sanitizeUserDayItem(item)
  assert.equal(cleaned.route, undefined)
}

assert.equal(formatLegName("Barcelona", "Granada"), "Barcelona → Granada")

// ── Localización / upsert / reanclaje ────────────────────────────────────────

{
  const outbound = buildRouteLegItem({
    route: {
      from: place("Barcelona", 2.17, 41.38),
      to: place("Granada", -3.6, 37.17),
      mode: null,
      leg: "outbound",
    },
  })
  assert.equal(outbound.name, "Barcelona → Granada")
  assert.equal(outbound.type, "transport")
  assert.equal(outbound.route?.leg, "outbound")
  assert.deepEqual(outbound.coords, place("Granada", -3.6, 37.17).coords)

  let days = makeDays(3)
  days = upsertLegInDays(days, outbound)
  assert.equal(days[0]!.items[0]!.id, outbound.id)
  assert.ok(hasRouteLeg(days, "outbound"))
  assert.equal(hasRouteLeg(days, "return"), false)

  // Upsert no duplica.
  const edited = buildRouteLegItem({
    route: {
      from: place("Barcelona", 2.17, 41.38),
      to: place("Granada", -3.6, 37.17),
      mode: "train",
      leg: "outbound",
    },
    existingId: outbound.id,
    existingSourceItemId: outbound.sourceItemId,
  })
  days = upsertLegInDays(days, edited)
  assert.equal(days[0]!.items.filter((i) => i.route?.leg === "outbound").length, 1)
  assert.equal(days[0]!.items[0]!.route?.mode, "train")

  const returnItem = buildRouteLegItem({
    route: {
      from: place("Granada", -3.6, 37.17),
      to: place("Barcelona", 2.17, 41.38),
      mode: null,
      leg: "return",
    },
  })
  days = upsertLegInDays(days, returnItem)
  assert.equal(days[2]!.items[days[2]!.items.length - 1]!.route?.leg, "return")

  // Reanclaje: simular que la vuelta quedó en el día 0 (viaje de 1 día → 3).
  days = [
    {
      id: "d0",
      label: "",
      items: [outbound, returnItem],
    },
    { id: "d1", label: "", items: [] },
    { id: "d2", label: "", items: [] },
  ]
  const reanchored = reanchorRouteLegs(days)
  assert.equal(findLegItem(reanchored, "outbound")?.dayIndex, 0)
  assert.equal(findLegItem(reanchored, "return")?.dayIndex, 2)
  assert.equal(reanchored[0]!.items[0]!.route?.leg, "outbound")
}

// Viaje de un día: ambas cajas / ambos legs caben.
{
  const outbound = buildRouteLegItem({
    route: {
      from: place("A", 1, 2),
      to: place("B", 3, 4),
      mode: null,
      leg: "outbound",
    },
  })
  const ret = buildRouteLegItem({
    route: {
      from: place("B", 3, 4),
      to: place("A", 1, 2),
      mode: null,
      leg: "return",
    },
  })
  let days = makeDays(1)
  days = upsertLegInDays(days, outbound)
  days = upsertLegInDays(days, ret)
  assert.equal(days.length, 1)
  assert.equal(days[0]!.items.length, 2)
  assert.equal(days[0]!.items[0]!.route?.leg, "outbound")
  assert.equal(days[0]!.items[1]!.route?.leg, "return")
}

// Propuesta de extremos.
{
  const trip: Pick<Trip, "origin" | "name" | "countries" | "days"> = {
    origin: {
      label: "Barcelona",
      countryCode: "ES",
      coords: { lng: 2.17, lat: 41.38 },
    },
    name: "Alpujarra",
    countries: ["ES"],
    days: [
      {
        id: "d1",
        label: "",
        items: [
          {
            id: "stay-1",
            sourceItemId: "s",
            sourceId: "src",
            type: "stay",
            name: "Hotel Sol",
            detail: null,
            sourceAuthor: "Autor",
            region: "Granada",
            coords: { lng: -3.6, lat: 37.17 },
          },
        ],
      },
      { id: "d2", label: "", items: [] },
    ],
  }
  const out = suggestLegEndpoints(trip, "outbound")
  assert.equal(out.from?.label, "Barcelona")
  assert.equal(out.to?.label, "Granada")
  const ret = suggestLegEndpoints(trip, "return")
  assert.equal(ret.to?.label, "Barcelona")
}

// Partner: legs no cuentan como contenido.
{
  const empty: UserDay = { id: "d", label: "", items: [] }
  assert.equal(dayHasNonLegContent(empty), false)

  const withLeg: UserDay = {
    id: "d",
    label: "",
    items: [
      buildRouteLegItem({
        route: {
          from: place("A", 1, 2),
          to: place("B", 3, 4),
          mode: null,
          leg: "outbound",
        },
      }),
    ],
  }
  assert.equal(dayHasNonLegContent(withLeg), false)

  const withStay: UserDay = {
    id: "d",
    label: "",
    items: [
      {
        id: "s",
        sourceItemId: "x",
        sourceId: "src",
        type: "stay",
        name: "Hotel",
        detail: null,
        sourceAuthor: "A",
      },
    ],
  }
  assert.equal(dayHasNonLegContent(withStay), true)
}

// Haversine / radios de hub (puros, sin red).
{
  const bcn = { lng: 2.17, lat: 41.38 }
  const mad = { lng: -3.7, lat: 40.4 }
  const d = haversineKm(bcn, mad)
  assert.ok(d > 400 && d < 600)
  assert.equal(HUB_MAX_DISTANCE_KM.airport, 180)
  assert.equal(HUB_MAX_DISTANCE_KM.station, 80)
  assert.equal(HUB_MAX_DISTANCE_KM.busStation, 50)
  // Mismo punto → 0.
  assert.equal(haversineKm(bcn, bcn), 0)
}

// trip.origin nunca sale de un aeropuerto (§8.2).
{
  const city = place("Barcelona", 2.17, 41.38)
  const airport = {
    label: "Aeropuerto de Barcelona",
    coords: { lng: 2.07, lat: 41.3 },
    kind: "airport" as const,
  }
  assert.deepEqual(tripOriginFromCityAnchor(city), {
    label: "Barcelona",
    countryCode: null,
    coords: city.coords,
  })
  assert.equal(tripOriginFromCityAnchor(airport), null)
  assert.equal(tripOriginFromCityAnchor(null), null)
  // Simula flujo: ciudad → avión → aceptar hub; el ancla sigue siendo la ciudad.
  const cityAnchor = city
  const routeFromAfterHub = airport
  assert.equal(routeFromAfterHub.kind, "airport")
  assert.equal(tripOriginFromCityAnchor(cityAnchor)?.label, "Barcelona")
}

// Borrar el último día rescata el tramo de vuelta (y su coste).
{
  const outbound = buildRouteLegItem({
    route: {
      from: place("Barcelona", 2.17, 41.38),
      to: place("Granada", -3.6, 37.17),
      mode: "flight",
      leg: "outbound",
    },
  })
  const ret = buildRouteLegItem({
    route: {
      from: place("Granada", -3.6, 37.17),
      to: place("Barcelona", 2.17, 41.38),
      mode: "flight",
      leg: "return",
    },
  })
  const returnId = ret.id

  const before = makeDays(3, (i) => {
    if (i === 0) return [outbound]
    if (i === 2) return [ret]
    return []
  })
  const after = before.slice(0, 2) // se borra el día 3 (vuelta)
  const rescued = rescueLegsFromRemovedDays(before, after)
  assert.equal(rescued.length, 2)
  const found = findLegItem(rescued, "return")
  assert.ok(found)
  assert.equal(found!.item.id, returnId) // misma instancia → coste en tasks intacto
  assert.equal(found!.dayIndex, 1) // reanclado al nuevo último día
  // Ida intacta.
  assert.ok(findLegItem(rescued, "outbound"))
}

console.log("route-legs: ok")
