"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ChevronDown, ExternalLink, Lightbulb, Minus, Plus } from "lucide-react"
import { toast } from "sonner"
import { AddArticleToTripDialog } from "@/components/add-article-to-trip-dialog"
import { AddReferenceDialog } from "@/components/add-reference-dialog"
import { RemoveReferenceDialog } from "@/components/remove-reference-dialog"
import { useOpeningTrip } from "@/components/opening-trip"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { ReferenceFeedRow } from "@/components/reference-feed-row"
import { SourceFilterLabel } from "@/components/source-filter-label"
import { SuggestedReferencesDirectory } from "@/components/suggested-references-directory"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/auth-context"
import { SOURCES_HOME_REF } from "@/lib/partner-trip"
import {
  buildAddArticleTripOptions,
  buildFeedListRows,
  capFeedHosts,
  extractionFailureMessage,
  favoriteInputsWithoutHost,
  feedHostsFromReferences,
  fetchReferenceFeed,
  hostIsFeedable,
  allFeedFilterSelected,
  readStoredFeedFilter,
  resolveFeedFilter,
  toggleAllFeedFilter,
  toggleOneFeedFilter,
  tripsWithArticle,
  writeStoredFeedFilter,
  type AddArticleTripOption,
  type ReferenceFeedItem,
  type ReferenceFeedResponse,
} from "@/lib/reference-feed"
import { useTrips } from "@/lib/trip-context"
import { cn } from "@/lib/utils"

type FeedState =
  | { status: "loading" }
  | { status: "ok"; payload: ReferenceFeedResponse }

const GHOST_TOOLBAR_BTN = cn(
  "inline-flex h-10 w-10 items-center justify-center rounded-md",
  "text-muted-foreground transition-colors",
  "hover:bg-sidebar-accent hover:text-foreground",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:pointer-events-none disabled:opacity-40",
)

function FeedToolbarIconButton({
  label,
  tooltip,
  disabled,
  onClick,
  children,
}: {
  label: string
  tooltip?: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const button = (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={GHOST_TOOLBAR_BTN}
    >
      {children}
    </button>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? <span className="inline-flex">{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip ?? label}</TooltipContent>
    </Tooltip>
  )
}

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer")
}

function FeedMoreRow({ label, href }: { label: string; href: string }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground sm:px-4"
      >
        <span>Ver más de {label}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </a>
    </li>
  )
}

