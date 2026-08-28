import assert from "node:assert/strict"
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

console.log("trip-open-guard: ok")
