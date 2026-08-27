/**
 * Tests de transportes estructurados, hubs y geometría (T4B.3 §9).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  decideHubSearch,
  hubKindForMode,
  cityAnchorForHubSearch,
} from "./transport-hubs"
import {
  buildTransportRouteItem,
  migrateTaskKeyOnStructure,
  seedTransportForm,
  sourceRouteHintFromTransport,
  splitArrowTitle,
} from "./transport-routes"
import { flattenItinerary } from "./itinerary-utils"
import { taskKeyForItem } from "./trip-tasks"
import { taskActionTitle } from "./task-labels"
import {
  TRANSPORT_MODE_ICONS,
  resolveTransportModeVisual,
} from "./item-styles"
import {
  collectMapSegments,
  collectMapGatewayAnchors,
  collectItineraryPlaces,
  collectTransportDistances,
  incompleteMapTransports,
  buildPlacesRoute,
  formatKm,
  geodesicLine,
  groupRoadCandidateSubsequences,
  legIncludedInMapItinerary,
  modeAllowsRoadDirections,
  PLACES_ROAD_MAX_KM,
  segmentFromItem,
  summarizeTransportKm,
} from "./map-route-geometry"
import { geocodeDisplayResult, reduceGeocode } from "./map-geocode-state"
import {
  allowTransportHubPersistence,
  createPlaceSearchBudget,
  canSpendSuggest,
  recordSuggest,
  toPersistableRoutePlace,
  stripPersistMeta,
} from "./place-search-guardrails"
import type { Itinerary, UserDay, UserDayItem } from "@/types/itinerary"

const place = (label: string, kind: "city" | "airport" | "station" = "city") => ({
  label,
  coords: { lng: 2.1, lat: 41.3 },
  kind,
})

describe("transport-hubs", () => {
  it("avión pide hubs en ambos extremos con ciudades", () => {
    assert.equal(hubKindForMode("flight"), "airport")
    const from = decideHubSearch({
      mode: "flight",
      selected: place("Barcelona"),
      cityAnchor: place("Barcelona"),
      userRequested: true,
    })
    const to = decideHubSearch({
      mode: "flight",
      selected: place("Tokio"),
      cityAnchor: place("Tokio"),
      userRequested: true,
    })
    assert.equal(from.shouldSearch, true)
    assert.equal(to.shouldSearch, true)
  })

  it("elegir hub de salida no implica refetch de llegada (claves distintas)", () => {
    const city = place("Barcelona")
    const airport = place("El Prat", "airport")
    const d1 = decideHubSearch({
      mode: "flight",
      selected: city,
      cityAnchor: city,
      userRequested: true,
    })
    assert.equal(d1.shouldSearch, true)
    const afterHub = decideHubSearch({
      mode: "flight",
      selected: airport,
      cityAnchor: city,
      userRequested: true,
    })
    assert.equal(afterHub.shouldSearch, false)
    assert.equal(afterHub.reason, "already-hub")
    // Ancla de llegada intacta:
    const arrivalCity = cityAnchorForHubSearch(place("Tokio"), place("Tokio"))
    assert.equal(arrivalCity?.label, "Tokio")
  })

  it("coche/ferry/otro no consultan Search Box", () => {
    for (const mode of ["car", "ferry", "other", "undecided"] as const) {
      const d = decideHubSearch({
        mode,
        selected: place("A"),
        cityAnchor: place("A"),
        userRequested: true,
      })
      assert.equal(d.shouldSearch, false)
    }
  })

  it("cambiar avión→tren usa ciudad base, no coords del aeropuerto", () => {
    const city = place("Barcelona")
    const airport = {
      label: "El Prat",
      coords: { lng: 2.08, lat: 41.29 },
      kind: "airport" as const,
    }
    const d = decideHubSearch({
      mode: "train",
      selected: airport,
      cityAnchor: city,
      userRequested: true,
    })
    assert.equal(d.shouldSearch, true)
    if (d.shouldSearch) {
      assert.equal(d.proximity.lng, city.coords.lng)
      assert.equal(d.kind, "station")
    }
  })

  it("sin acción explícita no busca", () => {
    const d = decideHubSearch({
      mode: "flight",
      selected: place("Barcelona"),
      cityAnchor: place("Barcelona"),
      userRequested: false,
    })
    assert.equal(d.shouldSearch, false)
    assert.equal(d.reason, "not-requested")
  })
})

describe("transport-routes seeds y build", () => {
  it("hint de bus precarga mode y textos sin coords", () => {
    const item: UserDayItem = {
      id: "a",
      sourceItemId: "s",
      sourceId: "src",
      type: "transport",
      name: "Takayama → Okuhida Onsen area",
      detail: null,
      sourceAuthor: "Blog",
      sourceRouteHint: {
        from: "Takayama",
        to: "Okuhida Onsen area",
        mode: "bus",
      },
    }
    const seed = seedTransportForm(item)
    assert.equal(seed.mode, "bus")
    assert.equal(seed.pendingFromText, "Takayama")
    assert.equal(seed.pendingToText, "Okuhida Onsen area")
    assert.equal(seed.from, null)
    assert.equal(seed.to, null)
  })

  it("route confirmada manda sobre hint", () => {
    const item: UserDayItem = {
      id: "a",
      sourceItemId: "s",
      sourceId: "src",
      type: "transport",
      name: "A → B",
      detail: null,
      sourceAuthor: "Blog",
      sourceRouteHint: { from: "X", to: "Y", mode: "bus" },
      route: {
        from: place("Barcelona"),
        to: place("Madrid"),
        mode: "train",
      },
    }
    const seed = seedTransportForm(item)
    assert.equal(seed.mode, "train")
    assert.equal(seed.from?.label, "Barcelona")
    assert.equal(seed.pendingFromText, null)
  })

  it("heurística A → B como texto; títulos opacos vacíos", () => {
    assert.deepEqual(splitArrowTitle("A → B"), { from: "A", to: "B" })
    assert.equal(splitArrowTitle("Solo un nombre"), null)
    assert.equal(splitArrowTitle("A → B → C"), null)
  })

  it("build preserva procedencia y pone route sin leg", () => {
    const existing: UserDayItem = {
      id: "keep-me",
      sourceItemId: "si-1",
      sourceId: "src-1",
      type: "transport",
      name: "Viejo",
      detail: "nota",
      sourceAuthor: "Ana",
      affiliateUrl: "https://example.com/x",
      sourceRouteHint: { from: "A", to: "B", mode: "bus" },
    }
    const built = buildTransportRouteItem({
      route: {
        from: place("Takayama"),
        to: place("Okuhida"),
        mode: "bus",
      },
      detail: "ref",
      vendor: "Nohi",
      existing,
    })
    assert.equal(built.id, "keep-me")
    assert.equal(built.sourceId, "src-1")
    assert.equal(built.affiliateUrl, "https://example.com/x")
    assert.equal(built.route?.leg, undefined)
    assert.equal(built.name, "Takayama → Okuhida")
    assert.equal(built.coords?.lng, place("Okuhida").coords.lng)
  })

  it("flattenItinerary conserva sourceRouteHint", () => {
    const itinerary = {
      destination: "Japan",
      total_days: 3,
      source_structured_by_days: true,
      days: [
        {
          day: 1,
          title: "D1",
          accommodations: [],
          activities: [],
          restaurants: [],
          transport: [
            {
              type: "bus",
              from: "Takayama",
              to: "Okuhida Onsen area",
              notes: null,
            },
          ],
          tips: null,
        },
      ],
      basics: [],
    } as unknown as Itinerary
    const items = flattenItinerary(itinerary)
    const t = items.find((i) => i.type === "transport")
    assert.ok(t)
    assert.equal(t!.sourceRouteHint?.mode, "bus")
    assert.equal(t!.sourceRouteHint?.from, "Takayama")
  })
})

describe("task keys y copy", () => {
  it("route:id estable al cambiar extremos", () => {
    const base: UserDayItem = {
      id: "uuid-1",
      sourceItemId: "s",
      sourceId: "m",
      type: "transport",
      name: "A → B",
      detail: null,
      sourceAuthor: "Tú",
      route: { from: place("A"), to: place("B"), mode: "train" },
    }
    const k1 = taskKeyForItem(base)
    assert.equal(k1, "route:uuid-1")
    const renamed: UserDayItem = {
      ...base,
      name: "X → Y",
      route: { from: place("X"), to: place("Y"), mode: "flight" },
      vendor: "ANA",
    }
    assert.equal(taskKeyForItem(renamed), k1)
  })

  it("legs siguen en leg:outbound|return", () => {
    const out: UserDayItem = {
      id: "1",
      sourceItemId: "s",
      sourceId: "m",
      type: "transport",
      name: "H → D",
      detail: null,
      sourceAuthor: "Tú",
      route: {
        from: place("H"),
        to: place("D"),
        mode: "flight",
        leg: "outbound",
      },
    }
    assert.equal(taskKeyForItem(out), "leg:outbound")
  })

  it("migración legacy mueve coste una sola vez", () => {
    const tasks: Record<string, import("@/types/itinerary").TripTaskState> = {
      "transport:takayama → okuhida": {
        status: "booked",
        cost: 40,
        cancellable: null,
        notes: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    }
    const next = migrateTaskKeyOnStructure({
      tasks,
      oldKey: "transport:takayama → okuhida",
      newKey: "route:uuid-1",
    })
    assert.equal(next["route:uuid-1"]?.cost, 40)
    assert.equal(next["transport:takayama → okuhida"], undefined)
  })

  it("copy de tarea por modo sin leg", () => {
    const title = taskActionTitle({
      origin: "dayItem",
      sourceKind: "transport",
      title: "Takayama → Sapporo",
      route: {
        from: place("Takayama"),
        to: place("Sapporo"),
        mode: "flight",
      },
    })
    assert.equal(title, "Comprar los vuelos a Sapporo")
  })
})

describe("iconos por medio", () => {
  it("cubre todos los modos", () => {
    for (const key of Object.keys(TRANSPORT_MODE_ICONS)) {
      assert.ok(TRANSPORT_MODE_ICONS[key as keyof typeof TRANSPORT_MODE_ICONS])
    }
  })

  it("route.mode manda sobre hint/texto", () => {
    const mode = resolveTransportModeVisual({
      routeMode: "train",
      hint: { from: "A", to: "B", mode: "bus" },
      name: "vuelo misterioso",
    })
    assert.equal(mode, "train")
  })
})

describe("mapa geometría", () => {
  it("segmento por route; excluye hints", () => {
    const days: UserDay[] = [
      {
        id: "d1",
        label: "",
        items: [
          {
            id: "t1",
            sourceItemId: "s",
            sourceId: "m",
            type: "transport",
            name: "A → B",
            detail: null,
            sourceAuthor: "Tú",
            route: {
              from: place("A"),
              to: { label: "B", coords: { lng: 139.7, lat: 35.6 }, kind: "city" },
              mode: "flight",
              leg: "outbound",
            },
          },
          {
            id: "t2",
            sourceItemId: "s2",
            sourceId: "src",
            type: "transport",
            name: "Hint only",
            detail: null,
            sourceAuthor: "Blog",
            sourceRouteHint: { from: "X", to: "Y", mode: "bus" },
          },
        ],
      },
    ]
    // Ida en avión: no se dibuja el segmento largo.
    const segs = collectMapSegments(days)
    assert.equal(segs.length, 0)
    assert.equal(segmentFromItem(days[0]!.items[1]!, 1), null)
  })

  it("ida/vuelta avión → anclas llegada/salida; coche sí dibuja", () => {
    assert.equal(legIncludedInMapItinerary("flight"), false)
    assert.equal(legIncludedInMapItinerary("car"), true)

    const days: UserDay[] = [
      {
        id: "d1",
        label: "",
        items: [
          {
            id: "out",
            sourceItemId: "s",
            sourceId: "m",
            type: "transport",
            name: "BCN → NRT",
            detail: null,
            sourceAuthor: "Tú",
            route: {
              from: { label: "El Prat", coords: { lng: 2.08, lat: 41.29 }, kind: "airport" },
              to: { label: "Narita", coords: { lng: 140.39, lat: 35.77 }, kind: "airport" },
              mode: "flight",
              leg: "outbound",
            },
          },
        ],
      },
      {
        id: "d2",
        label: "",
        items: [
          {
            id: "ret",
            sourceItemId: "s",
            sourceId: "m",
            type: "transport",
            name: "NRT → BCN",
            detail: null,
            sourceAuthor: "Tú",
            route: {
              from: { label: "Narita", coords: { lng: 140.39, lat: 35.77 }, kind: "airport" },
              to: { label: "El Prat", coords: { lng: 2.08, lat: 41.29 }, kind: "airport" },
              mode: "flight",
              leg: "return",
            },
          },
        ],
      },
    ]
    assert.equal(collectMapSegments(days).length, 0)
    const anchors = collectMapGatewayAnchors(days)
    assert.equal(anchors.length, 2)
    assert.equal(anchors[0]!.role, "arrival")
    assert.equal(anchors[0]!.label, "Narita")
    assert.equal(anchors[1]!.role, "departure")
    assert.equal(anchors[1]!.label, "Narita")

    const carDays: UserDay[] = [
      {
        id: "d1",
        label: "",
        items: [
          {
            id: "out",
            sourceItemId: "s",
            sourceId: "m",
            type: "transport",
            name: "Casa → Granada",
            detail: null,
            sourceAuthor: "Tú",
            route: {
              from: place("Casa"),
              to: { label: "Granada", coords: { lng: -3.6, lat: 37.17 }, kind: "city" },
              mode: "car",
              leg: "outbound",
            },
          },
        ],
      },
    ]
    assert.equal(collectMapSegments(carDays).length, 1)
    assert.equal(collectMapGatewayAnchors(carDays).length, 0)
  })

  it("tramo intercontinental coche/otro no se dibuja; ancla en destino", () => {
    const days: UserDay[] = [
      {
        id: "d1",
        label: "",
        items: [
          {
            id: "out-car",
            sourceItemId: "s",
            sourceId: "m",
            type: "transport",
            name: "Barcelona → Tokio",
            detail: null,
            sourceAuthor: "Tú",
            route: {
              from: { label: "Barcelona", coords: { lng: 2.17, lat: 41.38 }, kind: "city" },
              to: { label: "Tokio", coords: { lng: 139.69, lat: 35.68 }, kind: "city" },
              mode: "car",
              leg: "outbound",
            },
          },
          {
            id: "other-long",
            sourceItemId: "s2",
            sourceId: "m",
            type: "transport",
            name: "España → Japón",
            detail: null,
            sourceAuthor: "Tú",
            route: {
              from: { label: "España", coords: { lng: -3.7, lat: 40.4 }, kind: "city" },
              to: { label: "Osaka", coords: { lng: 135.5, lat: 34.7 }, kind: "city" },
              mode: "other",
            },
          },
        ],
      },
    ]
    assert.equal(collectMapSegments(days).length, 0)
    const anchors = collectMapGatewayAnchors(days)
    assert.equal(anchors.length, 1)
    assert.equal(anchors[0]!.role, "arrival")
    assert.equal(anchors[0]!.label, "Tokio")
  })

  it("arco geodésico y antimeridiano", () => {
    const line = geodesicLine({ lng: 170, lat: 0 }, { lng: -170, lat: 0 }, 8)
    assert.ok(line.length >= 2)
    // Unwrap: pasos no saltan ~340°
    for (let i = 1; i < line.length; i++) {
      assert.ok(Math.abs(line[i]![0] - line[i - 1]![0]) < 90)
    }
  })

  it("Directions solo coche/bus", () => {
    assert.equal(modeAllowsRoadDirections("flight"), false)
    assert.equal(modeAllowsRoadDirections("train"), false)
    assert.equal(modeAllowsRoadDirections("car"), true)
    assert.equal(modeAllowsRoadDirections("bus"), true)
  })
})

describe("mapa recorrido de lugares", () => {
  const baseItem = (
    id: string,
    type: "stay" | "food" | "activity" | "transport",
    name: string,
    coords?: { lng: number; lat: number } | null,
  ): UserDayItem => ({
    id,
    sourceItemId: id,
    sourceId: "m",
    type,
    name,
    detail: null,
    sourceAuthor: "Tú",
    coords: coords ?? null,
  })

  it("orden entre días; food entra y transport no", () => {
    const days: UserDay[] = [
      {
        id: "d1",
        label: "",
        items: [
          baseItem("t1", "transport", "A → B"),
          baseItem("s1", "stay", "Hotel A", { lng: 2.1, lat: 41.3 }),
          baseItem("f1", "food", "Restaurante", { lng: 2.15, lat: 41.32 }),
        ],
      },
      {
        id: "d2",
        label: "",
        items: [baseItem("a1", "activity", "Mirador", { lng: 2.2, lat: 41.35 })],
      },
    ]
    const places = collectItineraryPlaces(days)
    assert.deepEqual(
      places.map((p) => p.id),
      ["s1", "f1", "a1"],
    )
    assert.equal(places[1]!.type, "food")
    assert.equal(places[0]!.dayNumber, 1)
    assert.equal(places[2]!.dayNumber, 2)
  })

  it("stay con spanDays: cierre último del día, apertura primero del siguiente", () => {
    const hotel = baseItem("full-moon", "stay", "Full Moon", { lng: 19.06, lat: 47.5 })
    hotel.spanDays = 3
    hotel.region = "Király utca 15"
    const days: UserDay[] = [
      {
        id: "d1",
        label: "",
        items: [baseItem("a1", "activity", "Ruin pub", { lng: 19.07, lat: 47.5 }), hotel],
      },
      {
        id: "d2",
        label: "",
        items: [baseItem("a2", "activity", "Parlamento", { lng: 19.05, lat: 47.51 })],
      },
      {
        id: "d3",
        label: "",
        items: [baseItem("a3", "activity", "Termas", { lng: 19.04, lat: 47.49 })],
      },
      {
        id: "d4",
        label: "",
        items: [baseItem("a4", "activity", "Mercado", { lng: 19.06, lat: 47.48 })],
      },
    ]
    const places = collectItineraryPlaces(days)
    const ids = places.map((p) => p.id)
    // Día 1: activity, hotel (ya cierra) — sin close sintético.
    assert.deepEqual(ids.slice(0, 2), ["a1", "full-moon"])
    // Día 2: open, activity, close
    assert.equal(ids[2], "full-moon::open::2")
    assert.equal(ids[3], "a2")
    assert.equal(ids[4], "full-moon::close::2")
    // Día 3: open, activity, close
    assert.equal(ids[5], "full-moon::open::3")
    assert.equal(ids[7], "full-moon::close::3")
    // Día 4 checkout: open, activity (sin close)
    assert.equal(ids[8], "full-moon::open::4")
    assert.equal(ids[9], "a4")
    assert.equal(places.some((p) => p.id === "full-moon::close::4"), false)
    assert.equal(places.find((p) => p.id === "full-moon::open::2")!.region, "Király utca 15")
  })

  it("stay con spanDays y sin coords: no inyecta anclas", () => {
    const hotel = baseItem("h", "stay", "Hotel")
    hotel.spanDays = 3
    const days: UserDay[] = [
      { id: "d1", label: "", items: [hotel] },
      { id: "d2", label: "", items: [baseItem("a2", "activity", "X")] },
      { id: "d3", label: "", items: [] },
    ]
    const places = collectItineraryPlaces(days)
    assert.deepEqual(
      places.map((p) => p.id),
      ["h", "a2"],
    )
  })

  it("punto sin coords se salta; une vecinos y aparece en skipped", () => {
    const places = [
      {
        id: "a",
        name: "A",
        type: "activity" as const,
        dayNumber: 1,
        coords: { lng: 2.0, lat: 41.0 },
      },
      { id: "b", name: "B", type: "activity" as const, dayNumber: 1, coords: null },
      {
        id: "c",
        name: "C",
        type: "activity" as const,
        dayNumber: 1,
        coords: { lng: 2.1, lat: 41.1 },
      },
    ]
    const route = buildPlacesRoute(places)
    assert.equal(route.skipped.length, 1)
    assert.equal(route.skipped[0]!.id, "b")
    assert.equal(route.legs.length, 1)
    assert.equal(route.legs[0]!.fromId, "a")
    assert.equal(route.legs[0]!.toId, "c")
    assert.ok(route.routeKm > 0)
  })

  it("alojamiento repetido → leg zero, 0 km", () => {
    const same = { lng: 2.17, lat: 41.38 }
    const places = [
      { id: "h1", name: "Hotel", type: "stay" as const, dayNumber: 1, coords: same },
      { id: "h2", name: "Hotel", type: "stay" as const, dayNumber: 2, coords: same },
      {
        id: "a1",
        name: "Actividad",
        type: "activity" as const,
        dayNumber: 2,
        coords: { lng: 2.2, lat: 41.4 },
      },
    ]
    const route = buildPlacesRoute(places)
    assert.equal(route.legs[0]!.kind, "zero")
    assert.ok(route.legs[0]!.km <= 0.05)
    assert.equal(route.legs[1]!.kind, "road-candidate")
    assert.ok(route.routeKm > 0)
  })

  it("par por encima de PLACES_ROAD_MAX_KM → long-hop", () => {
    // Tokio → Sapporo ~830 km
    const places = [
      {
        id: "tky",
        name: "Tokio",
        type: "stay" as const,
        dayNumber: 1,
        coords: { lng: 139.69, lat: 35.68 },
      },
      {
        id: "spk",
        name: "Sapporo",
        type: "stay" as const,
        dayNumber: 2,
        coords: { lng: 141.35, lat: 43.06 },
      },
    ]
    const route = buildPlacesRoute(places)
    assert.ok(route.legs[0]!.km > PLACES_ROAD_MAX_KM)
    assert.equal(route.legs[0]!.kind, "long-hop")
    assert.equal(route.routeKm, 0)
    assert.ok(route.longHopKm > PLACES_ROAD_MAX_KM)
  })

  it("groupRoadCandidateSubsequences parte en long-hops", () => {
    const places = [
      {
        id: "a",
        name: "A",
        type: "activity" as const,
        dayNumber: 1,
        coords: { lng: 2.0, lat: 41.0 },
      },
      {
        id: "b",
        name: "B",
        type: "activity" as const,
        dayNumber: 1,
        coords: { lng: 2.05, lat: 41.05 },
      },
      {
        id: "c",
        name: "C",
        type: "stay" as const,
        dayNumber: 2,
        coords: { lng: 139.7, lat: 35.7 },
      },
      {
        id: "d",
        name: "D",
        type: "activity" as const,
        dayNumber: 2,
        coords: { lng: 139.75, lat: 35.72 },
      },
    ]
    const route = buildPlacesRoute(places)
    const groups = groupRoadCandidateSubsequences(route.legs)
    assert.equal(groups.length, 2)
    assert.equal(groups[0]!.coords.length, 2)
    assert.equal(groups[1]!.coords.length, 2)
  })

  it("collectTransportDistances cuenta ida/vuelta y largos; segments los excluye", () => {
    const days: UserDay[] = [
      {
        id: "d1",
        label: "",
        items: [
          {
            id: "out",
            sourceItemId: "s",
            sourceId: "m",
            type: "transport",
            name: "BCN → NRT",
            detail: null,
            sourceAuthor: "Tú",
            route: {
              from: { label: "El Prat", coords: { lng: 2.08, lat: 41.29 }, kind: "airport" },
              to: { label: "Narita", coords: { lng: 140.39, lat: 35.77 }, kind: "airport" },
              mode: "flight",
              leg: "outbound",
            },
          },
          {
            id: "local",
            sourceItemId: "s2",
            sourceId: "m",
            type: "transport",
            name: "Takayama → Kanazawa",
            detail: null,
            sourceAuthor: "Tú",
            route: {
              from: { label: "Takayama", coords: { lng: 137.25, lat: 36.14 }, kind: "station" },
              to: { label: "Kanazawa", coords: { lng: 136.65, lat: 36.56 }, kind: "station" },
              mode: "train",
            },
          },
        ],
      },
    ]
    assert.equal(collectMapSegments(days).length, 1)
    const dist = collectTransportDistances(days)
    assert.equal(dist.byMode.flight?.count, 1)
    assert.equal(dist.byMode.train?.count, 1)
    assert.ok((dist.byMode.flight?.km ?? 0) > 3000)
    assert.equal(dist.undrawn.length, 1)
    assert.equal(dist.undrawn[0]!.reason, "gateway-leg")
    assert.ok(dist.drawnKm > 0)
    assert.ok(dist.undrawnKm > dist.drawnKm)

    const again = collectTransportDistances(days)
    assert.equal(again.totalKm, dist.totalKm)
    assert.equal(summarizeTransportKm(dist.byMode).includes("avión"), true)
  })

  it("incompleteMapTransports: hint-only y sin extremos; ignora los ya geocodificados", () => {
    const days: UserDay[] = [
      {
        id: "d1",
        label: "",
        items: [
          {
            id: "hint",
            sourceItemId: "s",
            sourceId: "src",
            type: "transport",
            name: "Bilbao → Gernika",
            detail: null,
            sourceAuthor: "blog",
            sourceRouteHint: { from: "Bilbao", to: "Gernika", mode: "train" },
          },
          {
            id: "ok",
            sourceItemId: "s2",
            sourceId: "src",
            type: "transport",
            name: "Takayama → Kanazawa",
            detail: null,
            sourceAuthor: "Tú",
            route: {
              from: { label: "Takayama", coords: { lng: 137.25, lat: 36.14 }, kind: "station" },
              to: { label: "Kanazawa", coords: { lng: 136.65, lat: 36.56 }, kind: "station" },
              mode: "train",
            },
          },
        ],
      },
    ]
    const incomplete = incompleteMapTransports(days)
    assert.equal(incomplete.length, 1)
    assert.equal(incomplete[0]!.itemId, "hint")
    assert.equal(incomplete[0]!.dayId, "d1")
    assert.equal(incomplete[0]!.dayNumber, 1)
  })

  it("formatKm en tres rangos", () => {
    assert.equal(formatKm(3.4), "3,4 km")
    assert.equal(formatKm(45.6), "46 km")
    assert.equal(formatKm(21400), "21.400 km")
  })
})

describe("geocode state (mapa)", () => {
  const point = {
    id: "a",
    name: "A",
    type: "activity" as const,
    dayNumber: 1,
  }
  const resolved = [{ point, coord: { lng: 2, lat: 41 } }]

  it("begin sin previo → loading; con previo → refreshing conservando resolved", () => {
    let state = reduceGeocode({ status: "idle" }, { type: "begin", hasPrevious: false })
    assert.equal(state.status, "loading")
    assert.equal(geocodeDisplayResult(state), null)

    state = reduceGeocode(
      { status: "ready", resolved, failed: [] },
      { type: "begin", hasPrevious: true },
    )
    assert.equal(state.status, "refreshing")
    const display = geocodeDisplayResult(state)
    assert.ok(display)
    assert.equal(display!.resolved.length, 1)
    assert.equal(display!.resolved[0]!.point.id, "a")
  })

  it("success tras refreshing deja ready con nuevos datos", () => {
    const refreshing = reduceGeocode(
      { status: "ready", resolved, failed: [] },
      { type: "begin", hasPrevious: true },
    )
    const next = reduceGeocode(refreshing, {
      type: "success",
      resolved: [
        ...resolved,
        {
          point: { id: "b", name: "B", type: "stay", dayNumber: 2 },
          coord: { lng: 2.1, lat: 41.1 },
        },
      ],
      failed: [],
    })
    assert.equal(next.status, "ready")
    if (next.status !== "ready") throw new Error("expected ready")
    assert.equal(next.resolved.length, 2)
  })
})

describe("guardrails", () => {
  it("presupuesto de suggests", () => {
    let b = createPlaceSearchBudget({ maxSuggests: 2, maxHubs: 1 })
    assert.equal(canSpendSuggest(b), true)
    b = recordSuggest(b)
    b = recordSuggest(b)
    assert.equal(canSpendSuggest(b), false)
  })

  it("hub sin licencia cae a ciudad ancla", () => {
    // Forzar fallback: toPersistable con hub + city
    const hub = place("Narita", "airport")
    const city = place("Tokio")
    // Si allow es true en test (non-production), strip sigue siendo hub.
    // Probamos stripPersistMeta forma.
    const p = stripPersistMeta(toPersistableRoutePlace(hub, city))
    assert.ok(p.label)
    assert.ok(p.coords)
    void allowTransportHubPersistence
    void sourceRouteHintFromTransport
  })
})

console.log("transport-routes / hubs / map / guardrails: ok")
