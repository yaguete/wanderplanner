/**
 * Precedencia de CTAs de reserva en el formulario de ítem: el enlace del
 * autor XOR los buscadores propios. Puro; el diálogo solo pinta.
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
import {
  stayDiscoveryHrefs,
  type StayDiscoveryHrefs,
} from "@/lib/stay-discovery"
import type { ItemType } from "@/types/itinerary"

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

  return { kind: "none" }
}
