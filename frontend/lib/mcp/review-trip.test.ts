import assert from "node:assert/strict"
import { MANUAL_SOURCE_ID, ASSISTANT_SOURCE_ID } from "@/lib/item-provenance"
import { buildTripBudgetView } from "@/lib/trip-budget"
import { taskKeyForItem } from "@/lib/trip-tasks"
import { MCP_TRIP_UNAVAILABLE } from "./result"
import { tripFromBudgetRow } from "./get-trip-budget"
import { tripLoadFailure } from "./trip-access"
import {
  MCP_REVIEW_TRIP_COLUMNS,
  REVIEW_CHECK_IDS,
  REVIEW_EVIDENCE_NAMES_MAX,
  REVIEW_UNCONSOLIDATED_MAX,
  buildReviewChecks,
  collectReviewEvidence,
  daysFromRaw,
  findRawLegs,
  mapReviewTrip,
  nightIndexes,
  planNamesForEvidence,
  reviewTripOutput,
  reviewTripText,
  type McpReviewTripRow,
} from "./review-trip"
import type { SearchSourceRow } from "./search-sources"
import type { UserDayItem } from "@/types/itinerary"

function collectKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (value == null || typeof value !== "object") return into
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, into)
    return into
  }
  for (const [k, v] of Object.entries(value)) {
    into.add(k)
    collectKeys(v, into)
  }
  return into
}

function stay(partial: Partial<UserDayItem> & Pick<UserDayItem, "id" | "name">): UserDayItem {
  return {
    sourceItemId: "",
    sourceId: MANUAL_SOURCE_ID,
    type: "stay",
    detail: null,
    sourceAuthor: "",
    ...partial,
  }
}

const source: SearchSourceRow = {
  id: "src-1",
  author: "Patricia",
  title: "Alaska en furgoneta",
  area: "Alaska",
  items: [
    { id: "stay-denali", type: "stay", name: "Hotel Denali", affiliateUrl: "https://www.booking.com/hotel/us/denali.html?aid=1" },
    { id: "act-glacier", type: "activity", name: "Glaciar Worthington" },
    { id: "food-1", type: "food", name: "Salmon bake" },
  ],
  basics: [{ id: "basic-1", category: "sim", name: "Airalo USA" }],
}

function baseRow(over: Partial<McpReviewTripRow> = {}): McpReviewTripRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Alaska",
    start_date: "2026-09-01",
    end_date: "2026-09-07",
    num_days: 7,
    countries: ["US"],
    expectations: "Ritmo lento, no llenar los días",
    source_ids: ["src-1"],
    days: [
      {
        id: "d1",
        items: [
          {
            id: "leg-out",
            type: "transport",
            name: "Madrid → Anchorage",
            sourceId: MANUAL_SOURCE_ID,
            sourceItemId: "",
            route: { leg: "outbound", from: { label: "Madrid" }, to: { label: "Anchorage" } },
          },
          stay({ id: "hotel-1", name: "Hotel Denali", sourceItemId: "stay-denali", sourceId: "src-1", spanDays: 3 }),
        ],
      },
      { id: "d2", items: [] },
      { id: "d3", items: [] },
      { id: "d4", items: [] },
      {
        id: "d5",
        items: [
          {
            id: "ferry-1",
            type: "transport",
            name: "Whittier → Valdez",
            sourceId: MANUAL_SOURCE_ID,
            sourceItemId: "",
          },
        ],
      },
      { id: "d6", items: [] },
      {
        id: "d7",
        items: [
          {
            id: "leg-ret",
            type: "transport",
            name: "Anchorage → Madrid",
            sourceId: MANUAL_SOURCE_ID,
            sourceItemId: "",
            route: { leg: "return", from: { label: "Anchorage" }, to: { label: "Madrid" } },
          },
        ],
      },
    ],
    basics: [],
    tasks: {},
    extra_tasks: [],
    budget: { total: 3000, byCategory: {} },
    currency: "EUR",
    num_travelers: 2,
    ...over,
  }
}

