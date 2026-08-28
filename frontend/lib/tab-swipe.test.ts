import assert from "node:assert/strict"
import {
  TAB_SWIPE_DOMINANCE,
  TAB_SWIPE_EDGE_GUARD,
  TAB_SWIPE_MIN_DX,
  tabAfterSwipe,
  tabSwipeIntent,
} from "./tab-swipe"

const VIEWPORT = 390

assert.equal(
  tabSwipeIntent({
    dx: -(TAB_SWIPE_MIN_DX + 8),
    dy: 4,
    startX: 180,
    viewportWidth: VIEWPORT,
  }),
  "next",
  "flick a la izquierda avanza de pestaña",
)
assert.equal(
  tabSwipeIntent({
    dx: TAB_SWIPE_MIN_DX + 8,
    dy: -6,
    startX: 180,
    viewportWidth: VIEWPORT,
  }),
  "prev",
  "flick a la derecha vuelve a la pestaña anterior",
)
assert.equal(
  tabSwipeIntent({
    dx: -(TAB_SWIPE_MIN_DX - 1),
    dy: 0,
    startX: 180,
    viewportWidth: VIEWPORT,
  }),
  "ignore",
  "un desplazamiento corto no cuenta como gesto",
)
assert.equal(
  tabSwipeIntent({
    dx: -TAB_SWIPE_MIN_DX,
    dy: TAB_SWIPE_MIN_DX / TAB_SWIPE_DOMINANCE,
    startX: 180,
    viewportWidth: VIEWPORT,
  }),
  "ignore",
  "un diagonal 2:1 lo gana el scroll vertical",
)
assert.equal(
  tabSwipeIntent({
    dx: TAB_SWIPE_MIN_DX + 20,
    dy: 8,
    startX: TAB_SWIPE_EDGE_GUARD - 1,
    viewportWidth: VIEWPORT,
  }),
  "ignore",
  "desde el borde izquierdo no pelea con el atrás de iOS",
)
assert.equal(
  tabSwipeIntent({
    dx: -(TAB_SWIPE_MIN_DX + 20),
    dy: 8,
    startX: VIEWPORT - TAB_SWIPE_EDGE_GUARD + 1,
    viewportWidth: VIEWPORT,
  }),
  "ignore",
  "desde el borde derecho no pelea con el atrás de Android",
)
assert.equal(
  tabSwipeIntent({
    dx: -(TAB_SWIPE_MIN_DX + 20),
    dy: 8,
    startX: TAB_SWIPE_EDGE_GUARD - 1,
    viewportWidth: VIEWPORT,
  }),
  "next",
  "desde el borde izquierdo sí se puede avanzar (no es el gesto de atrás)",
)

const tabs = [
  { id: "source" as const },
  { id: "itinerary" as const },
  { id: "transport" as const },
  { id: "basics" as const },
]

assert.equal(tabAfterSwipe(tabs, "source", "next"), "itinerary")
assert.equal(tabAfterSwipe(tabs, "itinerary", "prev"), "source")
assert.equal(tabAfterSwipe(tabs, "source", "prev"), null, "en la primera no envuelve")
assert.equal(tabAfterSwipe(tabs, "basics", "next"), null, "en la última no envuelve")
assert.equal(
  tabAfterSwipe([{ id: "source" as const }, { id: "itinerary" as const }], "itinerary", "next"),
  null,
  "Instagram sin Desplazamientos/Descuentos tampoco envuelve",
)

console.log("tab-swipe: ok")
