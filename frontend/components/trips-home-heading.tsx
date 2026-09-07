"use client"

import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { tripsHomeSubtitle, type TripsHomeSection } from "@/lib/trips-home-view"

const TITLE_CLASS = "text-2xl tracking-tight sm:text-3xl"

export function TripsHomeHeading({
  section,
  directory = false,
  onSectionChange,
  onLeaveDirectory,
}: {
  section: TripsHomeSection
  directory?: boolean
  onSectionChange: (next: TripsHomeSection) => void
  onLeaveDirectory?: () => void
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
              : "font-light text-[hsl(var(--brand-ink))]",
          )}
        >
          Tus viajes
        </button>
        <button
          type="button"
          aria-pressed={section === "sources"}
          onClick={() => {
            onSectionChange("sources")
            onLeaveDirectory?.()
          }}
          className={cn(
            TITLE_CLASS,
            section === "sources"
              ? "font-semibold text-[hsl(var(--brand-ink))]"
              : "font-light text-[hsl(var(--brand-ink))]",
          )}
        >
          Tus fuentes
        </button>
      </h1>
      {directory && onLeaveDirectory ? (
        <button
          type="button"
          onClick={onLeaveDirectory}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium leading-relaxed text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:mt-6"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Volver a tus fuentes
        </button>
      ) : (
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {tripsHomeSubtitle(section, directory)}
        </p>
      )}
    </div>
  )
}
