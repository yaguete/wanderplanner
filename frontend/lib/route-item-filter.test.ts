import assert from "node:assert/strict"
import type { UserDay, UserDayItem, TripTaskState } from "@/types/itinerary"
import { taskKeyForItem } from "@/lib/trip-tasks"
import {
  ALL_ROUTE_ITEM_CATEGORIES,
  allRouteItemCategoriesSelected,
  itemMatchesRouteFilter,
  parseRouteItemFilter,
  routeFilterShowsPlaces,
  routeFilterShowsTransport,
  routeItemCategory,
  routeItemFilterTriggerLabel,
  toggleAllRouteItemCategories,
  toggleRouteItemCategory,
} from "./route-item-filter"

function item(
  overrides: Partial<UserDayItem> & Pick<UserDayItem, "id" | "type" | "name">,
): UserDayItem {
  return {
    sourceItemId: "src-item",
    sourceId: "src-1",
    detail: null,
    sourceAuthor: "Autor",
    ...overrides,
  }
}

const stay = item({ id: "s1", type: "stay", name: "Hotel" })
const food = item({ id: "f1", type: "food", name: "Pub" })
const transport = item({
  id: "t1",
  type: "transport",
  name: "Ida",
})
const walk = item({ id: "a1", type: "activity", name: "Mirador" })
const tour = item({
  id: "a2",
  type: "activity",
  name: "Tour del castillo",
  affiliateUrl: "https://www.civitatis.com/es/edimburgo/castillo/",
})

assert.equal(routeItemCategory(stay, null), "stay")
assert.equal(routeItemCategory(food, null), "food")
assert.equal(routeItemCategory(transport, null), "transport")
assert.equal(routeItemCategory(walk, null), "place")
assert.equal(routeItemCategory(tour, null), "activity")

{
  const pending: TripTaskState = {
    status: "pending",
    cost: null,
    cancellable: null,
    notes: null,
    updatedAt: "2026-09-07T00:00:00.000Z",
  }
  assert.equal(routeItemCategory(walk, pending), "activity")
}

{
  const notNeeded: TripTaskState = {
    status: "notNeeded",
    cost: null,
    cancellable: null,
    notes: null,
    updatedAt: "2026-09-07T00:00:00.000Z",
  }
  assert.equal(routeItemCategory(tour, notNeeded), "place")
  assert.equal(routeItemCategory(walk, notNeeded), "place")
}

const all = new Set(ALL_ROUTE_ITEM_CATEGORIES)
assert.equal(allRouteItemCategoriesSelected(all), true)
assert.equal(allRouteItemCategoriesSelected(new Set()), false)
assert.equal(allRouteItemCategoriesSelected(new Set(["stay"])), false)

assert.equal(toggleAllRouteItemCategories(all).size, 0)
assert.deepEqual(
  [...toggleAllRouteItemCategories(new Set())],
  [...ALL_ROUTE_ITEM_CATEGORIES],
)
assert.deepEqual(
  [...toggleAllRouteItemCategories(new Set(["stay"]))],
  [...ALL_ROUTE_ITEM_CATEGORIES],
)

{
  const next = toggleRouteItemCategory(all, "food")
  assert.equal(next.has("food"), false)
  assert.equal(next.size, 4)
  const back = toggleRouteItemCategory(next, "food")
  assert.equal(back.has("food"), true)
}

assert.equal(routeFilterShowsPlaces(all), true)
assert.equal(routeFilterShowsTransport(all), true)
assert.equal(routeFilterShowsPlaces(new Set(["transport"])), false)
assert.equal(routeFilterShowsTransport(new Set(["stay", "food"])), false)
assert.equal(routeFilterShowsPlaces(new Set(["place"])), true)

assert.equal(routeItemFilterTriggerLabel(all), "Mostrar todo")
assert.equal(routeItemFilterTriggerLabel(new Set()), "Ninguna")
assert.equal(routeItemFilterTriggerLabel(new Set(["stay"])), "Alojamientos")
assert.equal(routeItemFilterTriggerLabel(new Set(["stay", "food"])), "2 categorías")

{
  const days: UserDay[] = [
    { id: "d1", label: "", items: [stay, walk, tour, food, transport] },
  ]
  const tasks: Record<string, TripTaskState> = {
    [taskKeyForItem(tour)]: {
      status: "notNeeded",
      cost: null,
      cancellable: null,
      notes: null,
      updatedAt: "2026-09-07T00:00:00.000Z",
    },
  }
  assert.equal(itemMatchesRouteFilter(stay, days, tasks, all), true)
  assert.equal(itemMatchesRouteFilter(stay, days, tasks, new Set()), false)
  assert.equal(itemMatchesRouteFilter(stay, days, tasks, new Set(["stay"])), true)
  assert.equal(itemMatchesRouteFilter(food, days, tasks, new Set(["stay"])), false)
  assert.equal(itemMatchesRouteFilter(walk, days, tasks, new Set(["place"])), true)
  assert.equal(itemMatchesRouteFilter(tour, days, tasks, new Set(["place"])), true)
  assert.equal(itemMatchesRouteFilter(tour, days, tasks, new Set(["activity"])), false)
}

assert.deepEqual(parseRouteItemFilter(null), null)
assert.deepEqual(parseRouteItemFilter("stay"), null)
assert.deepEqual(parseRouteItemFilter([]), [])
assert.deepEqual(parseRouteItemFilter(["stay", "food"]), ["stay", "food"])
assert.deepEqual(parseRouteItemFilter(["stay", "stay", "nope"]), ["stay"])
assert.equal(parseRouteItemFilter(["nope", 1]), null)

console.log("route-item-filter: ok")
