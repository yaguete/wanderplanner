import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  shouldBeginOpenTrip,
  shouldBounceMissingTrip,
  tripsQueryPending,
} from "./trip-open-guard"

assert.equal(
  tripsQueryPending({
    authLoading: false,
    tripsLoading: false,
    userId: "u1",
    rehydrated: false,
  }),
  true,
  "con usuario y sin snapshot aún se está cargando",
)
assert.equal(
  tripsQueryPending({
    authLoading: false,
    tripsLoading: false,
    userId: "u1",
    rehydrated: true,
  }),
  false,
)
assert.equal(
  tripsQueryPending({
    authLoading: false,
    tripsLoading: false,
    userId: null,
    rehydrated: false,
  }),
  false,
)
assert.equal(
  tripsQueryPending({
    authLoading: true,
    tripsLoading: false,
    userId: null,
    rehydrated: false,
  }),
  true,
)

assert.equal(
  shouldBounceMissingTrip({
    authLoading: false,
    tripsPending: false,
    userId: "u1",
    tripFound: false,
    openingTripId: null,
    tripId: "t1",
  }),
  true,
)
assert.equal(
  shouldBounceMissingTrip({
    authLoading: false,
    tripsPending: true,
    userId: "u1",
    tripFound: false,
    openingTripId: null,
    tripId: "t1",
  }),
  false,
  "no redirigir mientras el snapshot no ha cerrado",
)
assert.equal(
  shouldBounceMissingTrip({
    authLoading: false,
    tripsPending: false,
    userId: "u1",
    tripFound: false,
    openingTripId: "t1",
    tripId: "t1",
  }),
  false,
  "el overlay de apertura cubre el hueco",
)
assert.equal(
  shouldBounceMissingTrip({
    authLoading: false,
    tripsPending: false,
    userId: "u1",
    tripFound: true,
    openingTripId: null,
    tripId: "t1",
  }),
  false,
)

assert.equal(shouldBeginOpenTrip(), true)
assert.equal(
  shouldBeginOpenTrip({
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    button: 0,
  }),
  true,
)
assert.equal(
  shouldBeginOpenTrip({
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  }),
  true,
  "touch/pointer sin `button` cuenta como primario",
)
assert.equal(
  shouldBeginOpenTrip({
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    button: 0,
  }),
  false,
)

/*
 * El velo de «Abriendo el viaje» no puede comerse el click que lo abre.
 *
 * Si el overlay se monta entre el `pointerdown` y el `pointerup` de un tap, el
 * navegador dispara el `click` en el ancestro común de ambos targets — el
 * `<main>`, no el `<a>` — y la navegación no ocurre. Dos invariantes, las dos
 * comprobadas sobre el fuente porque el fallo es de fuente, no de lógica:
 * el overlay es inerte al puntero, y `beginOpenTrip` solo cuelga de `onClick`.
 */
const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8")

const overlay = read("../components/opening-trip.tsx")
const overlayClass = /export function OpeningTripOverlay[\s\S]*?className="([^"]*)"/.exec(
  overlay,
)
assert.ok(overlayClass, "OpeningTripOverlay: no se ha encontrado el className del velo")
assert.ok(
  overlayClass[1].split(/\s+/).includes("pointer-events-none"),
  "OpeningTripOverlay debe ser inerte al puntero o se come el click de la tarjeta",
)

for (const rel of ["../app/(app)/trips/page.tsx", "../components/app-sidebar.tsx"]) {
  const src = read(rel)
  const onPointerDown = /onPointerDown=\{[\s\S]{0,120}?beginOpenTrip/.test(src)
  assert.equal(
    onPointerDown,
    false,
    `${rel}: beginOpenTrip va en onClick, nunca en onPointerDown`,
  )
}

console.log("trip-open-guard: ok")
