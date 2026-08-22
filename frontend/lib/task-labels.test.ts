import assert from "node:assert/strict"
import {
  formatTaskDays,
  formatTripCurrency,
  parseCostInput,
  TASK_CATEGORY_ORDER,
  taskActionTitle,
  taskGroupKey,
} from "./task-labels"
import type { TaskGroupCategory } from "@/types/itinerary"
import type { DerivedTripTask } from "./trip-tasks"

function task(
  partial: Partial<DerivedTripTask> &
    Pick<DerivedTripTask, "origin" | "sourceKind" | "title">,
): Pick<
  DerivedTripTask,
  "origin" | "sourceKind" | "title" | "route" | "roundtripFlight" | "affiliateUrl"
> {
  return partial
}

// Verbos por ItemType.
assert.equal(
  taskActionTitle(task({ origin: "dayItem", sourceKind: "stay", title: "Full Moon Budapest" })),
  "Reservar Full Moon Budapest",
)
assert.equal(
  taskActionTitle(task({ origin: "dayItem", sourceKind: "transport", title: "el coche" })),
  "Comprar el coche",
)

// T4B.3: verbos según route.mode.
assert.equal(
  taskActionTitle(
    task({
      origin: "dayItem",
      sourceKind: "transport",
      title: "Barcelona → Granada",
      route: {
        from: { label: "Barcelona", coords: { lng: 2, lat: 41 }, kind: "city" },
        to: { label: "Granada", coords: { lng: -3, lat: 37 }, kind: "city" },
        mode: null,
        leg: "outbound",
      },
    }),
  ),
  "Decidir cómo llegar a Granada",
)
assert.equal(
  taskActionTitle(
    task({
      origin: "dayItem",
      sourceKind: "transport",
      title: "Barcelona → Granada",
      route: {
        from: { label: "Barcelona", coords: { lng: 2, lat: 41 }, kind: "city" },
        to: { label: "Granada", coords: { lng: -3, lat: 37 }, kind: "city" },
        mode: "flight",
        leg: "outbound",
      },
    }),
  ),
  "Comprar los vuelos a Granada",
)
assert.equal(
  taskActionTitle(
    task({
      origin: "dayItem",
      sourceKind: "transport",
      title: "Granada → Barcelona",
      route: {
        from: { label: "Granada", coords: { lng: -3, lat: 37 }, kind: "city" },
        to: { label: "Barcelona", coords: { lng: 2, lat: 41 }, kind: "city" },
        mode: "train",
        leg: "return",
      },
    }),
  ),
  "Reservar el tren a Barcelona",
)
assert.equal(
  taskActionTitle(
    task({
      origin: "dayItem",
      sourceKind: "transport",
      title: "Barcelona → Granada",
      route: {
        from: { label: "Barcelona", coords: { lng: 2, lat: 41 }, kind: "city" },
        to: { label: "Granada", coords: { lng: -3, lat: 37 }, kind: "city" },
        mode: "car",
        leg: "outbound",
      },
    }),
  ),
  "Preparar el trayecto en coche a Granada",
)
assert.equal(
  taskActionTitle(
    task({
      origin: "dayItem",
      sourceKind: "transport",
      title: "Barcelona → Vienna International Airport",
      route: {
        from: { label: "Barcelona", coords: { lng: 2.08, lat: 41.3 }, kind: "airport" },
        to: {
          label: "Vienna International Airport",
          coords: { lng: 16.57, lat: 48.11 },
          kind: "airport",
        },
        mode: "flight",
        leg: "outbound",
      },
    }),
  ),
  "Comprar los vuelos a VIE",
)
assert.equal(
  taskActionTitle(
    task({
      origin: "dayItem",
      sourceKind: "transport",
      title: "Barcelona → Viena",
      roundtripFlight: true,
      route: {
        from: { label: "Barcelona", coords: { lng: 2.17, lat: 41.38 }, kind: "city" },
        to: { label: "Viena", coords: { lng: 16.37, lat: 48.21 }, kind: "city" },
        mode: "flight",
        leg: "outbound",
      },
    }),
  ),
  "Comprar los vuelos Barcelona ⇄ Viena",
)
assert.equal(
  taskActionTitle(task({ origin: "dayItem", sourceKind: "activity", title: "Cascada de Juneau" })),
  "Cascada de Juneau",
)
assert.equal(
  taskActionTitle(
    task({
      origin: "dayItem",
      sourceKind: "activity",
      title: "Avistamiento de osos grizzly",
      affiliateUrl: "https://www.civitatis.com/x",
    }),
  ),
  "Avistamiento de osos grizzly",
)
assert.equal(
  taskActionTitle(task({ origin: "dayItem", sourceKind: "food", title: "Borkonyha" })),
  "Reservar Borkonyha",
)

