import {
  Bed,
  Bus,
  Car,
  CircleEllipsis,
  CircleHelp,
  Home,
  Luggage,
  MapPin,
  Plane,
  Shield,
  Ship,
  Sparkles,
  Ticket,
  Train,
  UtensilsCrossed,
  Wifi,
  createLucideIcon,
  type LucideIcon,
} from "lucide-react"
import { ITEM_TYPE_PAINT } from "@/lib/item-paint"
import { sanitizeAffiliateUrl } from "@/lib/affiliate-url"
import { isCarRentalItem } from "@/lib/transport-kind"
import type {
  BasicCategory,
  ItemType,
  RouteMode,
  SourceRouteHint,
  TaskGroupCategory,
  TransportRoute,
  UserDayItem,
} from "@/types/itinerary"

/**
 * Cabeza de caballo (lucide-lab `horse-head`, ISC). Lucide 0.454 no trae
 * caballo/camello/burro; las etiquetas del lab incluyen donkey.
 */
const HorseHead = createLucideIcon("horse-head", [
  ["path", { d: "M11.5 12H11" }],
  [
    "path",
    {
      d: "M5 15a4 4 0 0 0 4 4h7.8l.3.3a3 3 0 0 0 4-4.46L12 7c0-3-1-5-1-5S8 3 8 7c-4 1-6 3-6 3",
    },
  ],
  ["path", { d: "M6.14 17.8S4 19 2 22" }],
])

/**
 * Taxi (lucide `car-taxi-front`, ISC). Lucide 0.454 no exporta el icono.
 */
const CarTaxiFront = createLucideIcon("car-taxi-front", [
  ["path", { d: "M10 2h4" }],
  [
    "path",
    {
      d: "m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8",
    },
  ],
  ["path", { d: "M7 14h.01" }],
  ["path", { d: "M17 14h.01" }],
  ["rect", { width: "18", height: "8", x: "3", y: "10", rx: "2" }],
  ["path", { d: "M5 18v2" }],
  ["path", { d: "M19 18v2" }],
])

/** Chip con borde neutro; el color de tipo va en el texto (y en iconos de Mi viaje). */
export const ITEM_COLORS: Record<ItemType, { bg: string; border: string; text: string }> = {
  transport: {
    bg: "bg-muted",
    border: "border-border",
    text: ITEM_TYPE_PAINT.transport.textClass,
  },
  stay: {
    bg: "bg-muted",
    border: "border-border",
    text: ITEM_TYPE_PAINT.stay.textClass,
  },
  food: {
    bg: "bg-muted",
    border: "border-border",
    text: ITEM_TYPE_PAINT.food.textClass,
  },
  activity: {
    bg: "bg-muted",
    border: "border-border",
    text: ITEM_TYPE_PAINT.activity.textClass,
  },
}

/** Punto de timeline en la lista de Ruta: opaco, alineado con el color de categoría. */
export const ITEM_DOT_COLORS: Record<ItemType, string> = {
  transport: ITEM_TYPE_PAINT.transport.dotClass,
  stay: ITEM_TYPE_PAINT.stay.dotClass,
  food: ITEM_TYPE_PAINT.food.dotClass,
  activity: ITEM_TYPE_PAINT.activity.dotClass,
}

export const ITEM_LABELS: Record<ItemType, string> = {
  transport: "Transporte",
  stay: "Alojamiento",
  food: "Restaurante",
  activity: "Actividad",
}

export function itemEditAriaLabel(
  type: ItemType,
  opts?: { route?: TransportRoute | null },
): string {
  if (isCarRentalItem({ type, route: opts?.route })) return "Editar alquiler de coche"
  if (type === "transport") return "Editar traslado"
  return `Editar ${ITEM_LABELS[type].toLowerCase()}`
}

/**
 * Etiqueta visible de un ítem. Una activity sin enlace de reserva es un «Lugar».
 * Un alquiler es «Coche de alquiler», no «Transporte».
 * `ITEM_LABELS` sigue siendo el diccionario del tipo (selector de alta, etc.).
 */
export function itemTypeLabel(
  type: ItemType,
  opts?: { affiliateUrl?: string | null; route?: TransportRoute | null },
): string {
  if (isCarRentalItem({ type, route: opts?.route })) return "Coche de alquiler"
  if (type === "activity" && !sanitizeAffiliateUrl(opts?.affiliateUrl)) return "Lugar"
  return ITEM_LABELS[type]
}

export const ITEM_TYPE_ICONS: Record<ItemType, LucideIcon> = {
  transport: Car,
  stay: Home,
  food: UtensilsCrossed,
  activity: MapPin,
}

/**
 * Iconos de los seis grupos visibles. Alineado con `ItineraryViewModeTabs`
 * a propósito (Bed / Ticket / Car / Luggage), no con los puntos del timeline.
 */
export const TASK_CATEGORY_ICONS: Record<TaskGroupCategory, LucideIcon> = {
  accommodation: Bed,
  transport: Car,
  activity: Ticket,
  food: UtensilsCrossed,
  basic: Luggage,
  other: CircleEllipsis,
}

/**
 * Icono visible de un ítem. Una activity con enlace de reserva es una
 * «Actividad» (`Ticket`, mismo pictograma que la pestaña); sin enlace es un
 * «Lugar» (`MapPin`). El selector de alta sigue usando `ITEM_TYPE_ICONS`.
 */
export function itemTypeIcon(
  type: ItemType,
  opts?: { affiliateUrl?: string | null },
): LucideIcon {
  if (type === "activity" && sanitizeAffiliateUrl(opts?.affiliateUrl)) return Ticket
  return ITEM_TYPE_ICONS[type]
}

export type TransportModeVisualKey = RouteMode | "undecided"

export const TRANSPORT_MODE_ICONS: Record<TransportModeVisualKey, LucideIcon> = {
  flight: Plane,
  train: Train,
  bus: Bus,
  ferry: Ship,
  car: Car,
  taxi: CarTaxiFront,
  other: HorseHead,
  undecided: CircleHelp,
}

export const TRANSPORT_MODE_A11Y: Record<TransportModeVisualKey, string> = {
  flight: "Avión",
  train: "Tren",
  bus: "Autobús",
  ferry: "Ferry",
  car: "Coche",
  taxi: "Taxi",
  other: "Otro",
  undecided: "Medio por decidir",
}

/** Orden y copy del selector de medio (formulario de traslado). */
export const TRANSPORT_MODE_OPTIONS: {
  value: TransportModeVisualKey
  label: string
}[] = [
  { value: "undecided", label: "Aún no lo sé" },
  { value: "car", label: "Coche" },
  { value: "taxi", label: "Taxi" },
  { value: "flight", label: "Avión" },
  { value: "train", label: "Tren" },
  { value: "bus", label: "Autobús" },
  { value: "ferry", label: "Ferry" },
  { value: "other", label: "Otro" },
]

/** Inferencia legacy por texto (fuentes cacheadas sin hint). */
export function inferTransportModeFromText(label: string): TransportModeVisualKey {
  const t = label.toLowerCase()
  if (/(taxi|uber|bolt|lyft|\bcab\b)/i.test(t)) return "taxi"
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
