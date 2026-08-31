"use client"

import { useState } from "react"
import { Check, ExternalLink, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { faviconUrlForHost } from "@/lib/reference-feed"
import {
  isSuggestedReferenceAdded,
  sortSuggestedReferences,
  SUGGESTED_REFERENCES,
  suggestedReferenceHomeUrl,
  type SuggestedReference,
} from "@/lib/suggested-references"

function CatalogFavicon({ host }: { host: string }) {
  const [failed, setFailed] = useState(false)
  const letter = host.replace(/^www\./i, "").charAt(0).toUpperCase() || "?"
  if (failed) {
    return (
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground"
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
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 rounded-lg bg-muted"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

export function SuggestedReferencesDirectory({
  knownDomains,
  onAdd,
}: {
  knownDomains: readonly string[]
  onAdd: (homeUrl: string, domain: string, label: string) => Promise<boolean>
}) {
  const [pendingHost, setPendingHost] = useState<string | null>(null)
  const items = sortSuggestedReferences(SUGGESTED_REFERENCES, knownDomains)

  const add = async (item: SuggestedReference) => {
    if (pendingHost) return
    setPendingHost(item.host)
    try {
      await onAdd(suggestedReferenceHomeUrl(item.host), item.host, item.label)
    } finally {
      setPendingHost(null)
    }
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => {
        const added = isSuggestedReferenceAdded(item.host, knownDomains)
        const busy = pendingHost === item.host
        const href = suggestedReferenceHomeUrl(item.host)
        return (
          <li
            key={item.host}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex min-w-0 items-start gap-3">
              <CatalogFavicon host={item.host} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold tracking-tight">{item.label}</h3>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  <span className="truncate">{item.host}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </a>
              </div>
            </div>
            {added ? (
              <p className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Ya está en tus fuentes
              </p>
            ) : (
              <Button
                type="button"
                size="sm"
                className="mt-auto w-fit"
                disabled={pendingHost !== null}
                aria-busy={busy}
                onClick={() => void add(item)}
              >
                {busy ? <Spinner className="size-4" /> : <Plus className="h-4 w-4" />}
                Añadir
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
