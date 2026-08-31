"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { BookOpen, ChevronDown, ExternalLink, Map as MapIcon, MoreHorizontal, Plus } from "lucide-react"
import { toast } from "sonner"
import { AddArticleToTripDialog } from "@/components/add-article-to-trip-dialog"
import { AddReferenceDialog } from "@/components/add-reference-dialog"
import { useOpeningTrip } from "@/components/opening-trip"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { Button } from "@/components/ui/button"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/lib/auth-context"
import { SOURCES_HOME_REF } from "@/lib/partner-trip"
import {
  buildAddArticleTripOptions,
  buildFeedListRows,
  capFeedHosts,
  extractionFailureMessage,
  faviconUrlForHost,
  feedHostsFromReferences,
  fetchReferenceFeed,
  formatPublishedAt,
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

const FEED_ACTION_BTN_CLASS = cn(
  "h-8 w-8 rounded-md bg-background/90",
  "opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover/row:opacity-100",
)

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer")
}

function SiteFavicon({ host }: { host: string }) {
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

function SourceFilterLabel({ domain, label }: { domain: string; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <SiteFavicon host={domain} />
      <span className="truncate">{label}</span>
    </span>
  )
}

function FeedRowAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={FEED_ACTION_BTN_CLASS}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

function FeedRowMenu({
  onRead,
  onAdd,
  onCreate,
}: {
  onRead: () => void
  onAdd: () => void
  onCreate: () => void
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted"
          aria-label="Más acciones"
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10.5rem]">
        <DropdownMenuItem onSelect={onRead}>
          Leer
          <BookOpen className="ml-auto" strokeWidth={1.8} aria-hidden />
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAdd}>
          Añadir
          <Plus className="ml-auto" strokeWidth={1.8} aria-hidden />
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCreate}>
          Crear viaje
          <MapIcon className="ml-auto" strokeWidth={1.8} aria-hidden />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ReferenceFeedRow({
  item,
  alreadyIn,
  onRead,
  onAdd,
  onCreate,
}: {
  item: ReferenceFeedItem
  alreadyIn: string | null
  onRead: () => void
  onAdd: () => void
  onCreate: () => void
}) {
  const [broken, setBroken] = useState(false)
  const showImage = Boolean(item.imageUrl) && !broken
  const dateLabel = formatPublishedAt(item.publishedAt)
  const meta = [dateLabel, item.host, item.instant ? "Listo para consolidar" : null]
    .filter(Boolean)
    .join(" · ")

  return (
    <li className="group/row relative">
      <div className="flex w-full items-start gap-3 py-3 pl-3 pr-14 sm:gap-4 sm:pl-4 md:pr-48">
        <div className="relative mt-0.5 h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-14 sm:w-14">
          {showImage ? (
            <img
              src={item.imageUrl ?? ""}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setBroken(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {item.title}
            </a>
          </h3>
          <p className="mt-1 text-[12px] leading-snug tabular-nums text-muted-foreground">
            {meta}
            {alreadyIn ? ` · ${alreadyIn}` : ""}
          </p>
        </div>
      </div>
      <div className="absolute right-2 top-3 sm:right-3">
        <div className="md:hidden">
          <FeedRowMenu onRead={onRead} onAdd={onAdd} onCreate={onCreate} />
        </div>
        <div className="hidden items-center gap-1 md:flex">
          <FeedRowAction label="Leer" onClick={onRead}>
            <BookOpen className="h-3.5 w-3.5" />
          </FeedRowAction>
          <FeedRowAction label="Añadir" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" />
          </FeedRowAction>
          <FeedRowAction label="Crear viaje" onClick={onCreate}>
            <MapIcon className="h-3.5 w-3.5" />
          </FeedRowAction>
        </div>
      </div>
    </li>
  )
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

export function ReferenceFeedPanel() {
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

  const persistFavorite = async (homeUrl: string, domain: string): Promise<boolean> => {
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
        { label: "", url: homeUrl },
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

  const emptyHosts = hostsToFetch.filter((host) => {
    const state = feeds[host]
    return state?.status === "ok" && state.payload.items.length === 0
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
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
              checked={
                allFeedFilterSelected(feedableDomains, selected)
                  ? true
                  : selected.length > 0
                    ? "indeterminate"
                    : false
              }
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
        <Button type="button" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          Añadir fuente
        </Button>
      </div>

      {chips.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">Aún no tienes referencias</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pulsa Añadir fuente y pega la URL de un bloguero o una revista en la que confíes.
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
              const names = tripsWithArticle(trips, sourcesById, item.url)
              const alreadyIn =
                names.length === 1
                  ? `Ya está en ${names[0]}`
                  : names.length > 1
                    ? `Ya está en ${names.length} viajes`
                    : null
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

      <AddReferenceDialog
        open={adding}
        onOpenChange={setAdding}
        knownDomains={chips.map((c) => c.domain)}
        onAddReference={persistFavorite}
        onCreateTrip={createTripFromUrl}
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
