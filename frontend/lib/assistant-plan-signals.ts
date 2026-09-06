/**
 * Señales deterministas del plan para el briefing y los chips del asistente.
 * Sin I/O: solo lee el jsonb del viaje.
 */
import type { ItemType, Trip, UserDay, UserDayItem } from "@/types/itinerary"
import { haversineMeters } from "@/lib/map-route-geometry"
import { isCarRentalItem } from "@/lib/transport-kind"

export const LONG_HOP_KM = 60
export const LOADED_TIME_ITEMS = 4
export const FORECAST_HORIZON_DAYS = 14
const MAX_COORDS_PER_DAY = 10

const TIME_TYPES = new Set<ItemType>(["activity", "food", "transport"])

export type WeatherHorizon = "forecast" | "climatology" | "none"

export type PlanDayRef = {
  dayNumber: number
  dayId: string
}

export type LongHop = PlanDayRef & {
  fromName: string
  toName: string
  km: number
}

export type StayMismatch = PlanDayRef & {
  stayRegion: string
  activityRegions: string[]
}

export type PlanSignals = {
  emptyDays: PlanDayRef[]
  thinDays: PlanDayRef[]
  loadedDays: Array<PlanDayRef & { timeItems: number }>
  stayMismatch: StayMismatch[]
  missingStay: PlanDayRef[]
  longHops: LongHop[]
  weatherHorizon: WeatherHorizon
  daysUntilStart: number | null
  totalItems: number
  hasAuditSubstance: boolean
}

export type CollectPlanSignalsOptions = {
  today?: Date
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseYmd(raw: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim())
  if (!m) return null
  const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)
  return Number.isFinite(t) ? t : null
}

export function weatherHorizonFor(
  startDate: string | null | undefined,
  today: Date = new Date(),
): { horizon: WeatherHorizon; daysUntilStart: number | null } {
  if (!startDate?.trim()) return { horizon: "none", daysUntilStart: null }
  const start = parseYmd(startDate)
  if (start == null) return { horizon: "none", daysUntilStart: null }
  const todayT = parseYmd(ymdLocal(today))
  if (todayT == null) return { horizon: "none", daysUntilStart: null }
  const daysUntilStart = Math.round((start - todayT) / 86_400_000)
  if (daysUntilStart > FORECAST_HORIZON_DAYS) {
    return { horizon: "climatology", daysUntilStart }
  }
  return { horizon: "forecast", daysUntilStart }
}

function normalizeRegion(raw: string | null | undefined): string | null {
  const t = raw?.trim().replace(/\s+/g, " ")
  if (!t) return null
  return t.toLocaleLowerCase("es")
}

function timeOccupyingCount(items: readonly UserDayItem[]): number {
  return items.filter((i) => TIME_TYPES.has(i.type) && !isCarRentalItem(i)).length
}

function refFor(day: UserDay, index: number): PlanDayRef {
  return { dayNumber: index + 1, dayId: day.id }
}

export function planHasAuditSubstance(trip: Pick<Trip, "days">): boolean {
  const total = trip.days.reduce((n, d) => n + d.items.length, 0)
  if (total < 3) return false
  return trip.days.some((d) => d.items.length >= 2)
}

export function collectPlanSignals(
  trip: Pick<Trip, "days" | "startDate">,
  options: CollectPlanSignalsOptions = {},
): PlanSignals {
  const today = options.today ?? new Date()
  const { horizon, daysUntilStart } = weatherHorizonFor(trip.startDate, today)

  const emptyDays: PlanDayRef[] = []
  const thinDays: PlanDayRef[] = []
  const loadedDays: Array<PlanDayRef & { timeItems: number }> = []
  const stayMismatch: StayMismatch[] = []
  const missingStay: PlanDayRef[] = []
  const longHops: LongHop[] = []

  const anyStay = trip.days.some((d) => d.items.some((i) => i.type === "stay"))
  let totalItems = 0

  trip.days.forEach((day, index) => {
    const items = day.items
    totalItems += items.length
    const dayRef = refFor(day, index)

    if (items.length === 0) emptyDays.push(dayRef)
    else if (items.length === 1) thinDays.push(dayRef)

    const timeItems = timeOccupyingCount(items)
    if (timeItems >= LOADED_TIME_ITEMS) {
      loadedDays.push({ ...dayRef, timeItems })
    }

    const stay = items.find((i) => i.type === "stay")
    if (anyStay && !stay) missingStay.push(dayRef)

    if (stay) {
      const stayRegion = normalizeRegion(stay.region)
      if (stayRegion) {
        const activityRegions = [
          ...new Set(
            items
              .filter((i) => i.type === "activity" || i.type === "food")
              .map((i) => normalizeRegion(i.region))
              .filter((r): r is string => Boolean(r) && r !== stayRegion),
          ),
        ]
        if (activityRegions.length) {
          stayMismatch.push({
            ...dayRef,
            stayRegion: stay.region!.trim(),
            activityRegions: items
              .filter((i) => i.type === "activity" || i.type === "food")
              .map((i) => i.region?.trim())
              .filter((r): r is string => Boolean(r) && normalizeRegion(r) !== stayRegion)
              .filter((r, i, all) => all.findIndex((x) => normalizeRegion(x) === normalizeRegion(r)) === i),
          })
        }
      }
    }

    const withCoords = items
      .filter((i) => !isCarRentalItem(i))
      .filter((i) => i.coords && Number.isFinite(i.coords.lng) && Number.isFinite(i.coords.lat))
      .slice(0, MAX_COORDS_PER_DAY)
    for (let i = 0; i < withCoords.length; i++) {
      for (let j = i + 1; j < withCoords.length; j++) {
        const a = withCoords[i]!
        const b = withCoords[j]!
        const km = haversineMeters(a.coords!, b.coords!) / 1000
        if (km > LONG_HOP_KM) {
          longHops.push({
            ...dayRef,
            fromName: a.name,
            toName: b.name,
            km: Math.round(km),
          })
        }
      }
    }
  })

  return {
    emptyDays,
    thinDays,
    loadedDays,
    stayMismatch,
    missingStay,
    longHops,
    weatherHorizon: horizon,
    daysUntilStart,
    totalItems,
    hasAuditSubstance: planHasAuditSubstance(trip),
  }
}

