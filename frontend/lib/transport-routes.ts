/**
 * Helpers de transportes estructurados (legs e internos) — T4B.3 §9.
 * Sin I/O. El formulario y las mutaciones delegan naming/seeds aquí.
 */
import type {
  RouteMode,
  RoutePlace,
  SourceRouteHint,
  TransportRoute,
  TripTaskState,
  UserDayItem,
} from "@/types/itinerary"
import { MANUAL_SOURCE_ID } from "@/lib/item-provenance"
import { formatLegName, isRouteMode, routeModeLabel } from "@/lib/route-legs"
import { applySpanDays } from "@/lib/item-span"
import {
  isCarRentalRoute,
  rentalDescriptiveName,
  rentalDisplayName,
  rentalMaxPickupIndex,
  rentalRegionLabel,
  rentalRouteFromPickup,
  transportWriteError,
} from "@/lib/transport-kind"

export type TransportFormSeed = {
  from: RoutePlace | null
  to: RoutePlace | null
  pendingFromText: string | null
  pendingToText: string | null
  mode: RouteMode | "undecided"
  vendor: string
  detail: string
  carUse: "owned" | "rental" | null
  pickupAddress: RoutePlace | null
  dropoffAddress: RoutePlace | null
}

export type UpsertTransportRoutePayload = {
  dayId: string
  itemId?: string
  /** Día de devolución; solo rama alquiler. */
  returnDayId?: string
  route: TransportRoute
  detail?: string | null
  vendor?: string | null
  taskPatch?: Partial<TripTaskState> | null
}

export type TransportRouteWriteOk = {
  ok: true
  pickupIndex: number
  returnIndex: number
  rental: boolean
}

/**
 * Valida la variante **antes** del discriminador de lectura. Un `carUse:
 * rental` con `leg` no se degrada a traslado: se rechaza.
 */
export function validateTransportRouteWrite(
  data: UpsertTransportRoutePayload,
  dayIds: readonly string[],
): TransportRouteWriteOk | { ok: false; error: string } {
  const pickupIndex = dayIds.indexOf(data.dayId)
  if (pickupIndex < 0) {
    return { ok: false, error: "Día no encontrado." }
  }

  const writeError = transportWriteError(data.route)
  if (writeError) return { ok: false, error: writeError }

  const rental =
    data.route.carUse === "rental" &&
    data.route.mode === "car" &&
    data.route.leg == null

  let returnIndex = pickupIndex
  if (rental) {
    if (!data.returnDayId) {
      return { ok: false, error: "Elige un día de devolución posterior a la recogida." }
    }
    returnIndex = dayIds.indexOf(data.returnDayId)
    if (returnIndex < 0) {
      return { ok: false, error: "Día de devolución no encontrado." }
    }
    if (pickupIndex > rentalMaxPickupIndex(dayIds.length)) {
      return {
        ok: false,
        error:
          dayIds.length < 2
            ? "El alquiler necesita al menos dos días en el viaje."
            : "Elige un día de recogida anterior al último día del viaje.",
      }
    }
    if (returnIndex <= pickupIndex) {
      return { ok: false, error: "La devolución tiene que ser posterior a la recogida." }
    }
  }

  return { ok: true, pickupIndex, returnIndex, rental }
}

/** Mapea el `Transport.type` de extracción a `RouteMode` (valores ya alineados). */
export function routeModeFromExtractionType(
  type: string | null | undefined,
): RouteMode | null {
  if (type == null) return null
  return isRouteMode(type) ? type : null
}

export function sourceRouteHintFromTransport(t: {
  type: string
  from: string | null
  to: string | null
}): SourceRouteHint {
  return {
    from: t.from?.trim() || null,
    to: t.to?.trim() || null,
    mode: routeModeFromExtractionType(t.type),
  }
}

/**
 * Heurística legacy: una sola flecha «A → B» → textos pendientes (sin coords).
 * Títulos opacos o con varias flechas → vacío.
 */
export function splitArrowTitle(name: string): { from: string; to: string } | null {
  const parts = name.split(/\s*→\s*/)
  if (parts.length !== 2) return null
  const from = parts[0]!.trim()
  const to = parts[1]!.trim()
  if (!from || !to) return null
  return { from, to }
}

/**
 * Prioridad de seeds al abrir el diálogo de traslado interno:
 * route confirmada > hint de fuente > split del nombre > vacío.
 */
