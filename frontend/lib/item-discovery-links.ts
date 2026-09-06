/**
 * Precedencia de CTAs de reserva: el enlace del autor XOR los buscadores
 * propios. Puro; el diálogo solo pinta.
 *
 * Superficies: formulario de ítem, y «Reservar» en Tareas (`taskReserveAction`:
 * partner → href; stay/activity sin enlace → diálogo con el pack).
 *
 * `affiliate="partner"` va a mano — `classifyOutboundAffiliate` en `auto`
 * marcaría un Civitatis del bloguero como `"none"`, y el `aid=1006` de La
 * Cosmopolilla es *nuestra* cuenta. El canal se decide por procedencia
 * (¿hay `affiliateUrl` guardado?), nunca por el `aid` de la URL.
 *
 * Fechas de Booking: se pintan con [`bookingStayHref`](./booking-dates.ts);
 * no se escriben en el jsonb.
 */
import { sanitizeAffiliateUrl } from "@/lib/affiliate-url"
import { bookingStayHref } from "@/lib/booking-dates"
import {
  activityDiscoveryHrefs,
  type ActivityDiscoveryHrefs,
} from "@/lib/activity-search"
import { classifyOutboundTarget, type OutboundAffiliate } from "@/lib/funnel-analytics"
import { carRentalFormSearchHref } from "@/lib/car-rental-search"
import { isCarRentalItem, type TransportKindProbe } from "@/lib/transport-kind"
import {
  stayDiscoveryHrefs,
  type StayDiscoveryHrefs,
} from "@/lib/stay-discovery"
import type { ItemType, TransportRoute } from "@/types/itinerary"

export type CarRentalDiscoveryHrefs = {
  discovercars: string
}

export type ItemDiscoveryLinks =
  | {
      kind: "partner"
      href: string
      label: string
      affiliate: "partner"
    }
  | {
      kind: "own"
      stay?: StayDiscoveryHrefs
      activity?: ActivityDiscoveryHrefs
      carRental?: CarRentalDiscoveryHrefs
      hint?: string
    }
  | { kind: "none"; hint?: string }

export type ItemDiscoveryLinksInput = {
  type: ItemType
  affiliateUrl?: string | null
  vendor?: string | null
  sourceId?: string | null
  allowFromSource?: boolean
  destination: string
  selectedPlaceLabel?: string | null
  destinationHint?: string | null
  addressHint?: string | null
  coords?: { lng: number; lat: number } | null
  startDate: string | null
  dayIndexes: readonly number[]
  dayIndex: number
  spanDays: number
  currency?: string | null
  numTravelers?: number | null
  route?: TransportKindProbe["route"] | TransportRoute | null
}

export function partnerCtaLabel(href: string, vendor?: string | null): string {
  const target = classifyOutboundTarget(href)
  switch (target) {
    case "booking":
      return "Ver en Booking"
    case "airbnb":
      return "Ver en Airbnb"
    case "homeexchange":
      return "Ver en HomeExchange"
    case "civitatis":
      return "Ver en Civitatis"
    case "getyourguide":
    case "stay22":
      return "Ver en GetYourGuide"
    case "kayak":
      return "Ver en Kayak"
    case "skyscanner":
      return "Ver en Skyscanner"
    case "discovercars":
      return "Ver en DiscoverCars"
    default: {
      const v = vendor?.trim()
      return v ? `Ver en ${v}` : "Ver reserva"
    }
  }
}

