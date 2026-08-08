/**
 * Copy y formato de la vista Tareas. Los verbos salen de `sourceKind`
 * (ItemType / BasicCategory / categoría del extra); no duplican reglas de bucket.
 * Tramos de ida/vuelta (T4B.3): el verbo depende de `route.mode`.
 */
import type { DerivedTripTask } from "@/lib/trip-tasks"
import { dateISOForDayIndex, formatDayDate } from "@/lib/trip-dates"
import type {
  BasicCategory,
  ItemType,
  RouteMode,
  TripTaskCategory,
  TripTaskStatus,
} from "@/types/itinerary"

/** Orden de grupos en la lista principal (y en el selector de extras). */
export const TASK_CATEGORY_ORDER: TripTaskCategory[] = [
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

/** Categorías elegibles al crear una tarea manual (seis grupos visibles). */
export const EXTRA_TASK_CATEGORIES: TripTaskCategory[] = [
  "accommodation",
  "transport",
  "activity",
  "food",
  "basic",
  "other",
]

export const TASK_STATUS_LABELS: Record<TripTaskStatus, string> = {
  booked: "Reservado",
  paid: "Pagado",
  pending: "Pendiente",
  notNeeded: "Sin reserva",
}

const ITEM_VERBS: Record<ItemType, string> = {
  stay: "Reservar",
  activity: "Reservar",
  food: "Reservar",
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

function legActionTitle(
  mode: RouteMode | null | undefined,
  title: string,
  routeToLabel?: string | null,
): string {
  const dest = routeToLabel?.trim() || destinationFromTitle(title)
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

/** Título de fila como acción («Reservar Full Moon Budapest»). Extras: texto del usuario. */
export function taskActionTitle(
  task: Pick<DerivedTripTask, "origin" | "sourceKind" | "title" | "route">,
): string {
  if (task.origin === "extra") return task.title

  // Transporte con ruta estructurada (leg o interno): verbo según medio.
  if (task.origin === "dayItem" && task.route?.from && task.route.to) {
    return legActionTitle(task.route.mode, task.title, task.route.to.label)
  }

  const kind = task.sourceKind
  if (isItemType(kind)) {
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
 * Alojamientos con `nights`: «3 noches · días 1–3».
 * Con `startDate`: anexa calendario («día 1 · dom 9 ago»).
 */
export function formatTaskDays(
  dayIndexes: number[],
  nights?: number,
  startDate?: string | null,
): string | null {
  if (dayIndexes.length === 0) return null

  const days = dayIndexes.map((i) => i + 1)
  const dayPart = formatDayList(days)
  const datePart = formatTaskCalendarRange(dayIndexes, startDate ?? null)

  let base: string
  if (nights != null && nights > 0) {
    const nightLabel = nights === 1 ? "1 noche" : `${nights} noches`
    base = `${nightLabel} · ${dayPart}`
  } else {
    base = dayPart
  }

  return datePart ? `${base} · ${datePart}` : base
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
export function taskGroupKey(category: TripTaskCategory): TripTaskCategory {
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
