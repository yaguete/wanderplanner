"use client"

import { ExternalLink } from "lucide-react"
import { outbound, type OutboundAffiliate, type OutboundSurface } from "@/lib/funnel-analytics"
import { cn } from "@/lib/utils"

export function PartnerSearchLink({
  href,
  label,
  disabledHint,
  className,
  surface = "manual_item",
  affiliate = "own",
}: {
  href: string | null
  label: string
  disabledHint?: string | null
  className?: string
  surface?: OutboundSurface
  affiliate?: OutboundAffiliate
}) {
  if (!href) {
    return disabledHint ? (
      <p className="text-xs text-muted-foreground">{disabledHint}</p>
    ) : null
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={label}
      aria-label={label}
      className={cn(
        "wp-ext-link inline-flex min-h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium",
        className,
      )}
      onClick={() => {
        outbound(href, { surface, affiliate })
      }}
    >
      {label}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  )
}
