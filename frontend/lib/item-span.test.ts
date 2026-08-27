import assert from "node:assert/strict"
import type { UserDay, UserDayItem } from "@/types/itinerary"
import { sanitizeUserDayItem } from "./route-legs"
import {
  applySpanDays,
  clipSpanDaysInDays,
  clipSpanToTrip,
  expandSpannedItems,
  filterStaySpanPins,
  hasFiniteLngLat,
  listStaySpanMapAnchors,
  parseSpanDays,
  reanchorSpannedStays,
  spanDaysAfterDroppingEcho,
  spanDaysForWrite,
  spanAnchorLabel,
  spanEchoLabel,
  spanEchoRemoveLabel,
  staySpanClosesDay,
  staySpanOpensDay,
  staySpanPlaceId,
  unionStayDayIndexes,
} from "./item-span"

function stay(
  overrides: Partial<UserDayItem> & Pick<UserDayItem, "id" | "name">,
): UserDayItem {
  return {
    sourceItemId: overrides.id,
    sourceId: "manual",
    type: "stay",
    detail: null,
    sourceAuthor: "Tú",
    ...overrides,
  }
}

function activity(id: string, name: string): UserDayItem {
  return {
    id,
    sourceItemId: id,
    sourceId: "src",
    type: "activity",
    name,
    detail: null,
    sourceAuthor: "Ana",
  }
}

function daysOf(...itemsByDay: UserDayItem[][]): UserDay[] {
  return itemsByDay.map((items, i) => ({
    id: `d${i}`,
    label: "",
    items,
  }))
}

const BUD = { lng: 19.059, lat: 47.501 }

// ── parse / clip / write ─────────────────────────────────────────────────────

assert.equal(parseSpanDays(undefined), undefined)
assert.equal(parseSpanDays(1), undefined)
assert.equal(parseSpanDays(1.5), undefined)
assert.equal(parseSpanDays("3"), undefined)
assert.equal(parseSpanDays(NaN), undefined)
assert.equal(parseSpanDays(0), undefined)
assert.equal(parseSpanDays(-2), undefined)
assert.equal(parseSpanDays(3), 3)
assert.equal(parseSpanDays(60), 60)
assert.equal(parseSpanDays(61), 60)

assert.equal(clipSpanToTrip(0, 3, 7), 3)
assert.equal(clipSpanToTrip(5, 3, 7), 2)
assert.equal(clipSpanToTrip(6, 3, 7), 1)
assert.equal(clipSpanToTrip(0, 3, 0), 1)
assert.equal(spanDaysForWrite(3, 0, 7), 3)
assert.equal(spanDaysForWrite(1, 0, 7), undefined)
assert.equal(spanDaysForWrite(5, 6, 7), undefined)

assert.equal(spanDaysAfterDroppingEcho(2), undefined)
assert.equal(spanDaysAfterDroppingEcho(3), 2)
assert.equal(spanDaysAfterDroppingEcho(1), undefined)

{
  const item = stay({ id: "h", name: "Hotel", spanDays: 5 })
  const clipped = applySpanDays(item, 5, 4, 6)
  assert.equal(clipped.spanDays, 2)
  const one = applySpanDays(item, 5, 5, 6)
  assert.equal(one.spanDays, undefined)
}

// ── sanitizeUserDayItem: stay SIN route (el early-return viejo lo ignoraba) ─

{
  const garbage = stay({ id: "h", name: "Hotel", spanDays: 1.5 as never })
  const cleaned = sanitizeUserDayItem(garbage)
  assert.equal(cleaned.spanDays, undefined)
  assert.equal(cleaned.route, undefined)
}

{
  const one = stay({ id: "h", name: "Hotel", spanDays: 1 })
  const cleaned = sanitizeUserDayItem(one)
  assert.equal(cleaned.spanDays, undefined)
}

{
  const ok = stay({ id: "h", name: "Hotel", spanDays: 3, coords: BUD })
  const cleaned = sanitizeUserDayItem(ok)
  assert.equal(cleaned.spanDays, 3)
  assert.equal(cleaned, ok)
}

{
  const noSpan = stay({ id: "h", name: "Hotel" })
  assert.equal(sanitizeUserDayItem(noSpan), noSpan)
}

// ── expandSpannedItems: un ancla, ecos; borrar día del medio ─────────────────

