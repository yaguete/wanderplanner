import assert from "node:assert/strict"
import {
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
  assert.deepEqual(patch, { status: "pending", cost: 12 })
  assert.notEqual(patch?.status, "notNeeded")
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

console.log("manual-item-task.test.ts: ok")