export function formatPlanSignalsMarkdown(signals: PlanSignals): string {
  const lines: string[] = ["## Señales del plan"]

  if (signals.weatherHorizon === "none") {
    lines.push("- horizonte meteo: sin fechas")
  } else if (signals.weatherHorizon === "forecast") {
    const n = signals.daysUntilStart
    const when =
      n == null
        ? ""
        : n <= 0
          ? " (el viaje ya ha empezado)"
          : ` (el viaje empieza en ${n} día${n === 1 ? "" : "s"})`
    lines.push(`- horizonte meteo: forecast${when}`)
  } else {
    const n = signals.daysUntilStart
    const when = n != null ? ` (el viaje empieza en ${n} días)` : ""
    lines.push(`- horizonte meteo: climatology${when}`)
  }

  for (const d of signals.emptyDays) {
    lines.push(`- día ${d.dayNumber}: 0 ítems`)
  }
  for (const d of signals.thinDays) {
    lines.push(`- día ${d.dayNumber}: 1 ítem`)
  }
  for (const d of signals.loadedDays) {
    lines.push(`- día ${d.dayNumber}: ${d.timeItems} ítems que ocupan tiempo`)
  }
  for (const d of signals.stayMismatch) {
    lines.push(
      `- día ${d.dayNumber}: alojamiento en ${d.stayRegion}; actividades en ${d.activityRegions.join(", ")}`,
    )
  }
  for (const d of signals.missingStay) {
    lines.push(`- día ${d.dayNumber}: sin alojamiento (otros días sí tienen)`)
  }
  for (const hop of signals.longHops) {
    lines.push(
      `- día ${hop.dayNumber}: ${hop.km} km entre ${hop.fromName} y ${hop.toName} (coords)`,
    )
  }

  if (lines.length === 2 && signals.weatherHorizon === "none") {
    lines.push("- (sin otras señales)")
  }

  return lines.join("\n")
}

export const CHIP_REVIEW_GAPS = "Revisa qué huecos tiene el plan"
export const CHIP_WEATHER_REORDER = "Si pinta lluvia, reordenamos el plan"

export function chipLoadedDay(dayNumber: number): string {
  return `El día ${dayNumber} está muy cargado, ¿lo recortamos?`
}

function hasGapSignals(signals: PlanSignals): boolean {
  return (
    signals.emptyDays.length > 0 ||
    signals.thinDays.length > 0 ||
    signals.stayMismatch.length > 0 ||
    signals.missingStay.length > 0 ||
    signals.longHops.length > 0
  )
}

export function buildContextualAuditChips(
  signals: PlanSignals,
  usedPrompts: readonly string[] = [],
): string[] {
  if (!signals.hasAuditSubstance) return []
  const used = new Set(usedPrompts.map((s) => s.trim()).filter(Boolean))
  const out: string[] = []
  const push = (s: string) => {
    if (used.has(s) || out.includes(s)) return
    out.push(s)
  }
  if (hasGapSignals(signals)) push(CHIP_REVIEW_GAPS)
  const loaded = signals.loadedDays[0]
  if (loaded) push(chipLoadedDay(loaded.dayNumber))
  if (signals.weatherHorizon === "forecast") push(CHIP_WEATHER_REORDER)
  return out.slice(0, 3)
}
