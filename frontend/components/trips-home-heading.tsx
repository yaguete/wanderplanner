"use client"

import { cn } from "@/lib/utils"
import { tripsHomeSubtitle, type TripsHomeSection } from "@/lib/trips-home-view"

const TITLE_CLASS = "text-2xl tracking-tight sm:text-3xl"

export function TripsHomeHeading({
  section,
  directory = false,
  onSectionChange,
}: {
  section: TripsHomeSection
  directory?: boolean
  onSectionChange: (next: TripsHomeSection) => void
}) {
  return (
    <div className="max-w-xl">
      <h1 className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <button
          type="button"
          aria-pressed={section === "trips"}
          onClick={() => onSectionChange("trips")}
          className={cn(
            TITLE_CLASS,
            section === "trips"
              ? "font-semibold text-[hsl(var(--brand-ink))]"
              : "font-light text-muted-foreground",
          )}
        >
          Tus viajes
        </button>
        <button
          type="button"
          aria-pressed={section === "sources"}
          onClick={() => onSectionChange("sources")}
          className={cn(
            TITLE_CLASS,
            section === "sources"
              ? "font-semibold text-[hsl(var(--brand-ink))]"
              : "font-light text-muted-foreground",
          )}
        >
          Tus fuentes
        </button>
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {tripsHomeSubtitle(section, directory)}
      </p>
    </div>
  )
}