export function itemDiscoveryLinks(input: ItemDiscoveryLinksInput): ItemDiscoveryLinks {
  const stored = sanitizeAffiliateUrl(input.affiliateUrl)
  if (stored) {
    const dated =
      input.type === "stay"
        ? (bookingStayHref({
            href: stored,
            startDate: input.startDate,
            dayIndexes: input.dayIndexes,
          }) ?? stored)
        : stored
    return {
      kind: "partner",
      href: dated,
      label: partnerCtaLabel(dated, input.vendor),
      affiliate: "partner" satisfies OutboundAffiliate,
    }
  }

  if (input.type === "stay") {
    const stay = stayDiscoveryHrefs({
      destination: input.destination,
      startDate: input.startDate,
      dayIndexes: input.dayIndexes,
      currency: input.currency,
      numTravelers: input.numTravelers,
      affiliateUrl: null,
      sourceId: input.sourceId,
      allowFromSource: input.allowFromSource,
    })
    if (!stay) return { kind: "none" }
    const has = Boolean(stay.booking || stay.airbnb || stay.homeExchange)
    return {
      kind: "own",
      stay,
      hint: has ? undefined : "Escribe una ciudad para buscar alojamiento.",
    }
  }

  if (input.type === "activity") {
    const activity = activityDiscoveryHrefs({
      sourceId: input.sourceId,
      affiliateUrl: null,
      allowFromSource: input.allowFromSource,
      selectedPlaceLabel: input.selectedPlaceLabel,
      destinationHint: input.destinationHint,
      addressHint: input.addressHint,
      coords: input.coords,
      startDate: input.startDate ?? undefined,
      dayIndex: input.dayIndex,
      spanDays: input.spanDays,
      numTravelers: input.numTravelers,
    })
    if (!activity) return { kind: "none" }
    const has = Boolean(activity.civitatis || activity.getYourGuide)
    return {
      kind: "own",
      activity,
      hint: has ? undefined : "Escribe una ciudad para buscar actividades.",
    }
  }

  if (input.type === "transport" && isCarRentalItem({ type: "transport", route: input.route })) {
    return {
      kind: "own",
      carRental: {
        discovercars: carRentalFormSearchHref({
          city: input.destination,
          startDate: input.startDate,
          pickupIndex: input.dayIndex,
          returnIndex: input.dayIndex + Math.max(input.spanDays, 1) - 1,
          affiliateUrl: null,
        }),
      },
      hint: "Elige la ciudad y las fechas en DiscoverCars.",
    }
  }

  return { kind: "none" }
}

/**
 * CTA del formulario de alquiler. Conserva el `affiliateUrl` de la fuente
 * (`partner`); si no hay enlace, el propio. No usa el guard de vuelos.
 */
export function rentalFormDiscoveryLinks(input: {
  affiliateUrl?: string | null
  vendor?: string | null
  sourceId?: string | null
  destination: string
  startDate: string | null
  pickupIndex: number
  spanDays: number
}): ItemDiscoveryLinks {
  const pickup = Math.max(0, input.pickupIndex)
  const span = Math.max(input.spanDays, 1)
  return itemDiscoveryLinks({
    type: "transport",
    affiliateUrl: input.affiliateUrl,
    vendor: input.vendor,
    sourceId: input.sourceId,
    allowFromSource: true,
    destination: input.destination,
    startDate: input.startDate,
    dayIndexes: Array.from({ length: span }, (_, i) => pickup + i),
    dayIndex: pickup,
    spanDays: span,
    route: { mode: "car", carUse: "rental" },
  })
}

/**
 * Qué pinta «Reservar» en Tareas: un href del autor, o el pack propio en un
 * diálogo. Stay y activity sin `affiliateUrl` (fuente, asistente o a mano)
 * abren el diálogo; food/transport/básicos sin enlace no tienen pack.
 */
export function taskReserveAction(params: {
  type: string
  sourceId?: string | null
  affiliateUrl?: string | null
  route?: TransportRoute | null
}): "partner" | "own-search" | "none" {
  if (sanitizeAffiliateUrl(params.affiliateUrl)) return "partner"
  if (params.type === "stay" || params.type === "activity") return "own-search"
  if (params.type === "transport" && isCarRentalItem({ type: "transport", route: params.route })) {
    return "own-search"
  }
  return "none"
}
