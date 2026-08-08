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

export type TransportFormSeed = {
  from: RoutePlace | null
  to: RoutePlace | null
  pendingFromText: string | null
  pendingToText: string | null
  mode: RouteMode | "undecided"
  vendor: string
  detail: string
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
  if (item?.route?.from && item.route.to) {
    return {
      from: item.route.from,
      to: item.route.to,
      pendingFromText: null,
      pendingToText: null,
      mode: item.route.mode ?? "undecided",
      vendor: item.vendor ?? "",
      detail: item.detail ?? "",
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
  }
}

export function formatRouteSummary(params: {
  mode?: RouteMode | null
  leg?: "outbound" | "return" | null
  vendor?: string | null
}): string {
  const parts = [
    routeModeLabel(params.mode),
    params.leg === "outbound" ? "Ida" : params.leg === "return" ? "Vuelta" : null,
    params.vendor?.trim() || null,
  ].filter(Boolean)
  return parts.join(" · ")
}

/** Construye o actualiza un ítem de traslado interno (sin `leg`). */
export function buildTransportRouteItem(params: {
  route: Omit<TransportRoute, "leg"> & { from: RoutePlace; to: RoutePlace }
  detail?: string | null
  vendor?: string | null
  existing?: UserDayItem | null
}): UserDayItem {
  const { route, detail, vendor, existing } = params
  const cleanRoute: TransportRoute = {
    from: route.from,
    to: route.to,
    mode: route.mode ?? null,
  }
  if (existing) {
    return {
      ...existing,
      type: "transport",
      name: formatLegName(route.from.label, route.to.label),
      detail: detail?.trim() ? detail.trim() : null,
      vendor: vendor?.trim() ? vendor.trim() : null,
      region: route.to.label,
      coords: route.to.coords,
      route: cleanRoute,
    }
  }
  return {
    id: crypto.randomUUID(),
    sourceItemId: `manual-${crypto.randomUUID()}`,
    sourceId: MANUAL_SOURCE_ID,
    type: "transport",
    name: formatLegName(route.from.label, route.to.label),
    detail: detail?.trim() ? detail.trim() : null,
    sourceAuthor: "Tú",
    region: route.to.label,
    coords: route.to.coords,
    vendor: vendor?.trim() ? vendor.trim() : null,
    route: cleanRoute,
  }
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
