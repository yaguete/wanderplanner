import type { Source, Trip } from "@/types/itinerary"

const STORAGE_KEY = "wanderplanner:app-state"
export const PERSISTENCE_VERSION = 3

export type PersistedAppState = {
  version: number
  trips: Trip[]
  sources: Source[]
}

function migrateV1TripToV2(t: unknown): Trip {
  const o = t as Record<string, unknown>
  if (o && Array.isArray(o.countries) && o.countries.length > 0) {
    return normalizeTripFields(o as unknown as Trip)
  }
  const dest = o?.destination
  return normalizeTripFields({
    id: String(o.id ?? ""),
    name: String(o.name ?? ""),
    countries: typeof dest === "string" && dest.trim() ? [dest.trim()] : [],
    startDate: (o.startDate as string | null) ?? null,
    endDate: (o.endDate as string | null) ?? null,
    numDays: (o.numDays as number | null) ?? null,
    expectations: (o.expectations as string | null) ?? null,
    cover: String(o.cover ?? "✈️"),
    coverUrl: (o.coverUrl as string | null) ?? null,
    sourceIds: (o.sourceIds as string[]) ?? [],
    days: (o.days as Trip["days"]) ?? [],
    basics: (o.basics as Trip["basics"]) ?? [],
  })
}

/** Asegura campos añadidos en v3+ (p. ej. `archived`, `expectations`). */
function normalizeTripFields(t: Trip): Trip {
  const raw = (t as Trip & { expectations?: string | null }).expectations
  const expectations =
    typeof raw === "string" && raw.trim() ? raw.trim() : null
  return {
    ...t,
    archived: Boolean(t.archived),
    expectations,
  }
}

function normalizeTrip(t: unknown): Trip {
  return normalizeTripFields(migrateV1TripToV2(t))
}

function migrateTrips(_migratedVersion: number, raw: unknown): Trip[] {
  if (!Array.isArray(raw)) return []
  return raw.map((t) => normalizeTrip(t))
}

export function loadTripsState(): PersistedAppState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as PersistedAppState & {
      version?: number
      trips?: unknown
      sources?: unknown
    }
    if (!Array.isArray(data.trips) || !Array.isArray(data.sources)) return null
    const v = data.version ?? 1
    if (v < 1 || v > PERSISTENCE_VERSION) return null
    const trips = migrateTrips(v, data.trips)
    return { version: PERSISTENCE_VERSION, trips, sources: data.sources as Source[] }
  } catch {
    return null
  }
}

export function saveTripsState(trips: Trip[], sources: Source[]): void {
  if (typeof window === "undefined") return
  try {
    const payload: PersistedAppState = { version: PERSISTENCE_VERSION, trips, sources }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Cuota o modo privado: se ignora; la app sigue en memoria.
  }
}