// Verbos por BasicCategory.
assert.equal(
  taskActionTitle(task({ origin: "basic", sourceKind: "insurance", title: "los vuelos" })),
  "Contratar los vuelos",
)
assert.equal(
  taskActionTitle(task({ origin: "basic", sourceKind: "insurance", title: "el seguro" })),
  "Contratar el seguro",
)
assert.equal(
  taskActionTitle(task({ origin: "basic", sourceKind: "sim", title: "la SIM" })),
  "Comprar la SIM",
)
assert.equal(
  taskActionTitle(task({ origin: "basic", sourceKind: "carRental", title: "el coche" })),
  "Alquilar el coche",
)
assert.equal(
  taskActionTitle(task({ origin: "basic", sourceKind: "flight", title: "los vuelos" })),
  "Comprar los vuelos",
)
assert.equal(
  taskActionTitle(task({ origin: "basic", sourceKind: "other", title: "visado" })),
  "Gestionar visado",
)

// Extras: texto del usuario sin verbo automático.
assert.equal(
  taskActionTitle(task({ origin: "extra", sourceKind: "other", title: "Pedir cita en el consulado" })),
  "Pedir cita en el consulado",
)

// Días: uno, contiguos, discontinuos, noches.
assert.equal(formatTaskDays([1]), "día 2")
assert.equal(formatTaskDays([0, 1, 2]), "días 1–3")
assert.equal(formatTaskDays([0, 2]), "días 1, 3")
assert.equal(formatTaskDays([0, 1, 2], 3), "Días 1–3 (3 noches)")
assert.equal(formatTaskDays([0], 1), "Día 1 (1 noche)")
assert.equal(formatTaskDays([]), null)

// Con startDate: anexa weekday + día + mes corto.
assert.equal(formatTaskDays([0], undefined, "2026-08-09"), "día 1 · dom 9 ago")
assert.equal(formatTaskDays([0], 1, "2026-08-09"), "dom 9 ago (1 noche)")
assert.equal(
  formatTaskDays([0, 1], 2, "2026-08-09"),
  "dom 9 ago – lun 10 ago (2 noches)",
)
assert.equal(
  formatTaskDays([0, 1, 2], undefined, "2026-08-09"),
  "días 1–3 · dom 9 ago – mar 11 ago",
)
assert.equal(
  formatTaskDays([0, 8], undefined, "2026-08-24", { roundtrip: true }),
  "ida lun 24 ago · vuelta mar 1 sept",
)
assert.equal(
  formatTaskDays([0, 0], undefined, "2026-08-24", { roundtrip: true }),
  "lun 24 ago",
)
assert.equal(
  formatTaskDays([0, 8], undefined, null, { roundtrip: true }),
  "ida día 1 · vuelta día 9",
)

// Agrupación visual.
assert.equal(taskGroupKey("paperwork"), "other")
assert.equal(taskGroupKey("health"), "other")
assert.equal(taskGroupKey("accommodation"), "accommodation")

{
  const expected: TaskGroupCategory[] = [
    "accommodation",
    "transport",
    "activity",
    "food",
    "basic",
    "other",
  ]
  assert.deepEqual([...TASK_CATEGORY_ORDER], expected)
  assert.equal(new Set(TASK_CATEGORY_ORDER).size, expected.length)
}

// Divisa y parseo de coste.
assert.match(formatTripCurrency(840, "EUR"), /840/)
assert.match(formatTripCurrency(12.5, "NOTAREALCURRENCY"), /12[,.]5/)
assert.equal(parseCostInput(""), null)
assert.equal(parseCostInput("  "), null)
assert.equal(parseCostInput("12,50"), 12.5)
assert.equal(parseCostInput("12.50"), 12.5)
assert.equal(parseCostInput("-3"), null)
assert.equal(parseCostInput("abc"), null)

console.log("task-labels: ok")
