/**
 * Copy y formato de la vista Tareas. Los verbos salen de `sourceKind`
 * (ItemType / BasicCategory / categoría del extra); no duplican reglas de bucket.
 * Tramos de ida/vuelta (T4B.3): el verbo depende de `route.mode`.
 */
import type { DerivedTripTask } from "@/lib/trip-tasks"
import { resolveAirportCode } from "@/lib/airports"
import { dateISOForDayIndex, formatDayDate } from "@/lib/trip-dates"
import { isCarRentalRoute, sameRoutePlace } from "@/lib/transport-kind"
import type {
  BasicCategory,
  ItemType,
  RouteMode,
  RoutePlace,
  TaskGroupCategory,
  TripTaskCategory,
  TripTaskStatus,
} from "@/types/itinerary"

/** Orden de grupos en la lista principal (y en el selector de extras). */
export const TASK_CATEGORY_ORDER: TaskGroupCategory[] = [
  "accommodation",
  "transport",
  "activity",
  "food",
  "basic",
  "other",
]

export const TASK_CATEGORY_LABELS: Record<TripTaskCategory, string> = {
  accommodation: "Alojamiento",
  transport: "Transporte",
  activity: "Actividades",
  food: "Restaurantes",
  basic: "Básicos",
  paperwork: "Otras",
  health: "Otras",
  other: "Otras",
}

/**
 * Cabecera de grupo en el triaje. En Ruta una activity sin enlace es un
 * «Lugar»; esas son las que caen aquí (`taskBucket`), no las «Actividades»
 * con reserva.
 */
export function triageCategoryLabel(category: TripTaskCategory): string {
  if (category === "activity") return "Lugares"
  return TASK_CATEGORY_LABELS[category]
}

export const TASK_STATUS_LABELS: Record<TripTaskStatus, string> = {
  booked: "Reservado",
  paid: "Pagado",
  pending: "Pendiente",
  notNeeded: "Sin reserva",
}

const ITEM_VERBS: Record<Extract<ItemType, "transport">, string> = {
  transport: "Comprar",
}

const BASIC_VERBS: Record<BasicCategory, string> = {
  insurance: "Contratar",
  sim: "Comprar",
  carRental: "Alquilar",
  flight: "Comprar",
  other: "Gestionar",
}

function isItemType(kind: string): kind is ItemType {
  return kind === "stay" || kind === "activity" || kind === "food" || kind === "transport"
}

function isBasicCategory(kind: string): kind is BasicCategory {
  return (
    kind === "insurance" ||
    kind === "sim" ||
    kind === "carRental" ||
    kind === "flight" ||
    kind === "other"
  )
}

function destinationFromTitle(title: string): string {
  const parts = title.split(/\s*→\s*/)
  if (parts.length >= 2) {
    const dest = parts[parts.length - 1]!.trim()
    if (dest) return dest
  }
  return title
}

function routePlaceShortLabel(place: RoutePlace): string {
  if (place.kind === "airport") {
    const code = resolveAirportCode(place)
    if (code) return code
  }
  return place.label
}

function legActionTitle(mode: RouteMode | null | undefined, dest: string): string {
  switch (mode) {
    case "flight":
      return `Comprar los vuelos a ${dest}`
    case "train":
      return `Reservar el tren a ${dest}`
    case "bus":
      return `Reservar el autobús a ${dest}`
    case "ferry":
      return `Reservar el ferry a ${dest}`
    case "car":
      return `Preparar el trayecto en coche a ${dest}`
    case "other":
      return `Organizar el trayecto a ${dest}`
    default:
      return `Decidir cómo llegar a ${dest}`
  }
}

/** Título de fila. Stay / activity / food: solo el nombre (el CTA a la derecha
 * ya dice «Reservar»). Transporte: verbo según medio. Extras: texto del usuario.
 */
export function taskActionTitle(
  task: Pick<
    DerivedTripTask,
    "origin" | "sourceKind" | "title" | "route" | "roundtripFlight" | "affiliateUrl"
  >,
): string {
  if (task.origin === "extra") return task.title

  // Transporte con ruta estructurada (leg o interno): verbo según medio.
  if (task.origin === "dayItem" && task.route?.from && task.route.to) {
    if (isCarRentalRoute(task.route)) {
      const from = routePlaceShortLabel(task.route.from)
      const to = routePlaceShortLabel(task.route.to)
      if (!sameRoutePlace(task.route.from, task.route.to) && to && to !== from) {
        return `Alquilar coche en ${from} → ${to}`
      }
      return `Alquilar coche en ${from}`
    }
    if (task.roundtripFlight) {
      const from = routePlaceShortLabel(task.route.from)
      const to = routePlaceShortLabel(task.route.to)
      return `Comprar los vuelos ${from} ⇄ ${to}`
    }
    const dest = routePlaceShortLabel(task.route.to) || destinationFromTitle(task.title)
    return legActionTitle(task.route.mode, dest)
  }

  const kind = task.sourceKind
  if (isItemType(kind)) {
    if (kind === "stay" || kind === "activity" || kind === "food") return task.title
    return `${ITEM_VERBS[kind]} ${task.title}`
  }
  if (task.origin === "basic" && isBasicCategory(kind)) {
    return `${BASIC_VERBS[kind]} ${task.title}`
  }
  return task.title
}

