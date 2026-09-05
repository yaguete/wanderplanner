"use client"

import { createElement } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PartnerSearchLink } from "@/components/partner-search-link"
import { bookingOmitsStayDates } from "@/lib/booking-dates"
import { itemDiscoveryLinks } from "@/lib/item-discovery-links"
import { ITEM_COLORS, ITEM_LABELS, ITEM_TYPE_ICONS } from "@/lib/item-styles"
import { formatItemPlaceCaption, splitStayPlace } from "@/lib/stay-discovery"
import { cn } from "@/lib/utils"
import type { ItemType, UserDayItem } from "@/types/itinerary"

export function ReserveSearchDialog({
  open,
  onOpenChange,
  title,
  type,
  sourceId,
  item,
  startDate,
  dayIndexes,
  nights,
  currency,
  numTravelers,
  countryCodes,
  extraHints,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  type: Extract<ItemType, "stay" | "activity" | "food">
  sourceId?: string | null
  item?: UserDayItem | null
  startDate: string | null
  dayIndexes: number[]
  nights?: number
  currency: string
  numTravelers: number | null
  countryCodes?: readonly string[] | null
  extraHints?: readonly (string | null | undefined)[]
}) {
  const placeCaption = formatItemPlaceCaption({
    region: item?.region,
    countryCodes,
    extraHints,
  })
  const { city } = splitStayPlace(item?.region)
  const destination = city || item?.region?.trim() || title
  const spanDays = Math.max(
    1,
    type === "stay" ? (nights ?? dayIndexes.length) : dayIndexes.length,
  )
  const dayIndex = dayIndexes[0] ?? 0
  const discovery = itemDiscoveryLinks({
    type,
    affiliateUrl: null,
    sourceId,
    destination,
    selectedPlaceLabel: city || destination,
    destinationHint: destination,
    addressHint: item?.region ?? null,
    coords: item?.coords ?? null,
    startDate,
    dayIndexes,
    dayIndex,
    spanDays,
    currency,
    numTravelers: numTravelers ?? 1,
    allowFromSource: true,
  })
  const ownStay = discovery.kind === "own" ? discovery.stay : undefined
  const ownActivity = discovery.kind === "own" ? discovery.activity : undefined
  const hasStayLinks = Boolean(
    ownStay && (ownStay.booking || ownStay.airbnb || ownStay.homeExchange),
  )
  const hasActivityLinks = Boolean(
    ownActivity && (ownActivity.civitatis || ownActivity.getYourGuide),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" hideClose>
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 text-lg font-semibold leading-snug tracking-tight">
            {createElement(ITEM_TYPE_ICONS[type], {
              className: cn("mt-0.5 h-5 w-5 shrink-0", ITEM_COLORS[type].text),
              "aria-hidden": true,
            })}
            <span>
              <span className="sr-only">{ITEM_LABELS[type]}. </span>
              {title}
            </span>
          </DialogTitle>
          <DialogDescription className={placeCaption ? undefined : "sr-only"}>
            {placeCaption || ITEM_LABELS[type]}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {discovery.kind === "own" && ownStay ? (
            hasStayLinks ? (
              <div className="flex flex-wrap items-center gap-2">
                <PartnerSearchLink
                  href={ownStay.booking}
                  label="Buscar en Booking"
                  surface="task_row"
                />
                <PartnerSearchLink
                  href={ownStay.airbnb}
                  label="Buscar en Airbnb"
                  affiliate="none"
                  surface="task_row"
                />
                <PartnerSearchLink
                  href={ownStay.homeExchange}
                  label="Buscar en HomeExchange"
                  affiliate="none"
                  surface="task_row"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{discovery.hint}</p>
            )
          ) : discovery.kind === "own" && ownActivity ? (
            hasActivityLinks ? (
              <div className="flex flex-wrap items-center gap-2">
                <PartnerSearchLink
                  href={ownActivity.civitatis}
                  label="Buscar en Civitatis"
                  surface="task_row"
                />
                <PartnerSearchLink
                  href={ownActivity.getYourGuide}
                  label="Buscar en GetYourGuide"
                  surface="task_row"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{discovery.hint}</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay un buscador para este ítem.
            </p>
          )}
          {hasStayLinks && bookingOmitsStayDates(startDate, dayIndexes) ? (
            <p className="text-[11px] text-muted-foreground">
              Sin fechas en el viaje, o con el check-in ya pasado, los
              buscadores abren el destino sin fechas.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
