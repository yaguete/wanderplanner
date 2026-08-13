"use client"

import { track } from "@vercel/analytics"
import { ExternalLink } from "lucide-react"
import {
  FLIGHT_SEARCH_AFFILIATE_ID,
  FLIGHT_SEARCH_PROVIDER,
  type FlightSearchHit,
} from "@/lib/flight-search"
import { cn } from "@/lib/utils"

export function FlightSearchLink({
  search,
  showCodes = false,
  className,
}: {
  search: FlightSearchHit
  showCodes?: boolean
  className?: string
}) {
  const label = `Buscar vuelos ${search.from} → ${search.to}`
  const affiliated = Boolean(FLIGHT_SEARCH_AFFILIATE_ID)

  return (
    <a
      href={search.href}
      target="_blank"
      rel="noreferrer noopener"
      title={label}
      aria-label={label}
      className={cn(
        "wp-ext-link inline-flex shrink-0 items-center gap-1 text-xs font-medium",
        className,
      )}
      onClick={() => {
        track("flight_search_click", {
          provider: FLIGHT_SEARCH_PROVIDER.id,
          roundTrip: search.roundTrip,
        })
      }}
    >
      {showCodes ? `Buscar vuelos ${search.from} → ${search.to}` : "Buscar vuelos"}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
      {affiliated ? (
        <span className="font-normal text-muted-foreground">afiliado</span>
      ) : null}
    </a>
  )
}
