'use client'

import type { Reference } from "@/types/itinerary"
import { Globe } from "lucide-react"

interface ReferenceCardProps {
  reference: Reference
}

export default function ReferenceCard({ reference }: ReferenceCardProps) {
  const hostname = (() => {
    try {
      return new URL(reference.url).hostname.replace("www.", "")
    } catch {
      return reference.url
    }
  })()

  return (
    <div className="w-44 h-52 rounded-lg border bg-card overflow-hidden flex flex-col">
      <div className="h-24 bg-muted flex items-center justify-center overflow-hidden">
        {reference.ogImage ? (
          <img
            src={reference.ogImage}
            alt={reference.destination}
            className="w-full h-full object-cover"
          />
        ) : (
          <Globe className="h-8 w-8 text-muted-foreground/50" />
        )}
      </div>
      <div className="flex-1 p-3 flex flex-col gap-1">
        <span className="text-sm font-medium truncate">{reference.destination}</span>
        <span className="text-xs text-muted-foreground">{reference.totalDays} days</span>
        <span className="text-xs text-muted-foreground truncate mt-auto">{hostname}</span>
      </div>
    </div>
  )
}
