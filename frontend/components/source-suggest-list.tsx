"use client"

import { cn } from "@/lib/utils"
import type { SourceSuggestHit } from "@/lib/source-suggest"

function subtitleDestination(hit: SourceSuggestHit, compact: boolean): string | null {
  if (!hit.destination) return null
  if (compact && hit.origin !== "cache") return null
  return hit.destination
}

export function SourceSuggestList({
  hits,
  onSelect,
  compactSubtitle = false,
  className,
}: {
  hits: SourceSuggestHit[]
  onSelect: (hit: SourceSuggestHit) => void
  /** En el diálogo: oculta snippets de Tavily y clampea la línea. */
  compactSubtitle?: boolean
  className?: string
}) {
  return (
    <>
      <div aria-live="polite" className="sr-only">
        {hits.length === 0 ? "Ningún artículo" : `${hits.length} artículos`}
      </div>
      {hits.length > 0 ? (
        <ul className={cn("flex flex-col gap-1", className)}>
          {hits.map((hit) => {
            const dest = subtitleDestination(hit, compactSubtitle)
            return (
              <li key={hit.url}>
                <button
                  type="button"
                  onClick={() => onSelect(hit)}
                  className="flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-sm font-medium text-foreground">{hit.title}</span>
                  <span
                    className={cn(
                      "mt-0.5 text-xs text-muted-foreground",
                      compactSubtitle && "line-clamp-1",
                    )}
                  >
                    {hit.host}
                    {dest ? ` · ${dest}` : ""}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </>
  )
}
