import assert from "node:assert/strict"
import {
  TRIP_SHARE_CAP,
  canInviteToTrip,
  filterAvailablePeers,
  isLikelyEmail,
  maskEmail,
  normalizeEmail,
  occupancyOf,
} from "./trip-share"

assert.equal(normalizeEmail("  Ana@Gmail.COM "), "ana@gmail.com")
assert.equal(isLikelyEmail("ana@gmail.com"), true)
assert.equal(isLikelyEmail("nope"), false)

assert.equal(maskEmail("ana@gmail.com"), "a•••@gmail.com")
assert.equal(maskEmail("abcd@x.co"), "abc•••@x.co")
assert.equal(maskEmail("ab@x.co"), "a•••@x.co")
assert.equal(maskEmail(null), "")

assert.equal(canInviteToTrip({ isOwner: true, isGuest: false, occupancy: 1 }), true)
assert.equal(canInviteToTrip({ isOwner: true, isGuest: false, occupancy: TRIP_SHARE_CAP }), false)
assert.equal(canInviteToTrip({ isOwner: false, isGuest: false, occupancy: 1 }), false)
assert.equal(canInviteToTrip({ isOwner: true, isGuest: true, occupancy: 1 }), false)

assert.equal(occupancyOf({ memberCount: 2, pendingInviteCount: 1 }), 3)

const peers = [
  { userId: "a", displayName: "Ana", avatarUrl: null, emailMasked: "ana•••@x.com" },
  { userId: "b", displayName: "Bob", avatarUrl: null, emailMasked: "bob@x.com" },
]
const available = filterAvailablePeers(peers, new Set(["a"]), new Set(["bob@x.com"]))
assert.equal(available.length, 0)

console.log("trip-share: ok")