/**
 * Meta de días / noches. `dayIndexes` es 0-based.
 * Contiguos → «días 1–3»; discontinuos → «días 1, 3».
 * Alojamientos con `nights` + fechas: «dom 9 ago – lun 10 ago (2 noches)».
 * Alojamientos sin fechas del viaje: «Días 1–2 (2 noches)» (sin calendario).
 * Con `startDate` en no-alojamiento: anexa calendario («día 1 · dom 9 ago»).
 */
export function formatTaskDays(
  dayIndexes: number[],
  nights?: number,
  startDate?: string | null,
  options?: { roundtrip?: boolean },
): string | null {
  if (dayIndexes.length === 0) return null

  if (options?.roundtrip) {
    return formatRoundtripTaskDays(dayIndexes, startDate ?? null)
  }

  const days = dayIndexes.map((i) => i + 1)
  const datePart = formatTaskCalendarRange(dayIndexes, startDate ?? null)

  if (nights != null && nights > 0) {
    const nightLabel = nights === 1 ? "1 noche" : `${nights} noches`
    if (datePart) return `${datePart} (${nightLabel})`
    const dayPart = formatDayList(days)
    return `${dayPart.charAt(0).toUpperCase()}${dayPart.slice(1)} (${nightLabel})`
  }

  const dayPart = formatDayList(days)
  return datePart ? `${dayPart} · ${datePart}` : dayPart
}

/** «ida 24 ago · vuelta 1 sept». Mismo día → solo la fecha (o «día 1»). */
function formatRoundtripTaskDays(
  dayIndexes: number[],
  startDate: string | null,
): string | null {
  if (dayIndexes.length === 0) return null
  const sorted = [...dayIndexes].sort((a, b) => a - b)
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const sameDay = first === last

  if (startDate) {
    const outDate = formatDayDate(dateISOForDayIndex(startDate, first))
    const retDate = formatDayDate(dateISOForDayIndex(startDate, last))
    if (sameDay) return outDate ?? `día ${first + 1}`
    if (outDate && retDate) return `ida ${outDate} · vuelta ${retDate}`
  }

  if (sameDay) return `día ${first + 1}`
  return `ida día ${first + 1} · vuelta día ${last + 1}`
}

/** Une meta de días + compañía + nota («día 9 · Vueling · ABCDE»). */
export function formatTaskMeta(parts: {
  dayMeta?: string | null
  vendor?: string | null
  detail?: string | null
}): string | null {
  const bits = [parts.dayMeta, parts.vendor, parts.detail]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p))
  return bits.length > 0 ? bits.join(" · ") : null
}

function formatTaskCalendarRange(
  dayIndexes: number[],
  startDate: string | null,
): string | null {
  if (!startDate || dayIndexes.length === 0) return null
  const sorted = [...dayIndexes].sort((a, b) => a - b)
  const first = formatDayDate(dateISOForDayIndex(startDate, sorted[0]!))
  if (!first) return null
  if (sorted.length === 1) return first
  const last = formatDayDate(dateISOForDayIndex(startDate, sorted[sorted.length - 1]!))
  if (!last || last === first) return first
  return `${first} – ${last}`
}

function formatDayList(days: number[]): string {
  if (days.length === 1) return `día ${days[0]}`

  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1]! + 1)
  if (contiguous) {
    return `días ${days[0]}–${days[days.length - 1]}`
  }
  return `días ${days.join(", ")}`
}

/** Clave de agrupación visual: paperwork/health caen en «Otras». */
export function taskGroupKey(category: TripTaskCategory): TaskGroupCategory {
  if (category === "paperwork" || category === "health") return "other"
  return category
}

export function formatTripCurrency(amount: number, currency: string): string {
  const code = currency.trim().toUpperCase() || "EUR"
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString("es-ES", { maximumFractionDigits: 2 })} ${code}`
  }
}

/** Parsea input con coma o punto decimal; vacío → null; inválido → null. */
export function parseCostInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".")
  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}
