import assert from "node:assert/strict"
import {
  draftFromTaskState,
  emptyManualTaskDraft,
  omitReturnLegTask,
  resolveManualDraftStatus,
  taskPatchFromManualDraft,
} from "./manual-item-task"

{
  const empty = {
    cost: null,
    status: null,
    cancellable: null,
    needsReservation: null,
  }
  assert.equal(resolveManualDraftStatus(empty), undefined)
  assert.equal(taskPatchFromManualDraft(empty), null)
}

{
  const patch = taskPatchFromManualDraft({
    cost: 12,
    status: null,
    cancellable: null,
    needsReservation: false,
  })
  assert.deepEqual(patch, { status: "notNeeded", cost: 12 })
}

{
  const patch = taskPatchFromManualDraft({
    cost: null,
    status: null,
    cancellable: null,
    needsReservation: false,
  })
  assert.deepEqual(patch, { status: "notNeeded" })
}

{
  assert.equal(
    resolveManualDraftStatus({
      cost: 40,
      status: "paid",
      cancellable: null,
      needsReservation: false,
    }),
    "paid",
  )
  assert.equal(
    resolveManualDraftStatus({
      cost: null,
      status: "booked",
      cancellable: true,
      needsReservation: true,
    }),
    "booked",
  )
}

{
  const patch = taskPatchFromManualDraft({
    cost: null,
    status: null,
    cancellable: null,
    needsReservation: true,
  })
  assert.deepEqual(patch, { status: "pending" })
}

{
  const booked = taskPatchFromManualDraft({
    cost: null,
    status: "booked",
    cancellable: null,
    needsReservation: true,
  })
  assert.deepEqual(booked, { status: "booked" })
}

{
  assert.deepEqual(draftFromTaskState(null), emptyManualTaskDraft())
  assert.deepEqual(
    draftFromTaskState({
      cost: null,
      status: "pending",
      cancellable: null,
    }),
    {
      cost: null,
      status: null,
      cancellable: null,
      needsReservation: true,
    },
  )
  assert.deepEqual(
    draftFromTaskState({
      cost: 12,
      status: "booked",
      cancellable: null,
    }),
    {
      cost: 12,
      status: "booked",
      cancellable: null,
      needsReservation: true,
    },
  )
  assert.deepEqual(
    draftFromTaskState({
      cost: 40,
      status: "paid",
      cancellable: false,
    }),
    {
      cost: 40,
      status: "paid",
      cancellable: false,
      needsReservation: true,
    },
  )
  assert.deepEqual(
    draftFromTaskState({
      cost: null,
      status: "notNeeded",
      cancellable: null,
    }),
    {
      cost: null,
      status: null,
      cancellable: null,
      needsReservation: false,
    },
  )
}

assert.equal(omitReturnLegTask({ mirrored: true, leg: "return" }), true)
assert.equal(omitReturnLegTask({ mirrored: true, leg: "outbound" }), false)
assert.equal(omitReturnLegTask({ mirrored: false, leg: "return" }), false)
assert.equal(omitReturnLegTask({ mirrored: true, leg: null }), false)

{
  // Con el bloque omitido, ni status ni cancellable viajan: fold borra la clave.
  const draft = {
    cost: 80,
    status: "paid" as const,
    cancellable: true,
    needsReservation: null,
  }
  const patch = omitReturnLegTask({ mirrored: true, leg: "return" })
    ? null
    : taskPatchFromManualDraft(draft)
  assert.equal(patch, null)
  assert.ok(taskPatchFromManualDraft(draft))
}

{
  const cleared = taskPatchFromManualDraft(
    { cost: null, status: null, cancellable: null, needsReservation: null },
    { includeCleared: true },
  )
  assert.deepEqual(cleared, { status: "pending", cost: null, cancellable: null })
}

{
  const bookedWithCancellable = taskPatchFromManualDraft({
    cost: null,
    status: "booked",
    cancellable: true,
    needsReservation: null,
  })
  assert.deepEqual(bookedWithCancellable, { status: "booked" })

  const paidWithCancellable = taskPatchFromManualDraft({
    cost: 80,
    status: "paid",
    cancellable: false,
    needsReservation: null,
  })
  assert.deepEqual(paidWithCancellable, {
    status: "paid",
    cost: 80,
    cancellable: false,
  })

  const clearedBooked = taskPatchFromManualDraft(
    { cost: null, status: "booked", cancellable: true, needsReservation: null },
    { includeCleared: true },
  )
  assert.deepEqual(clearedBooked, {
    status: "booked",
    cost: null,
    cancellable: null,
  })
}

console.log("manual-item-task.test.ts: ok")
