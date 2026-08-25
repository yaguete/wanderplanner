import assert from "node:assert/strict"
import {
  TRIP_SHARE_CAP,
  canInviteToTrip,
  filterAvailablePeers,
  isLikelyEmail,
  normalizeEmail,
  occupancyOf,
} from "./trip-share"

assert.equal(normalizeEmail("  Ana@Gmail.COM "), "ana@gmail.com")
assert.equal(isLikelyEmail("ana@gmail.com"), true)
assert.equal(isLikelyEmail("nope"), false)

assert.equal(canInviteToTrip({ isOwner: true, isGuest: false, occupancy: 1 }), true)
assert.equal(canInviteToTrip({ isOwner: true, isGuest: false, occupancy: TRIP_SHARE_CAP }), false)
assert.equal(canInviteToTrip({ isOwner: false, isGuest: false, occupancy: 1 }), false)
assert.equal(canInviteToTrip({ isOwner: true, isGuest: true, occupancy: 1 }), false)

assert.equal(occupancyOf({ memberCount: 2, pendingInviteCount: 1 }), 3)

const peers = [
  { userId: "a", displayName: "Ana", avatarUrl: null, emailMasked: "a•••@x.com" },
  { userId: "b", displayName: "Bob", avatarUrl: null, emailMasked: "b•••@x.com" },
  {
    userId: "c",
    displayName: "Cata",
    avatarUrl: null,
    emailMasked: "c•••@x.com",
    alreadyInTrip: true,
  },
]
const available = filterAvailablePeers(peers, new Set(["a"]))
assert.equal(available.length, 1)
assert.equal(available[0].userId, "b")

console.log("trip-share: ok")
