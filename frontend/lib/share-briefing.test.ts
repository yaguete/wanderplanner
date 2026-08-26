import assert from "node:assert/strict"
import type { Source, Trip, UserDay, UserDayItem } from "@/types/itinerary"
import {
  SHARE_GROUP_FROM,
  SHARE_GROUP_SIZE,
  SHARE_MAX_ITEMS_PER_DAY,
  SHARE_MAX_SOURCES,
  buildSharePlan,
  shareCardIsStale,
  shareCardNeedsGenerate,
  sharePlanSignature,
  tripHasShareablePlan,
} from "./share-briefing"
import { ASSISTANT_SOURCE_ID, MANUAL_SOURCE_ID } from "./item-provenance"

function item(
  overrides: Partial<UserDayItem> & Pick<UserDayItem, "id" | "type" | "name">,
): UserDayItem {
  return {
    sourceItemId: "src-item-LEAK",
    sourceId: "src-1",
    detail: "nota privada",
    sourceAuthor: "Ana",
    affiliateUrl: "https://aff.example/secret-affiliate",
    vendor: "Booking",
    coords: { lng: 9.111111, lat: 48.222222 },
    ...overrides,
  }
}

function day(id: string, items: UserDayItem[], label = ""): UserDay {
  return { id, label, items }
}

function source(overrides: Partial<Source> & Pick<Source, "id">): Source {
  return {
    url: "https://blog.example/japon",
    author: "Ana",
    title: "Tokio en 7 días",
    area: "Tokio",
    totalDays: 7,
    items: [],
    basics: [],
    articleHtml: "<p>HTML privado</p>",
    ogImage: null,
    ...overrides,
  }
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "TRIP_ID_SHOULD_NOT_LEAK",
    name: "Japón",
    countries: ["JP"],
    startDate: "2026-10-01",
    endDate: "2026-10-07",
    numDays: 2,
    expectations: "Quiero onsen baratos",
    cover: "✈️",
    coverUrl: null,
    sourceIds: ["src-1"],
    days: [
      day(
        "DAY_ID_SHOULD_NOT_LEAK",
        [
          item({
            id: "ITEM_ID_SHOULD_NOT_LEAK",
            type: "activity",
            name: "Senso-ji",
            region: "Asakusa",
          }),
        ],
        "Tokio",
      ),
      day("d2", [item({ id: "i2", type: "food", name: "Ramen", sourceId: MANUAL_SOURCE_ID })]),
    ],
    basics: [
      {
        id: "basic-1",
        sourceBasicItemId: "sb-1",
        sourceId: "src-1",
        category: "sim",
        name: "SIM Japón",
        detail: null,
        vendor: "Ubigi",
        affiliateUrl: "https://aff.example/sim",
        sourceAuthor: "Ana",
      },
    ],
    tasks: {
      "activity:senso-ji": {
        status: "paid",
        cost: 42,
        cancellable: null,
        notes: "pago con visa",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    },
    extraTasks: [],
    dismissedCountryTasks: ["country:JP:visa"],
    numTravelers: 2,
    currency: "JPY",
    origin: {
      label: "Madrid",
      countryCode: "ES",
      coords: { lng: -3.7038, lat: 40.4168 },
    },
    budget: { total: 3000, byCategory: { accommodation: 1200 } },
    archived: false,
    referrer: "wp-landing",
    ownerId: "owner-1",
    version: 4,
    shareCard: null,
    ...overrides,
  }
}

function dumped(trip: Trip, sources: Source[] = [source({ id: "src-1" })]): string {
  return JSON.stringify(buildSharePlan(trip, sources))
}

