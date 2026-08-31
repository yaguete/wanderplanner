"use client"

import { useEffect, useId, useRef, useState } from "react"
import { DestinationSearchField } from "@/components/destination-search-field"
import { ReferenceFeedRow } from "@/components/reference-feed-row"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { isMobileViewport } from "@/hooks/use-mobile"
import {
  searchReferenceSources,
  type ReferenceFeedItem,
} from "@/lib/reference-feed"
import { sanitizeSuggestQuery } from "@/lib/trip-source-suggestions"

export function SearchReferenceDestinationDialog({
  open,
  onOpenChange,
  domains,
  alreadyInFor,
  onRead,
  onAdd,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  domains: readonly string[]
  alreadyInFor: (item: ReferenceFeedItem) => string | null
  onRead: (item: ReferenceFeedItem) => void
  onAdd: (item: ReferenceFeedItem) => void
  onCreate: (item: ReferenceFeedItem) => void
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hits, setHits] = useState<ReferenceFeedItem[] | null>(null)

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      setValue("")
      setError(null)
      setLoading(false)
      setHits(null)
      return
    }
    if (isMobileViewport()) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const runSearch = () => {
    const query = sanitizeSuggestQuery(value)
    if (!query) {
      setError("Escribe al menos 3 letras del destino.")
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    void searchReferenceSources(query, domains, controller.signal)
      .then((results) => {
        if (controller.signal.aborted) return
        setHits(results)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        if (controller.signal.aborted) return
        setHits([])
        setError(
          err instanceof Error && err.message
            ? err.message
            : "No hemos podido buscar artículos. Inténtalo de nuevo.",
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
  }

  const onChange = (next: string) => {
    setValue(next)
    if (error) setError(null)
    if (next.trim() !== "") return
    abortRef.current?.abort()
    setHits(null)
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullscreenOnMobile
        hideClose
        className="sm:max-w-2xl"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-4 px-6 pb-4 pt-6">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight">
                Buscar destino
              </DialogTitle>
              <DialogDescription>
                Busca un destino en todas las webs que sigues, aunque no estén
                marcadas en Fuentes.
              </DialogDescription>
            </DialogHeader>
            <div>
              <DestinationSearchField
                id={`${id}-dest`}
                value={value}
                loading={loading}
                inputRef={inputRef}
                onChange={onChange}
                onSubmit={runSearch}
              />
              {error ? (
                <p className="mt-2 text-xs text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
            {loading && hits == null ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">Buscando artículos…</p>
            ) : null}
            {hits && hits.length === 0 && !error && !loading ? (
              <p className="px-1 text-sm text-muted-foreground">
                No hemos encontrado artículos para ese destino en tus fuentes.
              </p>
            ) : null}
            {hits && hits.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-border">
                <ul className="divide-y divide-border">
                  {hits.map((item) => (
                    <ReferenceFeedRow
                      key={item.url}
                      item={item}
                      alreadyIn={alreadyInFor(item)}
                      actionsAlwaysVisible
                      onRead={() => onRead(item)}
                      onAdd={() => onAdd(item)}
                      onCreate={() => onCreate(item)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter className="shrink-0 bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
