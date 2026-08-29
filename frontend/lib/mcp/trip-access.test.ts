import assert from "node:assert/strict"
import type { SupabaseClient } from "@supabase/supabase-js"
import { MCP_TRIP_UNAVAILABLE, MCP_READ_FAILED } from "./result"
import {
  asStringList,
  loadAccessibleTrip,
  orderBySourceIds,
  tripLoadFailure,
} from "./trip-access"

function fakeTripClient(data: unknown, error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data, error }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

async function main() {
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
      fakeTripClient(null, { message: "boom" }),
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "id",
    )
    assert.deepEqual(failed, { ok: false, reason: "error" })
    assert.equal(tripLoadFailure(failed).content[0].text, MCP_READ_FAILED)
    assert.notEqual(MCP_READ_FAILED, MCP_TRIP_UNAVAILABLE)
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

  assert.deepEqual(asStringList(["a", "", 1, "b"]), ["a", "b"])
  assert.deepEqual(asStringList(null), [])

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
