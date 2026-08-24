import assert from "node:assert/strict"
import {
  invitePath,
  inviteUrl,
  inviterLabel,
  tripIdFromAcceptPayload,
  tripPathAfterAccept,
} from "./trip-invite-url"

assert.equal(invitePath("abc+def"), "/invite/abc%2Bdef")
assert.equal(invitePath("  "), "/invite")
assert.equal(inviteUrl("https://wanderplanner.ai/", "tok"), "https://wanderplanner.ai/invite/tok")
assert.equal(tripPathAfterAccept("uuid-1"), "/trips/uuid-1")
assert.equal(tripPathAfterAccept("../x"), "/trips")
assert.equal(tripPathAfterAccept(""), "/trips")
assert.equal(tripIdFromAcceptPayload({ trip_id: "t1", status: "accepted" }), "t1")
assert.equal(tripIdFromAcceptPayload({ status: "unknown" }), "")
assert.equal(inviterLabel("María"), "María")
assert.equal(inviterLabel("  "), "Una persona")
assert.equal(inviterLabel(null), "Una persona")

console.log("trip-invite-url: ok")
