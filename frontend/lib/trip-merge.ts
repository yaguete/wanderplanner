/**
 * Fusión a tres bandas de un Trip. Puro: sin I/O.
 * Escalars: si solo un lado cambió respecto a la base, gana ese; si ambos y
 * difieren, gana el remoto y se anota. Colecciones por `id` (alta/baja + merge).
 */
import type {
  ExtraTask,
  Trip,
  TripTaskState,
  UserBasicItem,
  UserDay,
  UserDayItem,
} from "@/types/itinerary"
import { endDateFromStartAndNumDays } from "@/lib/trip-dates"

export type TripMergeField =
  | "name"
  | "dates"
  | "expectations"
  | "cover"
  | "budget"
  | "share"
  | "origin"
  | "travelers"
  | "currency"
  | "archived"

export type TripMergeNote = { field: TripMergeField; takenFrom: "remote" }

export type TripMergeResult = { trip: Trip; notes: TripMergeNote[] }

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function pickScalar<T>(
  base: T,
  local: T,
  remote: T,
  field: TripMergeField,
  notes: TripMergeNote[],
): T {
  const localChanged = !same(local, base)
  const remoteChanged = !same(remote, base)
  if (localChanged && !remoteChanged) return local
  if (remoteChanged && !localChanged) return remote
  if (localChanged && remoteChanged && !same(local, remote)) {
    notes.push({ field, takenFrom: "remote" })
    return remote
  }
  return remote
}

function mergeById<T extends { id: string }>(
  base: T[],
  local: T[],
  remote: T[],
  mergeOne: (b: T | undefined, l: T, r: T) => T,
): T[] {
  const baseIds = new Set(base.map((x) => x.id))
  const localMap = new Map(local.map((x) => [x.id, x]))
  const remoteMap = new Map(remote.map((x) => [x.id, x]))
  const dropped = new Set<string>()
  for (const id of baseIds) {
    if (!localMap.has(id) || !remoteMap.has(id)) dropped.add(id)
  }
  const out: T[] = []
  const seen = new Set<string>()
  for (const r of remote) {
    if (dropped.has(r.id) || seen.has(r.id)) continue
    seen.add(r.id)
    const l = localMap.get(r.id)
    const b = base.find((x) => x.id === r.id)
    out.push(l ? mergeOne(b, l, r) : r)
  }
  for (const l of local) {
    if (dropped.has(l.id) || seen.has(l.id) || baseIds.has(l.id)) continue
    seen.add(l.id)
    out.push(l)
  }
  return out
}

function mergeItem(base: UserDayItem | undefined, local: UserDayItem, remote: UserDayItem): UserDayItem {
  if (!base) return remote
  if (same(local, remote)) return remote
  const localChanged = !same(local, base)
  const remoteChanged = !same(remote, base)
  if (localChanged && !remoteChanged) return local
  if (remoteChanged && !localChanged) return remote
  return { ...local, ...remote }
}

function mergeDay(
  base: UserDay | undefined,
  local: UserDay,
  remote: UserDay,
  notes: TripMergeNote[],
): UserDay {
  const label = pickScalar(base?.label ?? "", local.label, remote.label, "name", notes)
  const items = mergeById(base?.items ?? [], local.items, remote.items, mergeItem)
  return {
    ...remote,
    label,
    items,
    summarySignature: pickScalar(
      base?.summarySignature ?? null,
      local.summarySignature ?? null,
      remote.summarySignature ?? null,
      "name",
      notes,
    ),
  }
}

/** Tres bandas sobre un set de ids: baja de un lado gana; alta de un lado se conserva. */
function mergeIdSet(base: string[], local: string[], remote: string[]): string[] {
  const baseSet = new Set(base)
  const localSet = new Set(local)
  const remoteSet = new Set(remote)
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of [...remote, ...local, ...base]) {
    if (seen.has(id)) continue
    seen.add(id)
    const inBase = baseSet.has(id)
    const inLocal = localSet.has(id)
    const inRemote = remoteSet.has(id)
    if (inBase) {
      if (inLocal && inRemote) out.push(id)
    } else if (inLocal || inRemote) {
      out.push(id)
    }
  }
  return out
}

function mergeBasic(base: UserBasicItem | undefined, local: UserBasicItem, remote: UserBasicItem): UserBasicItem {
  if (!base) return remote
  const localChanged = !same(local, base)
  const remoteChanged = !same(remote, base)
  if (localChanged && !remoteChanged) return local
  if (remoteChanged && !localChanged) return remote
  return { ...local, ...remote }
}

function mergeExtra(base: ExtraTask | undefined, local: ExtraTask, remote: ExtraTask): ExtraTask {
  if (!base) return remote
  const lAt = local.state.updatedAt
  const rAt = remote.state.updatedAt
  if (lAt !== rAt) return lAt > rAt ? local : remote
  const localChanged = !same(local, base)
  const remoteChanged = !same(remote, base)
  if (localChanged && !remoteChanged) return local
  return remote
}

