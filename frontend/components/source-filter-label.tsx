"use client"

import { useState } from "react"
import { faviconUrlForHost } from "@/lib/reference-feed"
import { cn } from "@/lib/utils"

export function SiteFavicon({ host }: { host: string }) {
  const [failed, setFailed] = useState(false)
  const letter = host.replace(/^www\./i, "").charAt(0).toUpperCase() || "?"
  if (failed) {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] font-medium text-muted-foreground"
        aria-hidden
      >
        {letter}
      </span>
    )
  }
  return (
    <img
      src={faviconUrlForHost(host)}
      alt=""
      width={16}
      height={16}
      className="h-4 w-4 shrink-0 rounded-sm"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

export function SourceFilterLabel({
  domain,
  label,
  className,
}: {
  domain: string
  label: string
  className?: string
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <SiteFavicon host={domain} />
      <span className="truncate">{label}</span>
    </span>
  )
}
