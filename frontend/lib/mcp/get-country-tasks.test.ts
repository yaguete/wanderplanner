import assert from "node:assert/strict"
import {
  COUNTRY_TASKS_FETCH_TIMEOUT_MS,
  emptyCountryTasksResult,
  fetchCountryTasksWithToken,
  parseCountryTasksWire,
} from "@/lib/country-tasks"
import {
  countryCodesForMcpTrip,
  countryTasksFetchErrorText,
  extraTaskIdsFromRow,
  mapCountryTasks,
  getCountryTasksOutput,
  MCP_COUNTRY_TASKS_TRIP_COLUMNS,
} from "./get-country-tasks"

async function main() {
assert.ok(COUNTRY_TASKS_FETCH_TIMEOUT_MS >= 20_000)

const tripCols = MCP_COUNTRY_TASKS_TRIP_COLUMNS.split(",").map((c) => c.trim())
assert.equal(tripCols.includes("share_card"), false)
assert.equal(tripCols.includes("countries"), true)

{
  const parsed = parseCountryTasksWire({
    disclaimer: "Solo para españoles.",
    brief_source: "MAE",
    countries: [
      {
        country_code: "th",
        name: "Tailandia",
        url: "https://www.exteriores.gob.es/th",
        brief_fetched_at: "2026-08-01T00:00:00.000Z",
        tasks: [
          {
            id: "country:th:tdac",
            title: "Tramitar TDAC",
            category: "paperwork",
            lead_time_days: 3,
            details: "Tres días antes.",
          },
          { id: "skip", title: "Ignorar", category: "other" },
        ],
      },
    ],
  })
  assert.equal(parsed.suggestions.length, 1)
  assert.equal(parsed.suggestions[0]?.id, "country:th:tdac")
  assert.equal(parsed.suggestions[0]?.leadTimeDays, 3)
}

{
  const fetched = parseCountryTasksWire({
    disclaimer: "d",
    brief_source: "MAE",
    countries: [
      {
        country_code: "TH",
        name: "Tailandia",
        tasks: [
          { id: "country:th:tdac", title: "TDAC", category: "paperwork" },
          { id: "country:th:vacunas", title: "Vacunas", category: "health" },
        ],
      },
    ],
  })
  const mapped = mapCountryTasks(
    fetched,
    ["country:th:tdac"],
    ["country:th:vacunas"],
    ["TH"],
  )
  assert.equal(mapped.suggestions[0]?.status, "accepted")
  assert.equal(mapped.suggestions[1]?.status, "dismissed")
  assert.equal(mapped.suggestions.length, 2)
  getCountryTasksOutput.parse(mapped)
}

assert.deepEqual(extraTaskIdsFromRow([{ id: "country:th:tdac" }, { title: "x" }]), [
  "country:th:tdac",
])

{
  const codes = countryCodesForMcpTrip(
    {
      id: "t1",
      name: "Tailandia",
      countries: ["TH"],
      source_ids: [],
      days: [],
      extra_tasks: [],
      dismissed_country_tasks: [],
    },
    [],
  )
  assert.deepEqual(codes, ["TH"])
}

{
  let called = false
  const empty = await fetchCountryTasksWithToken([], "tok", {
    fetchImpl: async () => {
      called = true
      throw new Error("no fetch")
    },
  })
  assert.equal(called, false)
  assert.equal(empty.ok, true)
  if (empty.ok) assert.deepEqual(empty.result.suggestions, emptyCountryTasksResult().suggestions)
}

{
  const fetched = await fetchCountryTasksWithToken(["TH"], "tok", {
    fetchImpl: async (input, init) => {
      assert.match(String(input), /country-tasks\?codes=TH/)
      const headers = init?.headers as Record<string, string>
      assert.equal(headers.Authorization, "Bearer tok")
      return {
        ok: true,
        status: 200,
        json: async () => ({
          disclaimer: "d",
          brief_source: "MAE",
          countries: [],
        }),
      } as Response
    },
  })
  assert.equal(fetched.ok, true)
}

{
  const timedOut = await fetchCountryTasksWithToken(["TH"], "tok", {
    timeoutMs: 20,
    fetchImpl: (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted")
          err.name = "AbortError"
          reject(err)
        })
      }),
  })
  assert.equal(timedOut.ok, false)
  if (!timedOut.ok) {
    assert.equal(timedOut.reason, "timeout")
    assert.match(countryTasksFetchErrorText(timedOut), /arrancando/)
  }
}

{
  const quota = await fetchCountryTasksWithToken(["TH"], "tok", {
    fetchImpl: async () =>
      ({
        ok: false,
        status: 429,
        json: async () => ({
          detail: {
            message: "Has alcanzado el límite diario de consultas de trámites. Vuelve mañana.",
            limit: "daily",
          },
        }),
      }) as unknown as Response,
  })
  assert.equal(quota.ok, false)
  if (!quota.ok) {
    assert.equal(quota.reason, "quota")
    assert.equal(quota.status, 429)
    const text = countryTasksFetchErrorText(quota)
    assert.match(text, /Vuelve mañana/)
    assert.equal(text.includes("Inténtalo de nuevo"), false)
  }
}

{
  const quotaBare = await fetchCountryTasksWithToken(["TH"], "tok", {
    fetchImpl: async () =>
      ({
        ok: false,
        status: 429,
        json: async () => {
          throw new Error("no body")
        },
      }) as unknown as Response,
  })
  assert.equal(quotaBare.ok, false)
  if (!quotaBare.ok) {
    assert.equal(quotaBare.reason, "quota")
    assert.match(countryTasksFetchErrorText(quotaBare), /Vuelve mañana/)
  }
}

{
  const http = await fetchCountryTasksWithToken(["TH"], "tok", {
    fetchImpl: async () =>
      ({
        ok: false,
        status: 500,
        json: async () => ({ detail: "boom" }),
      }) as unknown as Response,
  })
  assert.equal(http.ok, false)
  if (!http.ok) {
    assert.equal(http.reason, "http")
    assert.match(countryTasksFetchErrorText(http), /Inténtalo de nuevo/)
  }
}

console.log("mcp-get-country-tasks: ok")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