function main() {
  const columns = MCP_REVIEW_TRIP_COLUMNS.split(",").map((c) => c.trim())
  for (const forbidden of ["share_card", "user_id", "cover_url", "article_html", "origin"]) {
    assert.equal(columns.includes(forbidden), false, forbidden)
  }
  for (const required of ["days", "basics", "tasks", "budget", "expectations", "source_ids"]) {
    assert.equal(columns.includes(required), true, required)
  }

  {
    const row = baseRow()
    const checks = buildReviewChecks(row, [source])
    assert.deepEqual(
      checks.map((c) => c.id),
      [...REVIEW_CHECK_IDS],
    )
    for (const c of checks) {
      assert.equal("ok" in c, false, "no campo ok paralelo")
      assert.ok(["ok", "info", "warning"].includes(c.severity))
    }
  }

  {
    const row = baseRow()
    const empty = buildReviewChecks(row, [source]).find((c) => c.id === "empty_days")
    assert.ok(empty)
    // Días 2 y 3 son ecos del stay spanDays 3; 4 y 6 sí están vacíos; 5 tiene ferry; 1 y 7 tienen ítems.
    assert.deepEqual(empty.days, [4, 6])
    assert.equal(empty.severity, "warning")
    assert.equal(empty.days.includes(2), false)
    assert.equal(empty.days.includes(3), false)
  }

  {
    const uncon = buildReviewChecks(baseRow(), [source]).find((c) => c.id === "unconsolidated_items")
    assert.ok(uncon)
    assert.equal(uncon.total, 3)
    assert.equal(uncon.shown, 3)
    assert.deepEqual(
      uncon.items?.map((i) => i.name),
      ["Glaciar Worthington", "Salmon bake", "Airalo USA"],
    )
    assert.equal(uncon.items?.[0]?.sourceAuthor, "Patricia")
  }

  {
    const manyItems = Array.from({ length: 25 }, (_, i) => ({
      id: `extra-${i}`,
      type: "activity" as const,
      name: `Sitio ${String(i).padStart(2, "0")}`,
    }))
    const fat: SearchSourceRow = { ...source, items: manyItems, basics: [] }
    const uncon = buildReviewChecks(baseRow({ days: [{ id: "d1", items: [] }] }), [fat]).find(
      (c) => c.id === "unconsolidated_items",
    )
    assert.ok(uncon)
    assert.equal(uncon.total, 25)
    assert.equal(uncon.shown, REVIEW_UNCONSOLIDATED_MAX)
    assert.equal(uncon.items?.[0]?.name, "Sitio 00")
    assert.equal(uncon.items?.[REVIEW_UNCONSOLIDATED_MAX - 1]?.name, "Sitio 19")
  }

  {
    const srcB: SearchSourceRow = {
      id: "src-b",
      author: "B",
      title: "B",
      area: null,
      items: [{ id: "b1", type: "activity", name: "De B primero" }],
      basics: [],
    }
    const srcA: SearchSourceRow = {
      id: "src-a",
      author: "A",
      title: "A",
      area: null,
      items: [{ id: "a1", type: "activity", name: "De A después" }],
      basics: [],
    }
    const uncon = buildReviewChecks(
      baseRow({ source_ids: ["src-b", "src-a"], days: [{ items: [] }] }),
      [srcA, srcB],
    ).find((c) => c.id === "unconsolidated_items")
    assert.deepEqual(
      uncon?.items?.map((i) => i.name),
      ["De B primero", "De A después"],
    )
  }

  {
    const stayCov = buildReviewChecks(baseRow(), [source]).find((c) => c.id === "stay_coverage")
    assert.ok(stayCov)
    // Noches: día 1 (outbound) .. día 6 (antes de return en 7). Stay cubre 1-3. Huecos 4, 5, 6.
    assert.deepEqual(stayCov.days, [4, 5, 6])
    assert.match(stayCov.summary, /transporte/i)
    assert.equal(stayCov.severity, "warning")
  }

  {
    const nightsOnlyFerry = baseRow({
      days: [
        {
          id: "d1",
          items: [
            {
              id: "leg-out",
              type: "transport",
              name: "Ida",
              route: { leg: "outbound", from: { label: "A" }, to: { label: "B" } },
            },
          ],
        },
        {
          id: "d2",
          items: [{ id: "ferry", type: "transport", name: "Ferry nocturno" }],
        },
        {
          id: "d3",
          items: [
            {
              id: "leg-ret",
              type: "transport",
              name: "Vuelta",
              route: { leg: "return", from: { label: "B" }, to: { label: "A" } },
            },
          ],
        },
      ],
    })
    const stayCov = buildReviewChecks(nightsOnlyFerry, []).find((c) => c.id === "stay_coverage")
    assert.ok(stayCov)
    // Noches 1 y 2; ambas sin stay; día 2 tiene transport; día 1 también (ida).
    assert.equal(stayCov.severity, "info")
    assert.match(stayCov.summary, /transporte/i)
  }

  {
    const stayItem = stay({
      id: "s1",
      name: "Hotel Denali",
      sourceItemId: "stay-denali",
      sourceId: "src-1",
    })
    const row = baseRow({
      days: [{ id: "d1", items: [stayItem] }, { id: "d2", items: [] }],
      tasks: {
        [taskKeyForItem(stayItem)]: {
          status: "booked",
          cost: 400,
          cancellable: null,
          notes: null,
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      },
      extra_tasks: [],
      budget: { total: 1000, byCategory: {} },
      num_days: 2,
    })
    const view = buildTripBudgetView(tripFromBudgetRow(row))
    const budget = buildReviewChecks(row, []).find((c) => c.id === "budget_coverage")
    assert.ok(budget)
    assert.equal(budget.coverage?.priced, view.coverage.priced)
    assert.equal(budget.coverage?.total, view.coverage.total)
    const mappedTitles = view.unpriced.flatMap((g) => g.tasks.map((t) => t.title))
    assert.ok(budget.unpriced)
    for (const t of budget.unpriced) {
      assert.ok(mappedTitles.includes(t) || budget.coverage?.priced === budget.coverage?.total)
    }
  }

  {
    const legs = findRawLegs(baseRow().days)
    assert.deepEqual(
      legs.map((l) => l.leg),
      ["outbound", "return"],
    )
    const noCoords = findRawLegs([
      {
        items: [
          {
            type: "transport",
            name: "Ida",
            route: { leg: "outbound", from: { label: "MAD" }, to: { label: "ANC" } },
          },
        ],
      },
    ])
    assert.equal(noCoords[0]?.leg, "outbound")
  }

  {
    const missing = buildReviewChecks(
      baseRow({
        days: [{ id: "d1", items: [stay({ id: "h", name: "H" })] }],
      }),
      [],
    ).find((c) => c.id === "missing_legs")
    assert.equal(missing?.severity, "warning")
    assert.match(missing?.summary ?? "", /ida y vuelta/)
  }

  {
    assert.deepEqual(nightIndexes(7, 0, 6), [0, 1, 2, 3, 4, 5])
    assert.deepEqual(nightIndexes(1, 0, null), [])
    assert.deepEqual(nightIndexes(5, null, null), [0, 1, 2, 3])
  }

  {
    const names = planNamesForEvidence([
      {
        items: [
          { type: "stay", name: "Hotel fuente", sourceId: "src-1", id: "a" },
          { type: "activity", name: "Mirador propio", sourceId: MANUAL_SOURCE_ID, id: "b" },
          { type: "food", name: "Cena asistente", sourceId: ASSISTANT_SOURCE_ID, id: "c" },
          {
            type: "transport",
            name: "Madrid → Anchorage",
            sourceId: MANUAL_SOURCE_ID,
            route: { leg: "outbound" },
            id: "d",
          },
        ],
      },
    ])
    assert.equal(names[0], "Mirador propio")
    assert.equal(names[1], "Cena asistente")
    assert.equal(names[2], "Hotel fuente")
    assert.equal(names.includes("Madrid → Anchorage"), false)
  }

  {
    const row = baseRow({
      days: [
        {
          items: [
            {
              id: "own",
              type: "activity",
              name: "Glaciar Worthington",
              sourceId: MANUAL_SOURCE_ID,
              sourceItemId: "",
            },
          ],
        },
      ],
    })
    const evidence = collectReviewEvidence(row, [source])
    assert.ok(evidence.some((h) => h.name === "Glaciar Worthington"))
    assert.equal(evidence[0]?.sourceAuthor, "Patricia")
    assert.equal(
      evidence[0]?.affiliateUrl == null || !evidence[0].affiliateUrl.includes("pxf.io"),
      true,
    )
  }

  {
    const days19: Array<{ id: string; items: unknown[] }> = Array.from(
      { length: 19 },
      (_, i) => ({
        id: `d${i}`,
        items:
          i === 0
            ? [
                {
                  id: "out",
                  type: "transport",
                  name: "Ida",
                  sourceId: MANUAL_SOURCE_ID,
                  sourceItemId: "",
                  route: { leg: "outbound", from: { label: "MAD" }, to: { label: "ANC" } },
                },
                stay({
                  id: "h",
                  name: "Hotel",
                  sourceItemId: "stay-denali",
                  sourceId: "src-1",
                  spanDays: 2,
                }),
              ]
            : i === 18
              ? [
                  {
                    id: "ret",
                    type: "transport",
                    name: "Vuelta",
                    route: { leg: "return", from: { label: "ANC" }, to: { label: "MAD" } },
                  },
                ]
              : [],
      }),
    )
    days19[5] = {
      id: "d5",
      items: Array.from({ length: 20 }, (_, i) => ({
        id: `n${i}`,
        type: "activity",
        name: `Lugar extra ${i}`,
        sourceId: MANUAL_SOURCE_ID,
        sourceItemId: "",
        detail: null,
        sourceAuthor: "",
      })),
    }
    const mapped = mapReviewTrip(baseRow({ days: days19 }), [source])
    reviewTripOutput.parse(mapped.result)
    const blob = JSON.stringify(mapped.result)
    assert.equal(blob.includes("share_card"), false)
    assert.equal(blob.includes("article_html"), false)
    assert.equal(blob.includes("pxf.io"), false)
    assert.equal(blob.includes('"lng"'), false)
    assert.equal(blob.includes('"lat"'), false)
    assert.ok(planNamesForEvidence(days19).length <= REVIEW_EVIDENCE_NAMES_MAX)
    assert.ok(mapped.result.evidence.length <= 15)
    assert.equal(Object.prototype.hasOwnProperty.call(mapped.result, "days"), false)
    const keys = collectKeys(mapped.result)
    assert.equal(keys.has("coords"), false)
    assert.equal(keys.has("share_card"), false)
  }

  {
    const parsed = daysFromRaw(baseRow().days)
    assert.equal(parsed.length, 7)
    assert.equal(parsed[0]?.items.some((i) => i.spanDays === 3), true)
  }

  {
    const mapped = mapReviewTrip(baseRow(), [source])
    const text = reviewTripText(
      baseRow(),
      mapped.result.checks,
      mapped.result.evidence,
      1,
    )
    assert.match(text, /Expectativas: Ritmo lento/)
    const failing = mapped.result.checks.filter((c) => c.severity !== "ok")
    for (const c of failing) {
      assert.ok(text.includes(c.summary), c.id)
    }
    assert.doesNotMatch(text, /deberías|te recomiendo|conviene/i)
  }

  {
    const hidden = tripLoadFailure({ ok: false, reason: "not_found" })
    assert.equal(hidden.content[0].text, MCP_TRIP_UNAVAILABLE)
  }

  {
    const dirty: McpReviewTripRow = {
      ...baseRow(),
      days: [
        {
          items: [
            stay({
              id: "h",
              name: "Hotel",
              coords: { lng: -149.9, lat: 61.2 },
            } as UserDayItem & { coords: { lng: number; lat: number } }),
          ],
        },
      ],
    }
    const mapped = mapReviewTrip(dirty, [source])
    const blob = JSON.stringify(mapped.result)
    assert.equal(blob.includes("-149.9"), false)
    assert.equal(blob.includes("61.2"), false)
  }

  console.log("mcp-review-trip: ok")
}

main()
