import assert from "node:assert/strict"
import type { Trip, UserDay, UserDayItem } from "@/types/itinerary"
import {
  CHIP_REVIEW_GAPS,
  CHIP_WEATHER_REORDER,
  chipLoadedDay,
  collectPlanSignals,
  buildContextualAuditChips,
  formatPlanSignalsMarkdown,
  weatherHorizonFor,
} from "./assistant-plan-signals"

function item(
  id: string,
  name: string,
  extra: Partial<UserDayItem> = {},
): UserDayItem {
  return {
    id,
    sourceItemId: `src-${id}`,
    sourceId: "src-1",
    type: "activity",
    name,
    detail: null,
    sourceAuthor: "blog",
    ...extra,
  }
}

function tripOf(days: UserDay[], extra: Partial<Trip> = {}): Pick<Trip, "days" | "startDate"> {
  return { days, startDate: extra.startDate ?? null }
}

const TODAY = new Date("2026-08-17T12:00:00")

{
  const { horizon, daysUntilStart } = weatherHorizonFor("2026-08-25", TODAY)
  assert.equal(horizon, "forecast")
  assert.equal(daysUntilStart, 8)
}

{
  const { horizon, daysUntilStart } = weatherHorizonFor("2026-12-01", TODAY)
  assert.equal(horizon, "climatology")
  assert.equal(daysUntilStart, 106)
}

{
  const { horizon, daysUntilStart } = weatherHorizonFor(null, TODAY)
  assert.equal(horizon, "none")
  assert.equal(daysUntilStart, null)
}

{
  const days: UserDay[] = [
    { id: "d1", label: "", items: [] },
    { id: "d2", label: "", items: [item("a", "Solo")] },
    {
      id: "d3",
      label: "",
      items: [
        item("h", "Hotel", { type: "stay", region: "Innsbruck" }),
        item("m1", "Museo 1"),
        item("m2", "Museo 2"),
        item("m3", "Museo 3"),
      ],
    },
  ]
  const s = collectPlanSignals(tripOf(days), { today: TODAY })
  assert.deepEqual(s.emptyDays.map((d) => d.dayNumber), [1])
  assert.deepEqual(s.thinDays.map((d) => d.dayNumber), [2])
  assert.equal(s.loadedDays.length, 0)
  assert.equal(s.hasAuditSubstance, true)
}

{
  const loaded: UserDay[] = [
    {
      id: "d1",
      label: "",
      items: [
        item("t", "Tren", { type: "transport" }),
        item("a", "Casco"),
        item("b", "Ambras"),
        item("c", "Almuerzo", { type: "food" }),
        item("h", "Hotel", { type: "stay" }),
      ],
    },
  ]
  const s = collectPlanSignals(tripOf(loaded), { today: TODAY })
  assert.equal(s.loadedDays.length, 1)
  assert.equal(s.loadedDays[0]!.timeItems, 4)
}

{
  const withStay: UserDay[] = [
    {
      id: "d1",
      label: "",
      items: [
        item("h", "Hotel", { type: "stay" }),
        item("a", "Uno"),
        item("b", "Dos"),
        item("c", "Tres"),
      ],
    },
  ]
  const s = collectPlanSignals(tripOf(withStay), { today: TODAY })
  assert.equal(s.loadedDays.length, 0)
}

{
  const mismatch: UserDay[] = [
    {
      id: "d1",
      label: "",
      items: [
        item("h", "Hotel", { type: "stay", region: "Innsbruck" }),
        item("a", "Hallstatt", { region: "Hallstatt" }),
        item("b", "Casco", { region: "Innsbruck" }),
      ],
    },
  ]
  const s = collectPlanSignals(tripOf(mismatch), { today: TODAY })
  assert.equal(s.stayMismatch.length, 1)
  assert.equal(s.stayMismatch[0]!.stayRegion, "Innsbruck")
  assert.ok(s.stayMismatch[0]!.activityRegions.includes("Hallstatt"))
}

{
  const noHotels: UserDay[] = [
    { id: "d1", label: "", items: [item("a", "A"), item("b", "B")] },
    { id: "d2", label: "", items: [item("c", "C")] },
  ]
  const s = collectPlanSignals(tripOf(noHotels), { today: TODAY })
  assert.equal(s.missingStay.length, 0)
}