{
  const trip = makeTrip()
  const sources = [source({ id: "src-1" })]
  const payload = buildSharePlan(trip, sources)
  const blob = JSON.stringify(payload)

  assert.equal(payload.trip_name, "Japón")
  assert.deepEqual(payload.countries, ["JP"])
  assert.equal(payload.start_date, "2026-10-01")
  assert.equal(payload.origin, "Madrid")
  assert.equal(payload.days.length, 2)
  assert.equal(payload.days[0]!.items[0]!.name, "Senso-ji")
  assert.equal(payload.days[0]!.items[0]!.via, "vía @Ana")
  assert.equal(payload.days[1]!.items[0]!.via, null)
  assert.equal(payload.sources[0]!.url, "https://blog.example/japon")

  for (const leak of [
    "cost",
    "budget",
    "currency",
    "affiliateUrl",
    "coords",
    "ITEM_ID_SHOULD_NOT_LEAK",
    "DAY_ID_SHOULD_NOT_LEAK",
    "TRIP_ID_SHOULD_NOT_LEAK",
    "src-item-LEAK",
    "https://aff.example/secret-affiliate",
    "9.111111",
    "48.222222",
    "3000",
    "JPY",
    "Quiero onsen baratos",
    "HTML privado",
    "SIM Japón",
    "wp-landing",
    "owner-1",
  ]) {
    assert.ok(!blob.includes(leak), `payload leaked ${leak}`)
  }
}

