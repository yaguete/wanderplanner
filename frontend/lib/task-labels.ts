/**
 * Copy y formato de la vista Tareas. Los verbos salen de `sourceKind`
 * (ItemType / BasicCategory / categoría del extra); no duplican reglas de bucket.
 */
import type { DerivedTripTask } from "@/lib/trip-tasks"
import type {
  BasicCategory,
  ItemType,
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

/** Título de fila como acción («Reservar Full Moon Budapest»). Extras: texto del usuario. */
export function taskActionTitle(task: Pick<DerivedTripTask, "origin" | "sourceKind" | "title">): string {
  if (task.origin === "extra") return task.title

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
 */
export function formatTaskDays(
  dayIndexes: number[],
  nights?: number,
): string | null {
  if (dayIndexes.length === 0) return null

  const days = dayIndexes.map((i) => i + 1)
  const dayPart = formatDayList(days)

  if (nights != null && nights > 0) {
    const nightLabel = nights === 1 ? "1 noche" : `${nights} noches`
    return `${nightLabel} · ${dayPart}`
  }
  return dayPart
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
