import assert from "node:assert/strict"
import type { Source, Trip, UserDay, UserDayItem } from "@/types/itinerary"
import {
  applyMoveToDays,
  assistantAddItemPreviewLink,
  buildAssistantDayItem,
  isAssistantActionStale,
  locateDayItem,
  resolveConsolidateSourceItem,
  resolveMoveItem,
  resolveRemoveItem,
  resolveSetTaskCost,
  resolveSwapItems,
  snapshotAssistantAction,
  snapshotMoveProposal,
} from "./assistant-actions"
import { ASSISTANT_SOURCE_ID } from "./item-provenance"
import { BOOKING_AFFILIATE_AID } from "./booking-search"
import { dateISOForDayIndex, toISODate } from "./trip-dates"

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

function daysOf(...rows: UserDay[]): UserDay[] {
  return rows
}

const days: UserDay[] = daysOf(
  {
    id: "d4",
    label: "Día 4",
    items: [item("mirabell", "Palacio de Mirabell"), item("fortress", "Hohensalzburg")],
  },
  { id: "d5", label: "Día 5", items: [item("zoo", "Zoo de Hellbrunn")] },
)

{
  const found = locateDayItem(days, "mirabell")
  assert.equal(found?.day.id, "d4")
  assert.equal(found?.dayIndex, 0)
  assert.equal(found?.itemIndex, 0)
  assert.equal(locateDayItem(days, "missing"), null)
  const byName = locateDayItem(days, "id-inventado", "Palacio de Mirabell")
  assert.equal(byName?.item.id, "mirabell")
  assert.equal(locateDayItem(days, "id-inventado", "no existe"), null)
}

{
  const moved = resolveMoveItem(days, { item_id: "mirabell", to_day_id: "d5" })
  assert.equal(moved.ok, true)
  if (moved.ok) {
    assert.equal(moved.toIndex, 1)
    assert.equal(moved.toDayId, "d5")
  }
}

{
  const same = resolveMoveItem(days, { item_id: "mirabell", to_day_id: "d4" })
  assert.equal(same.ok, true)
  if (same.ok) assert.equal(same.toIndex, 1)
}

{
  const after = resolveMoveItem(days, {
    item_id: "mirabell",
    to_day_id: "d4",
    anchor_item_id: "fortress",
    position: "after",
  })
  assert.equal(after.ok, true)
  if (after.ok) assert.equal(after.toIndex, 1)

  const before = resolveMoveItem(days, {
    item_id: "zoo",
    to_day_id: "d4",
    anchor_item_id: "mirabell",
    position: "before",
  })
  assert.equal(before.ok, true)
  if (before.ok) assert.equal(before.toIndex, 0)

  const missingAnchor = resolveMoveItem(days, {
    item_id: "zoo",
    to_day_id: "d4",
    anchor_item_id: "ghost",
    position: "after",
  })
  assert.equal(missingAnchor.ok, true)
  if (missingAnchor.ok) assert.equal(missingAnchor.toIndex, 2)
}

{
  const lunch = item("lunch", "Almuerzo")
  const palace = item("palace", "Palacio")
  const local: UserDay[] = [
    { id: "d1", label: "", items: [palace, lunch, item("tower", "Torre")] },
  ]
  const afterPalace = resolveMoveItem(local, {
    item_id: "lunch",
    to_day_id: "d1",
    anchor_item_id: "palace",
    position: "after",
  })
  assert.equal(afterPalace.ok, true)
  if (afterPalace.ok) {
    const next = applyMoveToDays(local, {
      fromDayId: afterPalace.fromDayId,
      toDayId: afterPalace.toDayId,
      itemId: afterPalace.itemId,
      toIndex: afterPalace.toIndex,
    })
    assert.deepEqual(
      next[0]!.items.map((i) => i.id),
      ["palace", "lunch", "tower"],
    )
  }
}

{
  const legDays: UserDay[] = [
    {
      id: "d1",
      label: "",
      items: [
        item("out", "Madrid → Innsbruck", {
          type: "transport",
          route: {
            from: { label: "Madrid", coords: { lng: 0, lat: 0 }, kind: "city" },
            to: { label: "Innsbruck", coords: { lng: 1, lat: 1 }, kind: "city" },
            mode: "flight",
            leg: "outbound",
          },
        }),
      ],
    },
  ]
  const blocked = resolveMoveItem(legDays, { item_id: "out", to_day_id: "d1" })
  assert.equal(blocked.ok, false)
  if (!blocked.ok) assert.equal(blocked.reason, "leg_locked")
}

{
  assert.equal(resolveMoveItem(days, { item_id: "ghost", to_day_id: "d5" }).ok, false)
  assert.equal(resolveMoveItem(days, { item_id: "mirabell", to_day_id: "d99" }).ok, false)
}