export function seedTransportForm(item?: UserDayItem | null): TransportFormSeed {
  const carUse = item?.route?.carUse === "owned" || item?.route?.carUse === "rental"
    ? item.route.carUse
    : null
  if (item?.route?.from && item.route.to) {
    return {
      from: item.route.from,
      to: item.route.to,
      pendingFromText: null,
      pendingToText: null,
      mode: item.route.mode ?? "undecided",
      vendor: item.vendor ?? "",
      detail: item.detail ?? "",
      carUse,
      pickupAddress: item.route.pickupAddress ?? null,
      dropoffAddress: item.route.dropoffAddress ?? null,
    }
  }

  const hint = item?.sourceRouteHint
  if (hint && (hint.from || hint.to || hint.mode)) {
    return {
      from: null,
      to: null,
      pendingFromText: hint.from,
      pendingToText: hint.to,
      mode: hint.mode ?? "undecided",
      vendor: item?.vendor ?? "",
      detail: item?.detail ?? "",
      carUse: null,
      pickupAddress: null,
      dropoffAddress: null,
    }
  }

  const split = item?.name ? splitArrowTitle(item.name) : null
  if (split) {
    return {
      from: null,
      to: null,
      pendingFromText: split.from,
      pendingToText: split.to,
      mode: "undecided",
      vendor: item?.vendor ?? "",
      detail: item?.detail ?? "",
      carUse: null,
      pickupAddress: null,
      dropoffAddress: null,
    }
  }

  return {
    from: null,
    to: null,
    pendingFromText: null,
    pendingToText: null,
    mode: "undecided",
    vendor: item?.vendor ?? "",
    detail: item?.detail ?? "",
    carUse: null,
    pickupAddress: null,
    dropoffAddress: null,
  }
}

export function formatRouteSummary(params: {
  mode?: RouteMode | null
  leg?: "outbound" | "return" | null
  vendor?: string | null
  carUse?: TransportRoute["carUse"]
}): string {
  if (params.carUse === "rental" && params.mode === "car") {
    return rentalDescriptiveName(params.vendor)
  }
  const parts = [
    routeModeLabel(params.mode),
    params.leg === "outbound" ? "Ida" : params.leg === "return" ? "Vuelta" : null,
    params.vendor?.trim() || null,
  ].filter(Boolean)
  return parts.join(" · ")
}

/** Construye o actualiza un ítem de traslado interno o alquiler (sin `leg`). */
export function buildTransportRouteItem(params: {
  route: Omit<TransportRoute, "leg"> & { from: RoutePlace; to: RoutePlace }
  detail?: string | null
  vendor?: string | null
  existing?: UserDayItem | null
  /** Índice ancla y duración inclusiva; solo alquiler. */
  span?: { anchorIndex: number; coverage: number; numDays: number }
}): UserDayItem {
  const { route, detail, vendor, existing, span } = params
  const cleanVendor = vendor?.trim() ? vendor.trim() : null
  const cleanDetail = detail?.trim() ? detail.trim() : null

  const rental = isCarRentalRoute(route)
  const cleanRoute: TransportRoute = rental
    ? rentalRouteFromPickup(route.from, route.to, {
        pickupAddress: route.pickupAddress,
        dropoffAddress: route.dropoffAddress,
      })
    : {
        from: route.from,
        to: route.to,
        mode: route.mode ?? null,
        ...(route.carUse === "owned" && route.mode === "car"
          ? { carUse: "owned" as const }
          : {}),
      }

  const name = rental
    ? rentalDisplayName(cleanVendor)
    : formatLegName(route.from.label, route.to.label)
  const region = rental ? rentalRegionLabel(cleanRoute) : route.to.label
  const coords = rental
    ? (cleanRoute.pickupAddress?.coords ?? route.from.coords)
    : route.to.coords

  let item: UserDayItem
  if (existing) {
    item = {
      ...existing,
      type: "transport",
      name,
      detail: cleanDetail,
      vendor: cleanVendor,
      region,
      coords,
      route: cleanRoute,
    }
    if (!rental && item.spanDays !== undefined) {
      const rest = { ...item }
      delete rest.spanDays
      item = rest
    }
  } else {
    item = {
      id: crypto.randomUUID(),
      sourceItemId: `manual-${crypto.randomUUID()}`,
      sourceId: MANUAL_SOURCE_ID,
      type: "transport",
      name,
      detail: cleanDetail,
      sourceAuthor: "Tú",
      region,
      coords,
      vendor: cleanVendor,
      route: cleanRoute,
    }
  }

  if (rental && span) {
    item = applySpanDays(item, span.coverage, span.anchorIndex, span.numDays)
  } else if (!rental && item.spanDays !== undefined) {
    const rest = { ...item }
    delete rest.spanDays
    item = rest
  }
  return item
}

/**
 * Migra `trip.tasks` al estructurar un transporte legacy.
 * Si varias cards compartían oldKey, el estado pasa a la card editada;
 * las demás vuelven a pending (sin clave propia hasta que se estructuren).
 */
export function migrateTaskKeyOnStructure(params: {
  tasks: Record<string, TripTaskState>
  oldKey: string
  newKey: string
}): Record<string, TripTaskState> {
  const { tasks, oldKey, newKey } = params
  if (oldKey === newKey) return tasks
  const next = { ...tasks }
  const prev = next[oldKey]
  if (prev) {
    next[newKey] = prev
    delete next[oldKey]
  }
  return next
}
