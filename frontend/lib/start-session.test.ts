import assert from "node:assert/strict"
import {
  decideStart,
  isDefinitivelyDeadAnonymousSession,
  toStartCandidate,
  tripHasUserWork,
  type StartCandidateInput,
  type StartCandidateTrip,
} from "./start-session"
import type { UserDayItem } from "@/types/itinerary"

function trip(patch: Partial<StartCandidateInput> = {}): StartCandidateInput {
  return {
    id: "t1",
    name: "Mi viaje",
    archived: false,
    referrer: null,
    sourceIds: [],
    startDate: null,
    days: [{ id: "d1", label: "", items: [] }],
    basics: [],
    extraTasks: [],
    tasks: {},
    expectations: null,
    numTravelers: null,
    seedSourceKey: null,
    ...patch,
  }
}

function candidate(patch: Partial<StartCandidateInput> = {}): StartCandidateTrip {
  return toStartCandidate(trip(patch))
}

const item: UserDayItem = {
  id: "i1",
  sourceItemId: "si1",
  sourceId: "manual",
  type: "activity",
  name: "Mirador",
  detail: null,
  sourceAuthor: "manual",
}

// ── tripHasUserWork ──────────────────────────────────────────────────────────

assert.equal(tripHasUserWork(trip()), false, "borrador vacío")
assert.equal(
  tripHasUserWork(
    trip({
      startDate: "2026-08-19",
      days: [
        { id: "d1", label: "", items: [] },
        { id: "d2", label: "", items: [] },
      ],
    }),
  ),
  false,
  "adoptar calendario del partner no es trabajo",
)
assert.equal(tripHasUserWork(trip({ days: [{ id: "d1", label: "Hallstatt", items: [] }] })), true)
assert.equal(tripHasUserWork(trip({ days: [{ id: "d1", label: "", items: [item] }] })), true)
assert.equal(
  tripHasUserWork(
    trip({
      basics: [
        {
          id: "b1",
          sourceBasicItemId: "sb1",
          sourceId: "manual",
          category: "sim",
          name: "SIM",
          detail: null,
          vendor: null,
          affiliateUrl: null,
          sourceAuthor: "manual",
        },
      ],
    }),
  ),
  true,
)
assert.equal(
  tripHasUserWork(
    trip({
      extraTasks: [
        {
          id: "e1",
          title: "Visa",
          category: "paperwork",
          state: { status: "pending", cost: null, cancellable: null, notes: null, updatedAt: "2026-08-18T00:00:00Z" },
        },
      ],
    }),
  ),
  true,
)
assert.equal(
  tripHasUserWork(
    trip({
      tasks: {
        "activity:mirador": {
          status: "pending",
          cost: null,
          cancellable: null,
          notes: null,
          updatedAt: "2026-08-18T00:00:00Z",
        },
      },
    }),
  ),
  true,
)
assert.equal(tripHasUserWork(trip({ expectations: "  ritmo lento  " })), true)
assert.equal(tripHasUserWork(trip({ numTravelers: 2 })), true)

// ── Invitado ─────────────────────────────────────────────────────────────────

const tenerife = candidate({
  id: "tenerife",
  name: "Tenerife",
  referrer: "lacosmopolilla",
  seedSourceKey: "lacosmopolilla.com/tenerife",
})
const francia = candidate({
  id: "francia",
  name: "Francia",
  referrer: "lacosmopolilla",
  seedSourceKey: "lacosmopolilla.com/francia",
})

assert.deepEqual(
  decideStart({
    isGuest: true,
    sourceKey: "lacosmopolilla.com/tenerife",
    trips: [tenerife],
  }),
  { kind: "open", tripId: "tenerife" },
  "invitado, mismo artículo dos veces",
)

assert.deepEqual(
  decideStart({
    isGuest: true,
    sourceKey: "lacosmopolilla.com/francia",
    trips: [tenerife],
  }),
  { kind: "replace", createAndDeleteTripIds: ["tenerife"] },
  "invitado, Tenerife virgen → Francia",
)

const tenerifeWork = candidate({
  id: "tenerife",
  name: "Tenerife",
  referrer: "lacosmopolilla",
  seedSourceKey: "lacosmopolilla.com/tenerife",
  days: [{ id: "d1", label: "", items: [item] }],
})
assert.deepEqual(
  decideStart({
    isGuest: true,
    sourceKey: "lacosmopolilla.com/francia",
    trips: [tenerifeWork],
  }),
  { kind: "confirm-replace", keepTripId: "tenerife" },
  "invitado, Tenerife con ítems → Francia",
)