{
  const snap = snapshotMoveProposal(days, {
    item_id: "mirabell",
    to_day_id: "d5",
    name: "nombre del modelo",
    why: "Más tiempo por la tarde",
  })
  assert.equal(snap.name, "Palacio de Mirabell")
  assert.equal(snap.from_day_number, 1)
  assert.equal(snap.to_day_number, 2)
}

{
  const swapCross = resolveSwapItems(days, "mirabell", "zoo")
  assert.equal(swapCross.ok, true)
  if (swapCross.ok) {
    let next = applyMoveToDays(days, swapCross.moves[0])
    next = applyMoveToDays(next, swapCross.moves[1])
    assert.equal(locateDayItem(next, "mirabell")?.day.id, "d5")
    assert.equal(locateDayItem(next, "zoo")?.day.id, "d4")
  }
}

{
  const local: UserDay[] = [
    {
      id: "d1",
      label: "",
      items: [item("a", "A"), item("b", "B"), item("c", "C")],
    },
  ]
  const adj = resolveSwapItems(local, "a", "b")
  assert.equal(adj.ok, true)
  if (adj.ok) {
    let next = applyMoveToDays(local, adj.moves[0])
    next = applyMoveToDays(next, adj.moves[1])
    assert.deepEqual(next[0]!.items.map((i) => i.id), ["b", "a", "c"])
  }

  const far = resolveSwapItems(local, "a", "c")
  assert.equal(far.ok, true)
  if (far.ok) {
    let next = applyMoveToDays(local, far.moves[0])
    next = applyMoveToDays(next, far.moves[1])
    assert.deepEqual(next[0]!.items.map((i) => i.id), ["c", "b", "a"])
  }
}

{
  const tripLike = {
    days,
    tasks: {
      "activity:palacio de mirabell": {
        status: "pending" as const,
        cost: 240,
        cancellable: null,
        notes: null,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    },
  }
  const removed = resolveRemoveItem(tripLike, "mirabell")
  assert.equal(removed.ok, true)
  if (removed.ok) {
    assert.equal(removed.costAtRisk, 240)
    assert.equal(removed.dayId, "d4")
  }
  const noCost = resolveRemoveItem({ days, tasks: {} }, "zoo")
  assert.equal(noCost.ok, true)
  if (noCost.ok) assert.equal(noCost.costAtRisk, null)

  const legDays: UserDay[] = [
    {
      id: "d1",
      label: "",
      items: [
        item("out", "Ida", {
          type: "transport",
          route: {
            from: { label: "A", coords: { lng: 0, lat: 0 }, kind: "city" },
            to: { label: "B", coords: { lng: 1, lat: 1 }, kind: "city" },
            leg: "outbound",
          },
        }),
      ],
    },
  ]
  const blocked = resolveRemoveItem({ days: legDays, tasks: {} }, "out")
  assert.equal(blocked.ok, false)
  if (!blocked.ok) assert.equal(blocked.reason, "leg_locked")
}

{
  const sources: Source[] = [
    {
      id: "src-1",
      url: "https://example.com",
      author: "La Cosmopolilla",
      title: "Guía",
      area: "Tirol",
      totalDays: 3,
      items: [
        {
          id: "rest-1",
          type: "food",
          name: "Stiftskeller",
          detail: "Schnitzel",
          dayHint: 2,
          region: "Innsbruck",
          affiliateUrl: "https://aff.example/x",
        },
      ],
      basics: [],
      articleHtml: "",
      ogImage: null,
    },
  ]
  const tripDays: UserDay[] = [{ id: "d3", label: "", items: [] }]
  const ok = resolveConsolidateSourceItem(
    { days: tripDays },
    sources,
    "src-1",
    "rest-1",
    "d3",
  )
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.item.sourceId, "src-1")
    assert.equal(ok.item.sourceItemId, "rest-1")
    assert.equal(ok.item.affiliateUrl, "https://aff.example/x")
    assert.equal(ok.item.sourceAuthor, "La Cosmopolilla")
  }

  const already: UserDay[] = [
    { id: "d3", label: "", items: [item("x", "Stiftskeller", { sourceItemId: "rest-1" })] },
  ]
  const dup = resolveConsolidateSourceItem(
    { days: already },
    sources,
    "src-1",
    "rest-1",
    "d3",
  )
  assert.equal(dup.ok, false)
  if (!dup.ok) assert.equal(dup.reason, "duplicate")
}