{
  const hotel = stay({ id: "full-moon", name: "Full Moon Budapest", spanDays: 3, coords: BUD })
  const days = daysOf(
    [hotel, activity("a1", "Ruin pub")],
    [activity("a2", "Parlamento")],
    [activity("a3", "Termas")],
    [activity("a4", "Mercado")],
  )
  const slots = expandSpannedItems(days)
  assert.equal(slots.length, 4)

  assert.equal(slots[0]!.length, 2)
  assert.equal(slots[0]![0]!.item.id, "full-moon")
  assert.equal(slots[0]![0]!.isEcho, false)
  assert.equal(slots[0]![0]!.spanTotal, 3)
  assert.equal(slots[0]![0]!.spanIndex, 1)

  assert.equal(slots[1]!.length, 2)
  assert.equal(slots[1]![0]!.isEcho, true)
  assert.equal(slots[1]![0]!.spanIndex, 2)
  assert.equal(slots[1]![0]!.spanTotal, 3)
  assert.equal(slots[1]![0]!.item.id, "full-moon")
  assert.equal(slots[1]![1]!.item.id, "a2")

  assert.equal(slots[2]![0]!.isEcho, true)
  assert.equal(slots[2]![0]!.spanIndex, 3)
  assert.equal(slots[3]!.some((s) => s.item.id === "full-moon"), false)

  // jsonb: un solo ítem
  assert.equal(days.flatMap((d) => d.items).filter((i) => i.id === "full-moon").length, 1)

  // Borrar el día 2 (índice 1): el ancla sigue; los ecos se recalculan.
  const afterDelete = [days[0]!, days[2]!, days[3]!]
  const again = expandSpannedItems(afterDelete)
  assert.equal(again[0]![0]!.item.id, "full-moon")
  assert.equal(again[0]![0]!.isEcho, false)
  assert.equal(again[1]![0]!.isEcho, true)
  assert.equal(again[1]![0]!.spanIndex, 2)
  assert.equal(again[2]!.some((s) => s.item.id === "full-moon"), true)
  assert.equal(again[2]!.find((s) => s.item.id === "full-moon")!.isEcho, true)
}

{
  // Fuente replicada en 3 días: sin ecos (ya está el ítem).
  const copies = daysOf(
    [stay({ id: "s1", name: "Pensión Paco" })],
    [stay({ id: "s2", name: "Pensión Paco" })],
    [stay({ id: "s3", name: "Pensión Paco" })],
  )
  const slots = expandSpannedItems(copies)
  assert.equal(slots.every((day) => day.every((s) => !s.isEcho)), true)
  assert.equal(slots.flat().length, 3)
}

{
  // Transport / food con spanDays no generan ecos. Activity sí.
  const car: UserDayItem = {
    id: "car",
    sourceItemId: "car",
    sourceId: "manual",
    type: "transport",
    name: "Hertz",
    detail: null,
    sourceAuthor: "Tú",
    spanDays: 5,
  }
  const dinner: UserDayItem = {
    id: "dinner",
    sourceItemId: "dinner",
    sourceId: "manual",
    type: "food",
    name: "Borkonyha",
    detail: null,
    sourceAuthor: "Tú",
    spanDays: 3,
  }
  const days = daysOf([car, dinner], [], [], [], [])
  const slots = expandSpannedItems(days)
  assert.equal(slots[1]!.length, 0)
  assert.equal(slots[0]![0]!.isEcho, false)
  assert.equal(slots[0]![0]!.spanTotal, 1)
}

{
  const trek = activity("bhutan", "Excursión a Bután")
  trek.sourceId = "manual"
  trek.sourceAuthor = "Tú"
  trek.spanDays = 5
  const days = daysOf([trek], [], [], [], [], [])
  const slots = expandSpannedItems(days)
  assert.equal(slots[0]![0]!.isEcho, false)
  assert.equal(slots[0]![0]!.spanTotal, 5)
  assert.equal(slots[1]![0]!.isEcho, true)
  assert.equal(slots[1]![0]!.spanIndex, 2)
  assert.equal(slots[4]![0]!.spanIndex, 5)
  assert.equal(slots[5]!.some((s) => s.item.id === "bhutan"), false)
  assert.equal(spanAnchorLabel("activity", 5), "5 días")
  assert.equal(spanEchoLabel("activity", 3, 5), "Día 3 de 5")
  assert.equal(spanEchoRemoveLabel("activity"), "Acortar la actividad")
  assert.equal(spanAnchorLabel("stay", 3), "3 noches")
  assert.equal(spanEchoLabel("stay", 2, 3), "Noche 2 de 3")
}