function mergeTasks(
  base: Record<string, TripTaskState>,
  local: Record<string, TripTaskState>,
  remote: Record<string, TripTaskState>,
): Record<string, TripTaskState> {
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])
  const out: Record<string, TripTaskState> = {}
  for (const key of keys) {
    const b = base[key]
    const l = local[key]
    const r = remote[key]
    if (b && (!l || !r)) continue
    if (l && r) {
      out[key] = l.updatedAt >= r.updatedAt ? (l.updatedAt === r.updatedAt ? r : l) : r
      if (l.updatedAt === r.updatedAt && !same(l, r)) out[key] = r
      else if (l.updatedAt > r.updatedAt) out[key] = l
      else out[key] = r
      continue
    }
    if (l && !b) out[key] = l
    else if (r && !b) out[key] = r
  }
  return out
}

function mergeSourceIds(base: string[], local: string[], remote: string[]): string[] {
  const baseSet = new Set(base)
  const localSet = new Set(local)
  const remoteSet = new Set(remote)
  const dropped = new Set<string>()
  for (const id of baseSet) {
    if (!localSet.has(id) || !remoteSet.has(id)) dropped.add(id)
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of remote) {
    if (dropped.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  for (const id of local) {
    if (dropped.has(id) || seen.has(id) || baseSet.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function mergeTrips(base: Trip | null, local: Trip, remote: Trip): TripMergeResult {
  const notes: TripMergeNote[] = []
  if (!base) {
    return { trip: { ...remote, ownerId: remote.ownerId, version: remote.version }, notes }
  }

  const name = pickScalar(base.name, local.name, remote.name, "name", notes)
  const startDate = pickScalar(base.startDate, local.startDate, remote.startDate, "dates", notes)
  const datesProvisional = pickScalar(
    Boolean(base.datesProvisional),
    Boolean(local.datesProvisional),
    Boolean(remote.datesProvisional),
    "dates",
    [],
  )
  const expectations = pickScalar(
    base.expectations,
    local.expectations,
    remote.expectations,
    "expectations",
    notes,
  )
  const cover = pickScalar(base.cover, local.cover, remote.cover, "cover", notes)
  const coverUrl = pickScalar(base.coverUrl, local.coverUrl, remote.coverUrl, "cover", notes)
  const budget = pickScalar(base.budget, local.budget, remote.budget, "budget", notes)
  const shareCard = pickScalar(
    base.shareCard ?? null,
    local.shareCard ?? null,
    remote.shareCard ?? null,
    "share",
    notes,
  )
  const origin = pickScalar(base.origin, local.origin, remote.origin, "origin", notes)
  const numTravelers = pickScalar(
    base.numTravelers,
    local.numTravelers,
    remote.numTravelers,
    "travelers",
    notes,
  )
  const currency = pickScalar(base.currency, local.currency, remote.currency, "currency", notes)
  const archived = pickScalar(base.archived, local.archived, remote.archived, "archived", notes)

  const days = mergeById(base.days, local.days, remote.days, (b, l, r) =>
    mergeDay(b, l, r, notes),
  )
  const basics = mergeById(base.basics, local.basics, remote.basics, mergeBasic)
  const extraTasks = mergeById(base.extraTasks, local.extraTasks, remote.extraTasks, mergeExtra)
  const tasks = mergeTasks(base.tasks, local.tasks, remote.tasks)
  const sourceIds = mergeSourceIds(base.sourceIds, local.sourceIds, remote.sourceIds)
  const dismissed = mergeIdSet(
    base.dismissedCountryTasks,
    local.dismissedCountryTasks,
    remote.dismissedCountryTasks,
  )
  // Misma regla que rowToTrip: days.length gana; si no hay días, el escalar.
  const numDays =
    days.length > 0
      ? days.length
      : pickScalar(base.numDays, local.numDays, remote.numDays, "dates", notes)
  const endDate =
    startDate && numDays != null && numDays > 0
      ? endDateFromStartAndNumDays(startDate, numDays)
      : null

  const trip: Trip = {
    ...remote,
    name,
    startDate,
    datesProvisional: Boolean(startDate && datesProvisional),
    numDays,
    endDate,
    expectations,
    cover,
    coverUrl,
    budget,
    shareCard,
    origin,
    numTravelers,
    currency,
    archived,
    days,
    basics,
    extraTasks,
    tasks,
    sourceIds,
    dismissedCountryTasks: dismissed,
    ownerId: remote.ownerId || local.ownerId || base.ownerId,
    version: remote.version,
    countries: pickScalar(base.countries, local.countries, remote.countries, "name", notes),
  }
  return { trip, notes }
}
