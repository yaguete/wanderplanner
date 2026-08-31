"use client"

import { FlightSearchLink } from "@/components/flight-search-link"
import { resolveAirportCode } from "@/lib/airports"
import { flightSearchHrefForItem } from "@/lib/flight-search"
import type { RouteLeg, RouteMode, RoutePlace, Trip, UserDay } from "@/types/itinerary"

export function ManualFlightSearch({
  from,
  to,
  mode,
  trip,
  dayIndex,
  days,
  leg,
}: {
  from: RoutePlace | null
  to: RoutePlace | null
  mode: RouteMode | null
  trip: Pick<Trip, "startDate" | "numDays" | "numTravelers">
  dayIndex: number
  days: UserDay[]
  /** `undefined` = no tratar como ida (evita inventar vuelta en «Solo ida»). */
  leg?: RouteLeg
}) {
  if (mode !== "flight") return null

  if (!from || !to) {
    return (
      <p className="text-xs text-muted-foreground">
        Elige origen y destino del desplegable.
      </p>
    )
  }

  const search = flightSearchHrefForItem({
    route: { from, to, mode: "flight", ...(leg ? { leg } : {}) },
    dayIndex,
    trip,
    days,
  })
  if (search) {
    return <FlightSearchLink search={search} surface="manual_item" />
  }

  const missingLabel = !resolveAirportCode(from) ? from.label : to.label
  return (
    <p className="text-xs text-muted-foreground">
      No encontramos aeropuerto cerca de {missingLabel}.
    </p>
  )
}
