"use client"

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Binoculars } from "lucide-react"
import { toast } from "sonner"
import { AddArticleToTripDialog } from "@/components/add-article-to-trip-dialog"
import { DestinationSearchField } from "@/components/destination-search-field"
import { useOpeningTrip } from "@/components/opening-trip"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { ReferenceFeedRow } from "@/components/reference-feed-row"
import { SourceFilterLabel } from "@/components/source-filter-label"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth-context"
import { SOURCES_HOME_REF } from "@/lib/partner-trip"
import {
  buildAddArticleTripOptions,
  capFeedHosts,
  extractionFailureMessage,
  feedHostsFromReferences,
  searchReferenceSources,
  tripsWithArticle,
  type FeedHostChip,
  type ReferenceFeedItem,
} from "@/lib/reference-feed"
import { useTrips } from "@/lib/trip-context"
import { sanitizeSuggestQuery } from "@/lib/trip-source-suggestions"
import { cn } from "@/lib/utils"
import { isMobileViewport } from "@/hooks/use-mobile"

function SearchScopeHint({
  sources,
  className,
}: {
  sources: readonly FeedHostChip[]
  className?: string
}) {
  if (sources.length === 0) return null
  return (
    <p
      aria-label={`Fuentes: ${sources.map((s) => s.label).join(", ")}`}
      className={cn("text-pretty text-xs leading-5 text-foreground/50", className)}
    >
      {sources.map((source, index) => (
        <Fragment key={source.domain}>
          {index > 0 ? " · " : null}
          <SourceFilterLabel
            domain={source.domain}
            label={source.label}
            className="inline-flex max-w-[12rem] gap-1.5 align-middle text-foreground/70"
          />
        </Fragment>
      ))}
    </p>
  )
}

export function SearchReferenceDestinationDialog({
  open,
  onOpenChange,
  sources,
  alreadyInFor,
  onRead,
  onAdd,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sources: readonly FeedHostChip[]
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
  const searched = useMemo(() => {
    const allow = new Set(capFeedHosts(sources.map((s) => s.domain)))
    return sources.filter((s) => allow.has(s.domain))
  }, [sources])
  const results = hits && hits.length > 0 ? hits : null
  const hint = (
    <SearchScopeHint sources={searched} className={results ? "mt-3" : "mt-2.5"} />
  )

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
    void searchReferenceSources(
      query,
      searched.map((s) => s.domain),
      controller.signal,
    )
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
                Encuentra tu siguiente destino
              </DialogTitle>
              <DialogDescription>
                Búscalo en las fuentes que sigues.
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
              {results ? null : hint}
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
            {results ? (
              <>
                <div className="overflow-hidden rounded-xl border border-border">
                  <ul className="divide-y divide-border">
                    {results.map((item) => (
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
                {hint}
              </>
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

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer")
}

export function SearchReferenceDestinationButton() {
  const router = useRouter()
  const { favoriteReferences, isGuest } = useAuth()
  const { trips, sources, startSourceExtraction, pendingSources } = useTrips()
  const { beginOpenTrip } = useOpeningTrip()
  const { requireAccount } = useRegistrationGate()
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState<ReferenceFeedItem | null>(null)
  const [creating, setCreating] = useState<ReferenceFeedItem | null>(null)

  const feedable = useMemo(
    () => feedHostsFromReferences(favoriteReferences).filter((chip) => chip.feedable),
    [favoriteReferences],
  )
  const sourcesById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources])
  const pickerOptions = useMemo(() => {
    if (!picking) return []
    const loadingIds = new Set(
      pendingSources.filter((p) => p.status === "loading").map((p) => p.tripId),
    )
    return buildAddArticleTripOptions(trips, sources, loadingIds, picking.url)
  }, [picking, pendingSources, trips, sources])

  const alreadyInFor = (item: ReferenceFeedItem) => {
    const names = tripsWithArticle(trips, sourcesById, item.url)
    if (names.length === 1) return `Ya está en ${names[0]}`
    if (names.length > 1) return `Ya está en ${names.length} viajes`
    return null
  }

  const createTripFromUrl = (articleUrl: string) => {
    const hasTrip = trips.some((t) => !t.archived)
    if (isGuest && hasTrip && !requireAccount("new-trip")) return
    const params = new URLSearchParams({ source: articleUrl, ref: SOURCES_HOME_REF })
    router.push(`/start?${params.toString()}`)
  }

  const pickTrip = (tripId: string) => {
    if (!picking) return
    const trip = trips.find((t) => t.id === tripId)
    if (!trip) return
    if (isGuest && trip.sourceIds.length > 0 && !requireAccount("second-source")) return
    const result = startSourceExtraction(tripId, picking.url)
    if (!result.ok) {
      toast.error(extractionFailureMessage(result.reason))
      return
    }
    setPicking(null)
    beginOpenTrip({ id: trip.id, name: trip.name })
    router.push(`/trips/${trip.id}`)
  }

  if (feedable.length === 0) return null

  return (
    <>
      <button
        type="button"
        aria-label="Buscar destino"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md",
          "text-muted-foreground transition-colors",
          "hover:bg-sidebar-accent hover:text-foreground",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "md:w-auto md:gap-1.5 md:px-2.5",
        )}
      >
        <Binoculars className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
        <span className="hidden text-xs font-medium md:inline">Buscar destino</span>
      </button>

      <SearchReferenceDestinationDialog
        open={open}
        onOpenChange={setOpen}
        sources={feedable}
        alreadyInFor={alreadyInFor}
        onRead={(item) => openExternal(item.url)}
        onAdd={(item) => {
          setOpen(false)
          window.setTimeout(() => setPicking(item), 200)
        }}
        onCreate={(item) => {
          setOpen(false)
          window.setTimeout(() => setCreating(item), 200)
        }}
      />

      <AddArticleToTripDialog
        open={Boolean(picking)}
        articleTitle={picking?.title ?? ""}
        options={pickerOptions}
        onOpenChange={(openPicker) => {
          if (!openPicker) setPicking(null)
        }}
        onPick={pickTrip}
      />

      <Dialog open={Boolean(creating)} onOpenChange={(next) => !next && setCreating(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear viaje</DialogTitle>
            <DialogDescription>
              ¿Quieres crear un nuevo viaje a partir de «{creating?.title}»?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreating(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!creating) return
                const item = creating
                setCreating(null)
                createTripFromUrl(item.url)
              }}
            >
              Crear viaje
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
