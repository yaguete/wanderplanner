import assert from "node:assert/strict"
import {
  buildSlots,
  isNoOpMove,
  resolveDropTarget,
  toMoveParams,
  type MeasuredDay,
  type MeasuredItem,
} from "./itinerary-dnd"

function item(id: string, top: number, height = 60): MeasuredItem {
  return { id, top, bottom: top + height }
}

function day(
  dayId: string,
  items: MeasuredItem[],
  top?: number,
  bottom?: number,
): MeasuredDay {
  const first = items[0]
  const last = items[items.length - 1]
  return {
    dayId,
    items,
    top: top ?? first?.top ?? 0,
    bottom: bottom ?? last?.bottom ?? 80,
  }
}

const d1 = day("d1", [item("a", 0), item("b", 70), item("c", 140)])
const dEmpty = day("d2", [], 220, 300)
const d3 = day("d3", [item("d", 320)])
const dLegs = day("d1", [
  item("leg-out", 0),
  item("hotel", 70),
  item("resto", 140),
])

// ── Mismo día hacia abajo: slotIndex - 1 ─────────────────────────────────────

{
  // Arrastrar A (index 0) al hueco antes de C (index 2) → [B, A, C]
  const slots = buildSlots([d1], "a")
  const beforeC = slots.find((s) => s.dayId === "d1" && s.index === 2)
  assert.ok(beforeC, "el hueco antes de C existe")
  assert.equal(beforeC!.y, 135, "centro del gap entre B y C (130–140)")
  const target = resolveDropTarget(slots, beforeC!.y)
  assert.deepEqual(target, { dayId: "d1", index: 2 })
  const params = toMoveParams(target!, { dayId: "d1", itemId: "a", index: 0 })
  assert.equal(params.toIndex, 1, "mismo día hacia abajo resta 1")
  assert.equal(params.toDayId, "d1")
}

{
  // Arrastrar B (index 1) al final (tras C, index 3) → [A, C, B]
  const slots = buildSlots([d1], "b")
  const afterC = slots.find((s) => s.dayId === "d1" && s.index === 3)
  assert.ok(afterC, "el hueco tras C existe")
  const params = toMoveParams(
    { dayId: "d1", index: 3 },
    { dayId: "d1", itemId: "b", index: 1 },
  )
  assert.equal(params.toIndex, 2, "slot 3 → toIndex 2 sobre el array sin B")
}

// ── Mismo día hacia arriba: sin corrección ───────────────────────────────────

{
  const params = toMoveParams(
    { dayId: "d1", index: 0 },
    { dayId: "d1", itemId: "c", index: 2 },
  )
  assert.equal(params.toIndex, 0)
  assert.equal(isNoOpMove(params, { dayId: "d1", itemId: "c", index: 2 }), false)
}

// ── No-op (soltar en el sitio) ───────────────────────────────────────────────

{
  const slots = buildSlots([d1], "b")
  const home = slots.find((s) => s.dayId === "d1" && s.index === 1)
  assert.ok(home, "el slot home del ítem arrastrado existe")
  assert.equal(home!.y, 100, "home en el centro del ítem (70+130)/2")
  const params = toMoveParams(
    { dayId: "d1", index: 1 },
    { dayId: "d1", itemId: "b", index: 1 },
  )
  assert.equal(params.toIndex, 1)
  assert.equal(isNoOpMove(params, { dayId: "d1", itemId: "b", index: 1 }), true)
}

{
  // Los dos huecos pegados a B (index 1 y 2) no se emiten como bordes del ítem.
  const slots = buildSlots([d1], "b")
  assert.equal(
    slots.some((s) => s.dayId === "d1" && s.index === 1 && s.y === 70),
    false,
    "no hay slot en el top de B",
  )
  assert.equal(
    slots.some((s) => s.dayId === "d1" && s.index === 2 && s.y === 140),
    false,
    "no hay slot en el top de C (pegado a B)",
  )
}

// ── Cruzar de día: índice tal cual ───────────────────────────────────────────

{
  const params = toMoveParams(
    { dayId: "d3", index: 0 },
    { dayId: "d1", itemId: "b", index: 1 },
  )
  assert.equal(params.toIndex, 0)
  assert.equal(params.toDayId, "d3")
  assert.equal(params.fromDayId, "d1")
}

{
  const params = toMoveParams(
    { dayId: "d3", index: 1 },
    { dayId: "d1", itemId: "a", index: 0 },
  )
  assert.equal(params.toIndex, 1, "cross-day no resta aunque index > fromIndex")
}

// ── Día vacío → index 0 ──────────────────────────────────────────────────────

{
  const slots = buildSlots([d1, dEmpty, d3], "a")
  const empty = slots.find((s) => s.dayId === "d2")
  assert.ok(empty)
  assert.equal(empty!.index, 0)
  assert.equal(empty!.y, 260, "centro de la sección vacía")
  const target = resolveDropTarget(slots, 260)
  assert.deepEqual(target, { dayId: "d2", index: 0 })
}

// ── Slots alrededor de un leg ────────────────────────────────────────────────

{
  const slots = buildSlots([dLegs], "hotel")
  const beforeLeg = slots.find((s) => s.dayId === "d1" && s.index === 0)
  assert.ok(beforeLeg, "se puede soltar delante de la ida")
  assert.equal(beforeLeg!.y, -5, "hueco centrado encima de la ida (gap 10)")
  const afterResto = slots.find((s) => s.dayId === "d1" && s.index === 3)
  assert.ok(afterResto, "se puede soltar detrás del último (tras el resto)")
  assert.equal(afterResto!.y, 205, "hueco centrado debajo del último")
}

// ── Extremos: por encima del primero / por debajo del último ─────────────────

{
  const slots = buildSlots([d1, d3], "b")
  const first = slots.reduce((a, b) => (a.y <= b.y ? a : b))
  const last = slots.reduce((a, b) => (a.y >= b.y ? a : b))
  assert.deepEqual(resolveDropTarget(slots, first.y - 400), {
    dayId: first.dayId,
    index: first.index,
  })
  assert.deepEqual(resolveDropTarget(slots, last.y + 400), {
    dayId: last.dayId,
    index: last.index,
  })
  assert.equal(resolveDropTarget([], 0), null)
}

// ── Eco no medido: soltar sobre su franja cae en ESE día, no en el anterior ─

{
  // Día 1 acaba en y=80. Día 2 tiene un eco visual 80–250 que NO se mide;
  // el primer ítem medido está en 250. Sin acotar por día, y=120 elige el
  // hueco final de d1 (distancia 40 vs 125).
  const d1echo = day("d1", [item("a", 0, 60)], 0, 80)
  const d2echo = day("d2", [item("b", 250, 60)], 80, 320)
  const slots = buildSlots([d1echo, d2echo], "z")
  const unscoped = resolveDropTarget(slots, 120)
  assert.equal(unscoped?.dayId, "d1", "sin days, el eco 'pertenece' al día anterior")
  const scoped = resolveDropTarget(slots, 120, [d1echo, d2echo])
  assert.equal(scoped?.dayId, "d2")
  assert.equal(scoped?.index, 0)
}

console.log("itinerary-dnd: ok")
