export type McpTripRow = {
  id: string
  name: string | null
  archived: boolean | null
  start_date: string | null
  end_date: string | null
  num_days: number | null
  countries: unknown
}

export type McpTripSummary = {
  id: string
  name: string
  archived: boolean
  startDate: string | null
  endDate: string | null
  numDays: number | null
  countries: string[]
}

export const MCP_TRIP_COLUMNS =
  "id, name, archived, start_date, end_date, num_days, countries" as const

function asCountries(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
}

export function mapTripRows(rows: readonly McpTripRow[]): McpTripSummary[] {
  return rows.map((row) => ({
    id: row.id,
    name: (row.name ?? "").trim() || "Viaje sin nombre",
    archived: row.archived === true,
    startDate: row.start_date,
    endDate: row.end_date,
    numDays: typeof row.num_days === "number" ? row.num_days : null,
    countries: asCountries(row.countries),
  }))
}

export type ListTripsResult = {
  trips: McpTripSummary[]
  text: string
}

const EMPTY_HINT =
  "Todavía no tienes ningún viaje en WanderPlanner. Puedes crear uno en wanderplanner.ai y volver aquí; también puedes empezar pegando el enlace de un blog de viajes."

function formatTripLine(trip: McpTripSummary): string {
  const bits = [trip.name]
  if (trip.numDays != null) bits.push(`${trip.numDays} días`)
  if (trip.startDate) bits.push(`desde ${trip.startDate}`)
  if (trip.archived) bits.push("archivado")
  return `- ${bits.join(" · ")}`
}

export function listTripsResult(rows: readonly McpTripRow[]): ListTripsResult {
  const trips = mapTripRows(rows)
  if (trips.length === 0) {
    return { trips, text: EMPTY_HINT }
  }

  const active = trips.filter((t) => !t.archived)
  const archived = trips.filter((t) => t.archived)

  if (active.length === 0) {
    const n = archived.length
    return {
      trips,
      text: `No tienes viajes activos. Tienes ${n} viaje${n === 1 ? "" : "s"} archivado${n === 1 ? "" : "s"}:\n${archived.map(formatTripLine).join("\n")}`,
    }
  }

  const lines = ["Tus viajes:"]
  lines.push(...active.map(formatTripLine))
  if (archived.length > 0) {
    lines.push("", "Archivados:")
    lines.push(...archived.map(formatTripLine))
  }
  return { trips, text: lines.join("\n") }
}
