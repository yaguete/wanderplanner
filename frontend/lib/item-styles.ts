import { Car, Home, MapPin, Plane, Shield, Sparkles, UtensilsCrossed, Wifi, type LucideIcon } from "lucide-react"
import type { BasicCategory, ItemType } from "@/types/itinerary"

/** Color solo como señal: punto + texto sutil sobre chip neutro. */
export const ITEM_COLORS: Record<ItemType, { bg: string; border: string; text: string; dot: string }> = {
  transport: {
    bg: "bg-muted",
    border: "border-border",
    text: "text-muted-foreground",
    dot: "bg-sky-500",
  },
  stay: {
    bg: "bg-muted",
    border: "border-border",
    text: "text-muted-foreground",
    dot: "bg-orange-500",
  },
  food: {
    bg: "bg-muted",
    border: "border-border",
    text: "text-muted-foreground",
    dot: "bg-emerald-500",
  },
  activity: {
    bg: "bg-muted",
    border: "border-border",
    text: "text-muted-foreground",
    dot: "bg-violet-500",
  },
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
