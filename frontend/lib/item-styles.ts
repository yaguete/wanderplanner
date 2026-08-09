import {
  Bus,
  Car,
  Caravan,
  CircleHelp,
  Home,
  MapPin,
  Plane,
  Shield,
  Ship,
  Sparkles,
  Train,
  UtensilsCrossed,
  Wifi,
  type LucideIcon,
} from "lucide-react"
import type { BasicCategory, ItemType, RouteMode, SourceRouteHint, UserDayItem } from "@/types/itinerary"

/** Chip con borde neutro; el color de tipo va en el texto (y en iconos de Mi viaje). */
export const ITEM_COLORS: Record<ItemType, { bg: string; border: string; text: string }> = {
  transport: {
    bg: "bg-muted",
    border: "border-border",
    text: "text-sky-600",
  },
  stay: {
    bg: "bg-muted",
    border: "border-border",
    text: "text-orange-600",
  },
  food: {
    bg: "bg-muted",
    border: "border-border",
    text: "text-emerald-600",
  },
  activity: {
    bg: "bg-muted",
    border: "border-border",
    text: "text-violet-600",
  },
}

/** Punto de timeline en la lista de Ruta: opaco, alineado con el color de categoría. */
export const ITEM_DOT_COLORS: Record<ItemType, string> = {
  transport: "bg-sky-600",
  stay: "bg-orange-600",
  food: "bg-emerald-600",
  activity: "bg-violet-600",
}

export const ITEM_LABELS: Record<ItemType, string> = {
  transport: "Transporte",
  stay: "Alojamiento",
  food: "Restaurante",
  activity: "Actividad",
}

export const ITEM_TYPE_ICONS: Record<ItemType, LucideIcon> = {
  transport: Car,
  stay: Home,
  food: UtensilsCrossed,
  activity: MapPin,
}

export type TransportModeVisualKey = RouteMode | "undecided"

export const TRANSPORT_MODE_ICONS: Record<TransportModeVisualKey, LucideIcon> = {
  flight: Plane,
  train: Train,
  bus: Bus,
  ferry: Ship,
  car: Car,
  other: Caravan,
  undecided: CircleHelp,
}

export const TRANSPORT_MODE_A11Y: Record<TransportModeVisualKey, string> = {
  flight: "Avión",
  train: "Tren",
  bus: "Autobús",
  ferry: "Ferry",
  car: "Coche",
  other: "Otro",
  undecided: "Medio por decidir",
}

/** Inferencia legacy por texto (fuentes cacheadas sin hint). */
export function inferTransportModeFromText(label: string): TransportModeVisualKey {
  const t = label.toLowerCase()
  if (/(vuelo|av[ií]on|flight|air|aeropuerto)/i.test(t)) return "flight"
  if (/(tren|train|rail)/i.test(t)) return "train"
  if (/(bus|autob[uú]s|coach|minivan|shuttle)/i.test(t)) return "bus"
  if (/(ferry|barco|boat)/i.test(t)) return "ferry"
  if (/(coche|car\b|drive|driving)/i.test(t)) return "car"
  return "undecided"
}

/**
 * Resolución de medio para iconografía.
 * Mi viaje: route.mode → hint → texto → undecided.
 * Fuentes (`preferHint`): hint → texto.
 */
export function resolveTransportModeVisual(params: {
  routeMode?: RouteMode | null
  hint?: SourceRouteHint | null
  name?: string | null
  detail?: string | null
  preferHint?: boolean
}): TransportModeVisualKey {
  if (params.preferHint) {
    if (params.hint?.mode) return params.hint.mode
    return inferTransportModeFromText(`${params.name ?? ""} ${params.detail ?? ""}`)
  }
  if (params.routeMode) return params.routeMode
  if (params.hint?.mode) return params.hint.mode
  return inferTransportModeFromText(`${params.name ?? ""} ${params.detail ?? ""}`)
}

export function transportModeIcon(key: TransportModeVisualKey): LucideIcon {
  return TRANSPORT_MODE_ICONS[key]
}

export function transportIconForItem(
  item: Pick<UserDayItem, "route" | "sourceRouteHint" | "name" | "detail">,
): { Icon: LucideIcon; label: string; mode: TransportModeVisualKey } {
  const mode = resolveTransportModeVisual({
    routeMode: item.route?.mode,
    hint: item.sourceRouteHint,
    name: item.name,
    detail: item.detail,
  })
  return { Icon: TRANSPORT_MODE_ICONS[mode], label: TRANSPORT_MODE_A11Y[mode], mode }
}

export const BASIC_LABELS: Record<BasicCategory, string> = {
  insurance: "Seguro",
  sim: "SIM / eSIM",
  carRental: "Alquiler",
  flight: "Vuelo",
  other: "Otros",
}

export const BASIC_ICONS: Record<BasicCategory, LucideIcon> = {
  insurance: Shield,
  sim: Wifi,
  carRental: Car,
  flight: Plane,
  other: Sparkles,
}