export function ReferenceFeedPanel({
  directory,
  onDirectoryChange,
}: {
  directory: boolean
  onDirectoryChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { favoriteReferences, updateProfile, isGuest } = useAuth()
  const { trips, sources, startSourceExtraction, pendingSources } = useTrips()
  const { beginOpenTrip } = useOpeningTrip()
  const { requireAccount } = useRegistrationGate()

  const chips = useMemo(
    () => feedHostsFromReferences(favoriteReferences),
    [favoriteReferences],
  )
  const feedableDomains = useMemo(
    () => chips.filter((c) => c.feedable).map((c) => c.domain),
    [chips],
  )
  const feedableKey = feedableDomains.join(",")

  const [selected, setSelected] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const [feeds, setFeeds] = useState<Record<string, FeedState>>({})
  const [picking, setPicking] = useState<ReferenceFeedItem | null>(null)
  const [pickerOptions, setPickerOptions] = useState<AddArticleTripOption[]>([])
  const [creating, setCreating] = useState<ReferenceFeedItem | null>(null)

  useEffect(() => {
    setSelected(resolveFeedFilter(feedableDomains, readStoredFeedFilter()))
    // `feedableKey` es la lista de dominios; no resetear al persistir ids nuevos.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feedableDomains va a la par de feedableKey
  }, [feedableKey])

  const hostsToFetch = useMemo(
    () => capFeedHosts(feedableDomains.filter((d) => selected.includes(d))),
    [selected, feedableDomains],
  )
  const fetchKey = hostsToFetch.join(",")

  useEffect(() => {
    if (!fetchKey) return
    let cancelled = false
    for (const host of hostsToFetch) {
      void fetchReferenceFeed(host).then((payload) => {
        if (cancelled) return
        setFeeds((prev) => ({ ...prev, [host]: { status: "ok", payload } }))
      })
    }
    return () => {
      cancelled = true
    }
  }, [fetchKey, hostsToFetch])

  const sourcesById = useMemo(() => {
    const map = new Map(sources.map((s) => [s.id, s]))
    return map
  }, [sources])

  const listRows = useMemo(() => {
    const groups = hostsToFetch.flatMap((host) => {
      const state = feeds[host]
      if (!state || state.status !== "ok") return []
      return [
        {
          host,
          label: chips.find((c) => c.domain === host)?.label || host,
          items: state.payload.items,
        },
      ]
    })
    return buildFeedListRows(groups)
  }, [feeds, hostsToFetch, chips])

  const loading = hostsToFetch.some((host) => feeds[host]?.status !== "ok")
  const allEmpty =
    !loading &&
    hostsToFetch.length > 0 &&
    hostsToFetch.every((host) => {
      const state = feeds[host]
      return state?.status === "ok" && state.payload.items.length === 0
    })

  const toggleChip = (domain: string, feedable: boolean) => {
    if (!feedable) return
    setSelected((prev) => {
      const next = toggleOneFeedFilter(prev, domain)
      writeStoredFeedFilter(next)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => {
      const next = toggleAllFeedFilter(feedableDomains, prev)
      writeStoredFeedFilter(next)
      return next
    })
  }

  const persistFavorite = async (
    homeUrl: string,
    domain: string,
    label = "",
  ): Promise<boolean> => {
    if (chips.some((c) => c.domain === domain)) {
      toast.error("Esa fuente ya está añadida.")
      return false
    }
    const prevSelected = selected
    if (hostIsFeedable(domain)) {
      const nextSelected = selected.includes(domain) ? selected : [...selected, domain]
      writeStoredFeedFilter(nextSelected)
      setSelected(nextSelected)
    }
    const result = await updateProfile({
      favoriteReferences: [
        ...favoriteReferences.map((r) => ({ label: r.label, url: r.url })),
        { label: label.trim(), url: homeUrl },
      ],
    })
    if (!result.ok) {
      writeStoredFeedFilter(prevSelected)
      setSelected(prevSelected)
      toast.error(result.error)
      return false
    }
    return true
  }

  const removeFavorite = async (domain: string) => {
    if (pendingRemove) return
    setPendingRemove(domain)
    const prevSelected = selected
    const nextSelected = selected.filter((d) => d !== domain)
    writeStoredFeedFilter(nextSelected)
    setSelected(nextSelected)
    const remaining = chips.filter((c) => c.domain !== domain)
    const result = await updateProfile({
      favoriteReferences: favoriteInputsWithoutHost(favoriteReferences, domain),
    })
    setPendingRemove(null)
    if (!result.ok) {
      writeStoredFeedFilter(prevSelected)
      setSelected(prevSelected)
      toast.error(result.error)
      return
    }
    setFeeds((prev) => {
      if (!(domain in prev)) return prev
      const next = { ...prev }
      delete next[domain]
      return next
    })
    if (remaining.length === 0) setRemoving(false)
  }

  const createTripFromUrl = (articleUrl: string) => {
    const hasTrip = trips.some((t) => !t.archived)
    if (isGuest && hasTrip && !requireAccount("new-trip")) return
    setAdding(false)
    const params = new URLSearchParams({ source: articleUrl, ref: SOURCES_HOME_REF })
    router.push(`/start?${params.toString()}`)
  }

  const openPicker = (item: ReferenceFeedItem) => {
    const loadingIds = new Set(
      pendingSources.filter((p) => p.status === "loading").map((p) => p.tripId),
    )
    setPickerOptions(buildAddArticleTripOptions(trips, sources, loadingIds, item.url))
    setPicking(item)
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

  const createTripFrom = (item: ReferenceFeedItem) => {
    createTripFromUrl(item.url)
  }

  const alreadyInFor = (item: ReferenceFeedItem) => {
    const names = tripsWithArticle(trips, sourcesById, item.url)
    if (names.length === 1) return `Ya está en ${names[0]}`
    if (names.length > 1) return `Ya está en ${names.length} viajes`
    return null
  }

  const emptyHosts = hostsToFetch.filter((host) => {
    const state = feeds[host]
    return state?.status === "ok" && state.payload.items.length === 0
  })

  return (
    <div className="flex flex-col gap-5">
      {directory ? (
        <>
          <button
            type="button"
            onClick={() => onDirectoryChange(false)}
            className="inline-flex h-10 w-fit items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            Volver a tus fuentes
          </button>
          <SuggestedReferencesDirectory
            knownDomains={chips.map((c) => c.domain)}
            onAdd={persistFavorite}
            onRemove={(domain) => removeFavorite(domain)}
          />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {chips.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={
                      feedableDomains.length > 0 &&
                      selected.length !== feedableDomains.length
                        ? `Fuentes, ${selected.length} de ${feedableDomains.length}`
                        : "Fuentes"
                    }
                    className="w-fit"
                  >
                    Fuentes
                    {feedableDomains.length > 0 &&
                    selected.length !== feedableDomains.length ? (
                      <span className="text-muted-foreground">
                        ({selected.length})
                      </span>
                    ) : null}
                    <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[14rem]">
                  <DropdownMenuCheckboxItem
                    checked={allFeedFilterSelected(feedableDomains, selected)}
                    onCheckedChange={toggleAll}
                    onSelect={(e) => e.preventDefault()}
                    className="cursor-pointer"
                  >
                    Mostrar todas
                  </DropdownMenuCheckboxItem>
                  {chips.length > 0 ? <DropdownMenuSeparator /> : null}
                  {chips.map((chip) =>
                    chip.feedable ? (
                      <DropdownMenuCheckboxItem
                        key={chip.domain}
                        checked={selected.includes(chip.domain)}
                        onCheckedChange={() => toggleChip(chip.domain, true)}
                        onSelect={(e) => e.preventDefault()}
                        className="cursor-pointer"
                      >
                        <SourceFilterLabel domain={chip.domain} label={chip.label} />
                      </DropdownMenuCheckboxItem>
                    ) : (
                      <DropdownMenuItem
                        key={chip.domain}
                        disabled
                        title="Esta web no publica una cronología de artículos que podamos listar."
                      >
                        <SourceFilterLabel domain={chip.domain} label={chip.label} />
                      </DropdownMenuItem>
                    ),
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <div className="ml-auto flex items-center">
              <FeedToolbarIconButton label="Añadir fuente" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </FeedToolbarIconButton>
              <FeedToolbarIconButton
                label="Eliminar fuente"
                disabled={chips.length === 0}
                onClick={() => setRemoving(true)}
              >
                <Minus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </FeedToolbarIconButton>
              <FeedToolbarIconButton
                label="Sugerencias"
                tooltip="Encuentra inspiración"
                onClick={() => onDirectoryChange(true)}
              >
                <Lightbulb className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </FeedToolbarIconButton>
            </div>
          </div>

          {chips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
              <p className="text-sm font-medium text-foreground">Aún no tienes referencias</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pulsa Añadir fuente o abre Sugerencias para seguir blogs en los que confíes.
              </p>
            </div>
          ) : selected.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
              <p className="text-sm font-medium text-foreground">Elige una referencia</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Activa una o varias fuentes en el menú Fuentes para ver sus últimos artículos.
              </p>
            </div>
          ) : loading && listRows.length === 0 ? (
            <div className="flex justify-center rounded-xl border border-dashed border-border px-6 py-14">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : allEmpty ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
              <p className="text-sm font-medium text-foreground">Sin artículos recientes</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No hemos encontrado posts recientes en{" "}
                {emptyHosts.map((h) => chips.find((c) => c.domain === h)?.label || h).join(", ")}.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <ul className="divide-y divide-border">
                {listRows.map((row) => {
                  if (row.type === "more") {
                    return <FeedMoreRow key={`more:${row.host}`} label={row.label} href={row.href} />
                  }
                  const item = row.item
                  const alreadyIn = alreadyInFor(item)
                  return (
                    <ReferenceFeedRow
                      key={item.url}
                      item={item}
                      alreadyIn={alreadyIn}
                      onRead={() => openExternal(item.url)}
                      onAdd={() => openPicker(item)}
                      onCreate={() => setCreating(item)}
                    />
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}

      <AddReferenceDialog
        open={adding}
        onOpenChange={setAdding}
        knownDomains={chips.map((c) => c.domain)}
        onAddReference={persistFavorite}
        onCreateTrip={createTripFromUrl}
      />

      <RemoveReferenceDialog
        open={removing}
        items={chips}
        pendingDomain={pendingRemove}
        onOpenChange={(open) => {
          if (!open && pendingRemove) return
          setRemoving(open)
        }}
        onRemove={(domain) => void removeFavorite(domain)}
      />

      <AddArticleToTripDialog
        open={Boolean(picking)}
        articleTitle={picking?.title ?? ""}
        options={pickerOptions}
        onOpenChange={(open) => {
          if (!open) setPicking(null)
        }}
        onPick={pickTrip}
      />

      <Dialog open={Boolean(creating)} onOpenChange={(open) => !open && setCreating(null)}>
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
                createTripFrom(item)
              }}
            >
              Crear viaje
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