{
  const trip = makeTrip()
  const sources = [source({ id: "src-1" })]
  const base = sharePlanSignature(buildSharePlan(trip, sources))

  const withMoney = makeTrip({
    tasks: {
      "activity:senso-ji": {
        status: "booked",
        cost: 999,
        cancellable: true,
        notes: "caro",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    },
    budget: { total: 10, byCategory: { transport: 10 } },
    numTravelers: 8,
    currency: "USD",
    expectations: "otra cosa",
  })
  assert.equal(sharePlanSignature(buildSharePlan(withMoney, sources)), base)

  const moved = makeTrip({
    days: [
      day("DAY_ID_SHOULD_NOT_LEAK", [], "Tokio"),
      day("d2", [
        item({
          id: "ITEM_ID_SHOULD_NOT_LEAK",
          type: "activity",
          name: "Senso-ji",
          region: "Asakusa",
        }),
        item({ id: "i2", type: "food", name: "Ramen", sourceId: MANUAL_SOURCE_ID }),
      ]),
    ],
  })
  assert.notEqual(sharePlanSignature(buildSharePlan(moved, sources)), base)

  const relabeled = makeTrip({
    days: [
      day(
        "DAY_ID_SHOULD_NOT_LEAK",
        [
          item({
            id: "ITEM_ID_SHOULD_NOT_LEAK",
            type: "activity",
            name: "Senso-ji",
            region: "Asakusa",
          }),
        ],
        "Kioto",
      ),
      day("d2", [item({ id: "i2", type: "food", name: "Ramen", sourceId: MANUAL_SOURCE_ID })]),
    ],
  })
  assert.notEqual(sharePlanSignature(buildSharePlan(relabeled, sources)), base)

  const dated = makeTrip({ startDate: "2026-11-01", endDate: "2026-11-07" })
  assert.notEqual(sharePlanSignature(buildSharePlan(dated, sources)), base)

  const renamed = makeTrip({ name: "Honshu" })
  assert.notEqual(sharePlanSignature(buildSharePlan(renamed, sources)), base)

  assert.notEqual(sharePlanSignature(buildSharePlan(trip, [])), base)
}

{
  const ten: UserDay[] = Array.from({ length: SHARE_GROUP_FROM }, (_, i) =>
    day(`t${i}`, [item({ id: `t${i}`, type: "activity", name: `Sitio ${i + 1}` })]),
  )
  const tenPayload = buildSharePlan(makeTrip({ days: ten, numDays: ten.length }), [])
  assert.equal(tenPayload.days.length, Math.ceil(SHARE_GROUP_FROM / SHARE_GROUP_SIZE))
  assert.equal(tenPayload.days[0]!.label, "Días 1-3")

  const manyDays: UserDay[] = Array.from({ length: 40 }, (_, i) =>
    day(`d${i}`, [item({ id: `i${i}`, type: "activity", name: `Sitio ${i + 1}` })]),
  )
  const payload = buildSharePlan(makeTrip({ days: manyDays, numDays: 40 }), [source({ id: "src-1" })])
  const expectedGroups = Math.ceil(40 / SHARE_GROUP_SIZE)
  assert.equal(payload.days.length, expectedGroups)
  assert.equal(payload.days[0]!.label, "Días 1-3")
  assert.equal(payload.days[expectedGroups - 1]!.label, "Día 40")
  assert.ok(payload.days.every((d) => d.items.length <= SHARE_MAX_ITEMS_PER_DAY))
  assert.equal(payload.sources.length, 1)
}

{
  const stuffed = day(
    "d1",
    Array.from({ length: 12 }, (_, i) =>
      item({ id: `i${i}`, type: "activity", name: `Parada ${i + 1}` }),
    ),
  )
  const payload = buildSharePlan(makeTrip({ days: [stuffed], numDays: 1 }), [])
  assert.equal(payload.days[0]!.items.length, SHARE_MAX_ITEMS_PER_DAY)
}

{
  const used = source({ id: "src-1", title: "Tokio en 7 días" })
  const unused = source({ id: "src-unused", title: "QUÉ VER en GRANADA", author: "sinmapa" })
  const payload = buildSharePlan(makeTrip(), [used, unused])
  assert.equal(payload.sources.length, 1)
  assert.equal(payload.sources[0]!.title, "Tokio en 7 días")
  assert.ok(!JSON.stringify(payload).includes("sinmapa"))
}

{
  const payload = buildSharePlan(
    makeTrip({
      days: [
        day("d1", [
          item({
            id: "a1",
            type: "activity",
            name: "Mirador",
            sourceId: ASSISTANT_SOURCE_ID,
            sourceAuthor: "sinmapa",
          }),
        ]),
      ],
      numDays: 1,
    }),
    [source({ id: "src-unused", title: "QUÉ VER en GRANADA", author: "sinmapa" })],
  )
  assert.equal(payload.sources.length, 0)
  assert.ok(!JSON.stringify(payload).includes("sinmapa"))
}

{
  const stuffed = day(
    "d1",
    Array.from({ length: 8 }, (_, i) =>
      item({
        id: `i${i}`,
        type: "activity",
        name: `Parada ${i + 1}`,
        sourceId: `src-${i}`,
      }),
    ),
  )
  const sources = Array.from({ length: 8 }, (_, i) =>
    source({ id: `src-${i}`, title: `Guía ${i}` }),
  )
  const payload = buildSharePlan(makeTrip({ days: [stuffed], numDays: 1 }), sources)
  assert.equal(payload.sources.length, SHARE_MAX_SOURCES)
}

{
  assert.equal(tripHasShareablePlan(makeTrip({ days: [day("d1", [])] })), false)
  assert.equal(tripHasShareablePlan(makeTrip()), true)
}

{
  const trip = makeTrip()
  const sources = [source({ id: "src-1" })]
  const sig = sharePlanSignature(buildSharePlan(trip, sources))
  assert.ok(!sig.includes("\0"))
  assert.match(sig, /^[0-9a-f]+$/)
}

{
  const card = {
    text: "Mira lo que estoy montando para Kioto.",
    signature: "aaaabbbb",
    generatedAt: "2026-08-26T00:00:00.000Z",
  }
  assert.equal(shareCardNeedsGenerate(null), true)
  assert.equal(shareCardNeedsGenerate(card), false)
  assert.equal(shareCardIsStale(null, "aaaabbbb"), false)
  assert.equal(shareCardIsStale(card, "aaaabbbb"), false)
  assert.equal(shareCardIsStale(card, "ccccdddd"), true)
  const edited = { ...card, text: "Texto del usuario" }
  assert.equal(shareCardIsStale(edited, "aaaabbbb"), false)
  assert.equal(shareCardIsStale(edited, "ccccdddd"), true)
}

console.log("share-briefing: ok")
