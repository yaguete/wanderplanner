import assert from "node:assert/strict"
import type { SupabaseClient } from "@supabase/supabase-js"
import { MCP_NO_SESSION, MCP_READ_FAILED, MCP_TRIP_UNAVAILABLE } from "./result"
import {
  asStringList,
  isUnauthorizedStatus,
  listTripsLoadFailure,
  loadAccessibleTrip,
  loadSourcesByIds,
  MCP_LIST_TRIPS_READ_FAILED,
  orderBySourceIds,
  readLoadFailure,
  sourceRowsOrEmpty,
  tripLoadFailure,
} from "./trip-access"

function fakeTripClient(
  data: unknown,
  error: { message: string } | null = null,
  status = error ? 500 : 200,
) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data, error, status }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

function fakeSourceClient(
  data: unknown,
  error: { message: string } | null = null,
  status = error ? 500 : 200,
) {
  return {
    from: () => ({
      select: () => ({
        in: async () => ({ data, error, status }),
      }),
    }),
  } as unknown as SupabaseClient
}

async function main() {
  assert.equal(isUnauthorizedStatus(401), true)
  assert.equal(isUnauthorizedStatus(403), false)
  assert.equal(isUnauthorizedStatus(500), false)
  assert.equal(isUnauthorizedStatus(undefined), false)

  {
    const missing = await loadAccessibleTrip(
      fakeTripClient(null),
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "id",
    )
    assert.deepEqual(missing, { ok: false, reason: "not_found" })
    const hiddenByRls = await loadAccessibleTrip(
      fakeTripClient(null),
      "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
      "id",
    )
    assert.deepEqual(hiddenByRls, { ok: false, reason: "not_found" })
    const msgMissing = tripLoadFailure(missing)
    const msgHidden = tripLoadFailure(hiddenByRls)
    assert.equal(msgMissing.content[0].text, MCP_TRIP_UNAVAILABLE)
    assert.equal(msgHidden.content[0].text, msgMissing.content[0].text)
    assert.doesNotMatch(msgMissing.content[0].text, /no es tuyo|ajeno|permiso/i)
  }

  {
    const failed = await loadAccessibleTrip(
      fakeTripClient(null, { message: "boom" }, 500),
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "id",
    )
    assert.deepEqual(failed, { ok: false, reason: "error" })
    assert.equal(tripLoadFailure(failed).content[0].text, MCP_READ_FAILED)
    assert.notEqual(MCP_READ_FAILED, MCP_TRIP_UNAVAILABLE)
  }

  {
    const revoked = await loadAccessibleTrip(
      fakeTripClient(null, { message: "JWT expired" }, 401),
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "id",
    )
    assert.deepEqual(revoked, { ok: false, reason: "unauthorized" })
    const msg = tripLoadFailure(revoked)
    assert.equal(msg.content[0].text, MCP_NO_SESSION)
    assert.equal(msg.content[0].text.includes("Inténtalo de nuevo"), false)
  }

  {
    const found = await loadAccessibleTrip<{ id: string; name: string }>(
      fakeTripClient({ id: "t1", name: "Lisboa" }),
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "id, name",
    )
    assert.equal(found.ok, true)
    if (found.ok) assert.equal(found.row.id, "t1")
  }

  {
    const boom = await loadSourcesByIds(
      fakeSourceClient(null, { message: "boom" }, 503),
      ["s1"],
      "id",
    )
    assert.deepEqual(boom, { ok: false, reason: "error" })
    assert.equal(readLoadFailure(boom).content[0].text, MCP_READ_FAILED)

    const revoked = await loadSourcesByIds(
      fakeSourceClient(null, { message: "JWT expired" }, 401),
      ["s1"],
      "id",
    )
    assert.deepEqual(revoked, { ok: false, reason: "unauthorized" })
    assert.equal(readLoadFailure(revoked).content[0].text, MCP_NO_SESSION)
  }

  {
    const listAuth = listTripsLoadFailure(401)
    assert.equal(listAuth.content[0].text, MCP_NO_SESSION)
    assert.equal(listAuth.content[0].text.includes("Inténtalo de nuevo"), false)
    const listBoom = listTripsLoadFailure(500)
    assert.equal(listBoom.content[0].text, MCP_LIST_TRIPS_READ_FAILED)
    assert.match(listBoom.content[0].text, /Inténtalo de nuevo/)
  }

  assert.deepEqual(asStringList(["a", "", 1, "b"]), ["a", "b"])
  assert.deepEqual(asStringList(null), [])

  assert.deepEqual(sourceRowsOrEmpty({ ok: false, reason: "error" }), [])
  assert.deepEqual(sourceRowsOrEmpty({ ok: false, reason: "unauthorized" }), [])
  assert.deepEqual(sourceRowsOrEmpty({ ok: true, rows: [{ id: "s1" }] }), [{ id: "s1" }])

  {
    const ordered = orderBySourceIds(
      ["s2", "s1", "s2", "missing"],
      [
        { id: "s1", title: "uno" },
        { id: "s2", title: "dos" },
      ],
    )
    assert.deepEqual(
      ordered.map((r) => r.id),
      ["s2", "s1"],
    )
  }

  console.log("mcp-trip-access: ok")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