assert.deepEqual(
  decideStart({ isGuest: true, sourceKey: "x.com/a", trips: [] }),
  { kind: "create" },
  "invitado sin viajes",
)

assert.deepEqual(
  decideStart({ isGuest: true, sourceKey: null, trips: [tenerife] }),
  { kind: "open", tripId: "tenerife" },
  "invitado, /start sin ?source=",
)

assert.deepEqual(
  decideStart({ isGuest: true, sourceKey: null, trips: [] }),
  { kind: "create" },
  "invitado sin viajes ni fuente",
)

// ── Cuenta ───────────────────────────────────────────────────────────────────

assert.deepEqual(
  decideStart({
    isGuest: false,
    sourceKey: "lacosmopolilla.com/tenerife",
    trips: [tenerife, francia],
  }),
  { kind: "open", tripId: "tenerife" },
  "cuenta, mismo artículo dos veces",
)

assert.deepEqual(
  decideStart({
    isGuest: false,
    sourceKey: "lacosmopolilla.com/francia",
    trips: [
      candidate({
        id: "tenerife",
        name: "Tenerife",
        referrer: "lacosmopolilla",
        seedSourceKey: "lacosmopolilla.com/tenerife",
        startDate: "2026-08-19",
        sourceIds: ["s1"],
        days: [
          { id: "d1", label: "", items: [] },
          { id: "d2", label: "", items: [] },
        ],
      }),
    ],
  }),
  { kind: "create" },
  "cuenta, Tenerife → Francia: conviven",
)

const manualDraft = candidate({
  id: "grecia",
  name: "Verano en Grecia",
  referrer: null,
})
assert.equal(manualDraft.isReusableDraft, true)
assert.deepEqual(
  decideStart({
    isGuest: false,
    sourceKey: "blog.com/a",
    trips: [manualDraft],
  }),
  { kind: "create" },
  "cuenta con borrador referrer=null: no reusa",
)

const partnerDraft = candidate({
  id: "draft",
  name: "Viaje desde blog.com",
  referrer: "lacosmopolilla",
  seedSourceKey: null,
})
assert.deepEqual(
  decideStart({
    isGuest: false,
    sourceKey: "blog.com/a",
    trips: [partnerDraft],
  }),
  { kind: "reuse", tripId: "draft" },
  "cuenta con borrador referrer de partner: reusa",
)

const archivedMatch = candidate({
  id: "old",
  name: "Austria",
  archived: true,
  referrer: "lacosmopolilla",
  seedSourceKey: "lacosmopolilla.com/austria",
})
assert.deepEqual(
  decideStart({
    isGuest: false,
    sourceKey: "lacosmopolilla.com/austria",
    trips: [archivedMatch],
  }),
  { kind: "create" },
  "coincidencia archivada se ignora",
)

assert.deepEqual(
  decideStart({
    isGuest: true,
    sourceKey: "lacosmopolilla.com/austria",
    trips: [archivedMatch],
  }),
  { kind: "create" },
  "invitado: archivado no ocupa el hueco",
)

assert.deepEqual(
  decideStart({
    isGuest: true,
    sourceKey: "c.com/b",
    trips: [tenerife, francia],
  }),
  { kind: "replace", createAndDeleteTripIds: ["tenerife", "francia"] },
  "invitado con varios vírgenes: borra todos",
)

// ── Sesión anónima muerta ────────────────────────────────────────────────────

assert.equal(isDefinitivelyDeadAnonymousSession(null, null), true)
assert.equal(isDefinitivelyDeadAnonymousSession({ status: 401 }, null), true)
assert.equal(isDefinitivelyDeadAnonymousSession({ status: 403 }, null), true)
assert.equal(isDefinitivelyDeadAnonymousSession({ code: "user_not_found" }, null), true)
assert.equal(isDefinitivelyDeadAnonymousSession({ status: 500 }, null), false, "5xx no tira la cookie")
assert.equal(isDefinitivelyDeadAnonymousSession({ status: 401 }, { id: "u1" }), false)
assert.equal(isDefinitivelyDeadAnonymousSession(null, { id: "u1" }), false)

console.log("start-session tests passed")
