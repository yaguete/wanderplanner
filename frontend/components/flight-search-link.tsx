"use client"

import { ExternalLink } from "lucide-react"
import {
  FLIGHT_SEARCH_AFFILIATE_ID,
  type FlightSearchHit,
} from "@/lib/flight-search"
import { outbound, type OutboundSurface } from "@/lib/funnel-analytics"
import { cn } from "@/lib/utils"

export function FlightSearchLink({
  search,
  showCodes = false,
  className,
  surface = "flight_search",
}: {
  search: FlightSearchHit
  showCodes?: boolean
  className?: string
  surface?: OutboundSurface
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
      data-no-drag=""
      draggable={false}
      className={cn(
        "wp-ext-link inline-flex shrink-0 items-center gap-1 text-xs font-medium",
        className,
      )}
      onClick={() => {
        outbound(search.href, {
          surface,
          // Hop Impact propio; el badge UI es otro flag (`FLIGHT_SEARCH_AFFILIATE_ID`).
          affiliate: "own",
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