{
  const someHotels: UserDay[] = [
    {
      id: "d1",
      label: "",
      items: [item("h", "Hotel", { type: "stay" }), item("a", "A")],
    },
    { id: "d2", label: "", items: [item("b", "B"), item("c", "C")] },
  ]
  const s = collectPlanSignals(tripOf(someHotels), { today: TODAY })
  assert.deepEqual(s.missingStay.map((d) => d.dayNumber), [2])
}

{
  const innsbruck = { lng: 11.4041, lat: 47.2692 }
  const vienna = { lng: 16.3738, lat: 48.2082 }
  const hops: UserDay[] = [
    {
      id: "d1",
      label: "",
      items: [
        item("a", "Innsbruck", { coords: innsbruck }),
        item("b", "Viena", { coords: vienna }),
      ],
    },
  ]
  const s = collectPlanSignals(tripOf(hops), { today: TODAY })
  assert.equal(s.longHops.length, 1)
  assert.ok(s.longHops[0]!.km > 60)
}

{
  const noCoords: UserDay[] = [
    {
      id: "d1",
      label: "",
      items: [item("a", "Innsbruck", { region: "Innsbruck" }), item("b", "Viena", { region: "Viena" })],
    },
  ]
  const s = collectPlanSignals(tripOf(noCoords), { today: TODAY })
  assert.equal(s.longHops.length, 0)
}

{
  const emptyPlan = collectPlanSignals(tripOf([{ id: "d1", label: "", items: [] }]), {
    today: TODAY,
  })
  assert.equal(emptyPlan.hasAuditSubstance, false)
  assert.deepEqual(buildContextualAuditChips(emptyPlan), [])
}

{
  const days: UserDay[] = [
    {
      id: "d1",
      label: "",
      items: [
        item("t", "Tren", { type: "transport" }),
        item("a", "Casco"),
        item("b", "Ambras"),
        item("c", "Almuerzo", { type: "food" }),
      ],
    },
    { id: "d2", label: "", items: [] },
  ]
  const s = collectPlanSignals(
    tripOf(days, { startDate: "2026-08-25" }),
    { today: TODAY },
  )
  const chips = buildContextualAuditChips(s)
  assert.ok(chips.includes(CHIP_REVIEW_GAPS))
  assert.ok(chips.includes(chipLoadedDay(1)))
  assert.ok(chips.includes(CHIP_WEATHER_REORDER))
  assert.equal(chips.length, 3)

  const filtered = buildContextualAuditChips(s, [CHIP_REVIEW_GAPS])
  assert.ok(!filtered.includes(CHIP_REVIEW_GAPS))
}

{
  const far = collectPlanSignals(
    tripOf(
      [
        {
          id: "d1",
          label: "",
          items: [item("a", "A"), item("b", "B"), item("c", "C")],
        },
      ],
      { startDate: "2026-12-01" },
    ),
    { today: TODAY },
  )
  assert.equal(far.weatherHorizon, "climatology")
  assert.ok(!buildContextualAuditChips(far).includes(CHIP_WEATHER_REORDER))
}

{
  const md = formatPlanSignalsMarkdown(
    collectPlanSignals(
      tripOf([{ id: "d1", label: "", items: [] }], { startDate: "2026-08-25" }),
      { today: TODAY },
    ),
  )
  assert.match(md, /## Señales del plan/)
  assert.match(md, /horizonte meteo: forecast/)
  assert.match(md, /día 1: 0 ítems/)
}

{
  const edinburgh = { lng: -3.19, lat: 55.95 }
  const madrid = { lng: -3.7, lat: 40.4 }
  const rentalDays: UserDay[] = [
    {
      id: "d1",
      label: "",
      items: [
        item("rent", "Hertz", {
          type: "transport",
          coords: edinburgh,
          spanDays: 4,
          route: {
            from: { label: "Edimburgo", coords: edinburgh, kind: "city" },
            to: { label: "Edimburgo", coords: { ...edinburgh }, kind: "city" },
            mode: "car",
            carUse: "rental",
          },
        }),
        item("museo", "Museo", { coords: madrid, region: "Madrid" }),
      ],
    },
  ]
  const s = collectPlanSignals(tripOf(rentalDays), { today: TODAY })
  assert.equal(s.longHops.length, 0)
  assert.equal(s.loadedDays.length, 0)
}

console.log("assistant-plan-signals: ok")
