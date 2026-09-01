"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { faviconUrlForHost, type FeedHostChip } from "@/lib/reference-feed"

function RowMark({ host }: { host: string }) {
  const [failed, setFailed] = useState(false)
  const letter = host.replace(/^www\./i, "").charAt(0).toUpperCase() || "?"
  if (failed) {
    return (
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-medium text-muted-foreground"
        aria-hidden
      >
        {letter}
      </span>
    )
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
      <img
        src={faviconUrlForHost(host, 64)}
        alt=""
        width={16}
        height={16}
        className="h-4 w-4"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

export function RemoveReferenceDialog({
  open,
  items,
  pendingDomain,
  onOpenChange,
  onRemove,
}: {
  open: boolean
  items: readonly FeedHostChip[]
  pendingDomain: string | null
  onOpenChange: (open: boolean) => void
  onRemove: (domain: string) => void
}) {
  const busy = pendingDomain !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullscreenOnMobile
        hideClose
        className="sm:max-w-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-1.5 px-6 pb-4 pt-6">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight">
                Dejar de seguir
              </DialogTitle>
              <DialogDescription>
                Dejarás de ver sus artículos en Tus fuentes. Los viajes que ya los usan no se
                tocan.
              </DialogDescription>
            </DialogHeader>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
            {items.map((item) => {
              const pending = pendingDomain === item.domain
              return (
                <li
                  key={item.domain}
                  className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
                >
                  <RowMark host={item.domain} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-snug">{item.label}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{item.domain}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground"
                    disabled={busy}
                    aria-busy={pending}
                    aria-label={`Eliminar ${item.label}`}
                    onClick={() => onRemove(item.domain)}
                  >
                    {pending ? (
                      <Spinner className="size-4" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </li>
              )
            })}
          </ul>
          <DialogFooter className="shrink-0 bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cerrar
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