{
  const trip: Trip = {
    id: "t1",
    name: "Tirol",
    countries: ["AT"],
    startDate: null,
    endDate: null,
    numDays: 2,
    expectations: null,
    cover: "✈️",
    coverUrl: null,
    sourceIds: [],
    days,
    basics: [],
    tasks: {
      "activity:palacio de mirabell": {
        status: "pending",
        cost: 12,
        cancellable: null,
        notes: null,
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    },
    extraTasks: [],
    dismissedCountryTasks: [],
    numTravelers: null,
    currency: "EUR",
    origin: null,
    budget: null,
    shareCard: null,
    archived: false,
  }
  const live = resolveSetTaskCost(trip, "activity:palacio de mirabell", 90)
  assert.equal(live.ok, true)
  if (live.ok) {
    assert.equal(live.cost, 90)
    assert.equal(live.previousCost, 12)
  }
  const ghost = resolveSetTaskCost(trip, "activity:inventado", 10)
  assert.equal(ghost.ok, false)
  if (!ghost.ok) assert.equal(ghost.reason, "task_missing")
}

{
  const staleTrip: Trip = {
    id: "t1",
    name: "Tirol",
    countries: ["AT"],
    startDate: null,
    endDate: null,
    numDays: 2,
    expectations: null,
    cover: "✈️",
    coverUrl: null,
    sourceIds: [],
    days,
    basics: [],
    tasks: {},
    extraTasks: [],
    dismissedCountryTasks: [],
    numTravelers: null,
    currency: "EUR",
    origin: null,
    budget: null,
    shareCard: null,
    archived: false,
  }
  assert.equal(
    isAssistantActionStale(staleTrip, [], {
      kind: "remove_item",
      item_id: "ghost",
    }),
    true,
  )
  assert.equal(
    isAssistantActionStale(staleTrip, [], {
      kind: "remove_item",
      item_id: "mirabell",
    }),
    false,
  )
  assert.equal(
    isAssistantActionStale(staleTrip, [], {
      kind: "move_item",
      item_id: "ghost",
      to_day_id: "d5",
    }),
    true,
  )
}

{
  const stay = buildAssistantDayItem({
    type: "stay",
    name: "Hotel Goldener Adler",
    region: "Innsbruck",
  })
  assert.equal(stay.sourceId, ASSISTANT_SOURCE_ID)
  assert.equal(stay.type, "stay")
  assert.equal(stay.sourceAuthor, "Asistente")
  const stayHref = stay.affiliateUrl
  assert.ok(stayHref)
  assert.equal(new URL(stayHref).searchParams.get("aid"), BOOKING_AFFILIATE_AID)
  assert.equal(new URL(stayHref).searchParams.get("checkin"), null)

  const activity = buildAssistantDayItem({
    type: "activity",
    name: "Mirador",
    region: "Hallstatt",
  })
  assert.equal(activity.affiliateUrl, undefined)

  const museum = buildAssistantDayItem({
    type: "activity",
    name: "Museo do Pobo Galego",
    region: "Santiago",
    affiliateUrl: "https://museodopobo.gal/entradas",
  })
  assert.equal(museum.affiliateUrl, "https://museodopobo.gal/entradas")

  const stayIgnoresUrl = buildAssistantDayItem({
    type: "stay",
    name: "Hotel X",
    affiliateUrl: "https://museodopobo.gal/x",
  })
  assert.ok(stayIgnoresUrl.affiliateUrl)
  assert.equal(new URL(stayIgnoresUrl.affiliateUrl!).hostname, "www.booking.com")

  const fallback = buildAssistantDayItem({ type: "nope", name: "X" })
  assert.equal(fallback.type, "activity")
}

{
  const sources: Source[] = [
    {
      id: "src-1",
      url: "https://example.com",
      author: "La Cosmopolilla",
      title: "Guía",
      area: "Ourense",
      totalDays: 3,
      items: [
        {
          id: "stay-1",
          type: "stay",
          name: "Pazo de Bentraces",
          detail: "Rural",
          dayHint: 1,
          region: "Ourense",
          affiliateUrl: "https://www.booking.com/hotel/es/pazo.html?aid=1598831",
          vendor: "Booking",
        },
        {
          id: "act-1",
          type: "activity",
          name: "Tour termal",
          detail: null,
          dayHint: 2,
          affiliateUrl: "https://www.civitatis.com/es/ourense/termas/?aid=1006",
        },
      ],
      basics: [],
      articleHtml: "",
      ogImage: null,
    },
  ]
  const tripDays: UserDay[] = [{ id: "d1", label: "", items: [] }]
  const snapStay = snapshotAssistantAction(
    { days: tripDays } as Trip,
    sources,
    {
      kind: "add_item",
      day_id: "d1",
      type: "stay",
      name: "Pazo de Bentraces",
      source_id: "src-1",
      source_item_id: "stay-1",
    },
  )
  assert.equal(snapStay.kind, "add_item")
  if (snapStay.kind === "add_item") {
    assert.equal(snapStay.source_author, "La Cosmopolilla")
    assert.equal(
      snapStay.affiliate_url,
      "https://www.booking.com/hotel/es/pazo.html?aid=1598831",
    )
    assert.equal(snapStay.vendor, "Booking")
    assert.equal(snapStay.url, null)
  }
}

{
  function futureISO(daysFromToday: number): string {
    const d = new Date()
    d.setDate(d.getDate() + daysFromToday)
    return toISODate(d)
  }
  const checkin = futureISO(40)
  const sources: Source[] = [
    {
      id: "src-1",
      url: "https://example.com",
      author: "La Cosmopolilla",
      title: "Guía",
      area: "Ourense",
      totalDays: 3,
      items: [
        {
          id: "stay-1",
          type: "stay",
          name: "Pazo de Bentraces",
          detail: null,
          dayHint: 1,
          affiliateUrl: "https://www.booking.com/hotel/es/pazo.html?aid=1598831",
        },
        {
          id: "act-1",
          type: "activity",
          name: "Tour termal",
          detail: null,
          dayHint: 2,
          affiliateUrl: "https://www.civitatis.com/es/ourense/termas/?aid=1006",
        },
      ],
      basics: [],
      articleHtml: "",
      ogImage: null,
    },
  ]

  const sourceStay = assistantAddItemPreviewLink(
    {
      kind: "add_item",
      day_id: "d1",
      type: "stay",
      name: "Pazo de Bentraces",
      source_id: "src-1",
      source_item_id: "stay-1",
      day_number: 1,
    },
    sources,
    { startDate: checkin, currency: "EUR", numTravelers: 1 },
  )
  assert.ok(sourceStay)
  assert.equal(sourceStay.label, "Ver en Booking")
  assert.equal(sourceStay.affiliate, "partner")
  assert.equal(new URL(sourceStay.href).searchParams.get("aid"), "1598831")
  assert.equal(new URL(sourceStay.href).searchParams.get("checkin"), checkin)
  assert.equal(new URL(sourceStay.href).searchParams.get("checkout"), dateISOForDayIndex(checkin, 1))

  const sourceActivity = assistantAddItemPreviewLink(
    {
      kind: "add_item",
      day_id: "d1",
      type: "activity",
      name: "Tour termal",
      source_id: "src-1",
      source_item_id: "act-1",
      day_number: 2,
    },
    sources,
    { startDate: checkin },
  )
  assert.ok(sourceActivity)
  assert.equal(sourceActivity.label, "Ver en Civitatis")
  assert.equal(sourceActivity.affiliate, "partner")

  const ownStay = assistantAddItemPreviewLink(
    {
      kind: "add_item",
      day_id: "d1",
      type: "stay",
      name: "Hotel Goldener Adler",
      region: "Innsbruck",
      day_number: 1,
    },
    [],
    { startDate: checkin, currency: "EUR", numTravelers: 2 },
  )
  assert.ok(ownStay)
  assert.equal(ownStay.label, "Ver en Booking")
  assert.equal(ownStay.affiliate, "own")
  assert.equal(new URL(ownStay.href).searchParams.get("aid"), BOOKING_AFFILIATE_AID)
  assert.equal(new URL(ownStay.href).searchParams.get("ss"), "Hotel Goldener Adler Innsbruck")

  const museum = assistantAddItemPreviewLink(
    {
      kind: "add_item",
      day_id: "d1",
      type: "activity",
      name: "Museo do Pobo Galego",
      url: "https://museodopobo.gal/entradas",
      day_number: 1,
    },
    [],
    { startDate: checkin },
  )
  assert.ok(museum)
  assert.equal(museum.label, "Ver web")
  assert.equal(museum.affiliate, "auto")
  assert.equal(museum.href, "https://museodopobo.gal/entradas")

  const gyg = assistantAddItemPreviewLink(
    {
      kind: "add_item",
      day_id: "d1",
      type: "activity",
      name: "Free tour",
      url: "https://www.getyourguide.com/santiago-l123/",
      day_number: 1,
    },
    [],
    { startDate: checkin },
  )
  assert.ok(gyg)
  assert.equal(gyg.label, "Ver en GetYourGuide")

  assert.equal(
    assistantAddItemPreviewLink(
      {
        kind: "add_item",
        day_id: "d1",
        type: "food",
        name: "Pulpería",
        url: "https://pulperia.example/reserva",
      },
      [],
      { startDate: checkin },
    ),
    null,
  )
}

console.log("assistant-actions: ok")
