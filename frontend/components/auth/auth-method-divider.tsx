"use client"

import { cn } from "@/lib/utils"

export function AuthMethodDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)} role="separator">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">o</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