// ── Anclas de mapa: coords obligatorias; cierra / abre ───────────────────────

{
  const hotel = stay({
    id: "full-moon",
    name: "Full Moon",
    spanDays: 3,
    coords: BUD,
    region: "Király utca 15",
  })
  const days = daysOf([hotel], [], [], [])
  const anchors = listStaySpanMapAnchors(days)
  assert.equal(anchors.length, 1)
  assert.equal(staySpanClosesDay(anchors[0]!, 0), true)
  assert.equal(staySpanClosesDay(anchors[0]!, 2), true)
  assert.equal(staySpanClosesDay(anchors[0]!, 3), false)
  assert.equal(staySpanOpensDay(anchors[0]!, 0), false)
  assert.equal(staySpanOpensDay(anchors[0]!, 1), true)
  assert.equal(staySpanOpensDay(anchors[0]!, 3), true)
  assert.equal(staySpanOpensDay(anchors[0]!, 4), false)
  assert.equal(staySpanPlaceId("full-moon", "open", 2), "full-moon::open::2")
}

{
  const noCoords = stay({ id: "h", name: "Hotel", spanDays: 3 })
  assert.equal(hasFiniteLngLat(noCoords.coords), false)
  assert.equal(listStaySpanMapAnchors(daysOf([noCoords], [], [])).length, 0)
}

// ── clip al dato; reanclar al borrar el día ancla ────────────────────────────

{
  const hotel = stay({ id: "h", name: "Hotel", spanDays: 3, coords: BUD })
  const days = daysOf([hotel], [], [])
  const clipped = clipSpanDaysInDays(days)
  assert.equal(clipped[0]!.items[0]!.spanDays, 3)

  const overflow = daysOf(
    [],
    [],
    [stay({ id: "h", name: "Hotel", spanDays: 5, coords: BUD })],
  )
  const cut = clipSpanDaysInDays(overflow)
  assert.equal(cut[2]!.items[0]!.spanDays, undefined)
}

{
  const hotel = stay({ id: "h", name: "Hotel", spanDays: 3, coords: BUD })
  const before = daysOf([hotel], [activity("a2", "X")], [activity("a3", "Y")], [activity("a4", "Z")])
  const after = [before[1]!, before[2]!, before[3]!]
  const rescued = reanchorSpannedStays(before, after)
  const moved = rescued[0]!.items.find((i) => i.id === "h")
  assert.ok(moved)
  assert.equal(moved!.spanDays, 2)
  assert.equal(
    rescued.flatMap((d) => d.items).filter((i) => i.id === "h").length,
    1,
  )
}

{
  // Borrar todos los días cubiertos: el stay no se rescata.
  const hotel = stay({ id: "h", name: "Hotel", spanDays: 3 })
  const before = daysOf([hotel], [], [])
  const after = [] as UserDay[]
  assert.deepEqual(reanchorSpannedStays(before, after), after)
}

{
  const indexes = unionStayDayIndexes([0], 0, 3, 7)
  assert.deepEqual(indexes, [0, 1, 2])
  const mixed = unionStayDayIndexes([2, 0], 0, 3, 7)
  assert.deepEqual(mixed, [0, 1, 2])
}

{
  // Mover el ancla al último día: el dato se recorta (no re-expande al alargar).
  const moved = applySpanDays(stay({ id: "h", name: "Hotel", spanDays: 3 }), 3, 4, 5)
  assert.equal(moved.spanDays, undefined)
}

{
  const places = [
    { id: "h", spanRole: undefined, spanAnchorId: undefined },
    { id: "h::close::1", spanRole: "close" as const, spanAnchorId: "h" },
    { id: "a", spanRole: undefined, spanAnchorId: undefined },
    { id: "h::open::2", spanRole: "open" as const, spanAnchorId: "h" },
    { id: "h::close::2", spanRole: "close" as const, spanAnchorId: "h" },
  ]
  assert.deepEqual(
    filterStaySpanPins(places, null).map((p) => p.id),
    ["h", "a"],
  )
  const day2 = places.filter((p) => p.id !== "h" && p.id !== "h::close::1" && p.id !== "a")
  assert.deepEqual(
    filterStaySpanPins(day2, 2).map((p) => p.id),
    ["h::open::2"],
  )
}

console.log("item-span: ok")
