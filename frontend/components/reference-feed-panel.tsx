"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { AddArticleToTripDialog } from "@/components/add-article-to-trip-dialog"
import { useOpeningTrip } from "@/components/opening-trip"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/lib/auth-context"
import { domainFromUrl } from "@/lib/db/profile-repo"
import { SOURCES_HOME_REF } from "@/lib/partner-trip"
import {
  buildAddArticleTripOptions,
  capFeedHosts,
  extractionFailureMessage,
  feedHostsFromReferences,
  fetchReferenceFeed,
  formatPublishedAt,
  hostIsFeedable,
  mergeFeedItems,
  readStoredFeedFilter,
  resolveFeedFilter,
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
      <div className="flex w-full flex-col gap-2 py-3 pl-3 pr-3 sm:flex-row sm:items-center sm:gap-4 sm:pl-4 sm:pr-4">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted sm:h-14 sm:w-14">
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
            <h3 className="truncate text-sm font-semibold tracking-tight">{item.title}</h3>
            <p className="mt-1 text-[12px] leading-snug tabular-nums text-muted-foreground">
              {meta}
              {alreadyIn ? ` · ${alreadyIn}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 sm:shrink-0">
          <Button type="button" size="sm" variant="ghost" onClick={onRead}>
            Leer
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onAdd}>
            Añadir
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCreate}>
            Crear viaje
          </Button>
        </div>
      </div>
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
  const [url, setUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [feeds, setFeeds] = useState<Record<string, FeedState>>({})
  const [picking, setPicking] = useState<ReferenceFeedItem | null>(null)
  const [pickerOptions, setPickerOptions] = useState<AddArticleTripOption[]>([])

  useEffect(() => {
    setSelected(resolveFeedFilter(feedableDomains, readStoredFeedFilter()))
    // `feedableKey` es la lista de dominios; no resetear al persistir ids nuevos.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feedableDomains va a la par de feedableKey
  }, [feedableKey])

  const hostsToFetch = useMemo(
    () => capFeedHosts(selected.filter((d) => feedableDomains.includes(d))),
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

  const merged = useMemo(() => {
    const groups = hostsToFetch.flatMap((host) => {
      const state = feeds[host]
      if (!state || state.status !== "ok") return []
      return [{ host, items: state.payload.items }]
    })
    return mergeFeedItems(groups)
  }, [feeds, hostsToFetch])

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
      const next = prev.includes(domain)
        ? prev.filter((d) => d !== domain)
        : [...prev, domain]
      writeStoredFeedFilter(next)
      return next
    })
  }

  const addReference = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const domain = domainFromUrl(withScheme)
    if (domain && chips.some((c) => c.domain === domain)) {
      toast.error("Ya tienes esta referencia")
      return
    }
    setSaving(true)
    const prevSelected = selected
    if (domain && hostIsFeedable(domain)) {
      const nextSelected = selected.includes(domain) ? selected : [...selected, domain]
      writeStoredFeedFilter(nextSelected)
      setSelected(nextSelected)
    }
    const result = await updateProfile({
      favoriteReferences: [
        ...favoriteReferences.map((r) => ({ label: r.label, url: r.url })),
        { label: "", url: withScheme },
      ],
    })
    setSaving(false)
    if (!result.ok) {
      writeStoredFeedFilter(prevSelected)
      setSelected(prevSelected)
      toast.error(result.error)
      return
    }
    setUrl("")
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
    const hasTrip = trips.some((t) => !t.archived)
    if (isGuest && hasTrip && !requireAccount("new-trip")) return
    const params = new URLSearchParams({ source: item.url, ref: SOURCES_HOME_REF })
    router.push(`/start?${params.toString()}`)
  }

  const emptyHosts = hostsToFetch.filter((host) => {
    const state = feeds[host]
    return state?.status === "ok" && state.payload.items.length === 0
  })

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault()
          void addReference()
        }}
      >
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://mibloguerafavorita.com"
          aria-label="URL de una nueva referencia"
          className="sm:max-w-md"
        />
        <Button type="submit" disabled={saving || !url.trim()}>
          {saving ? <Spinner className="size-4" /> : <Plus className="h-4 w-4" />}
          Añadir referencia
        </Button>
      </form>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por referencia">
          {chips.map((chip) => {
            const active = chip.feedable && selected.includes(chip.domain)
            return (
              <button
                key={chip.domain}
                type="button"
                aria-pressed={active}
                disabled={!chip.feedable}
                title={
                  chip.feedable
                    ? undefined
                    : "Esta web no publica una cronología de artículos que podamos listar."
                }
                onClick={() => toggleChip(chip.domain, chip.feedable)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  !chip.feedable
                    ? "cursor-not-allowed border-border text-muted-foreground/70"
                    : active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-foreground/80 hover:bg-muted",
                )}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      ) : null}

      {chips.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">Aún no tienes referencias</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pega la URL de un bloguero o una revista en la que confíes para ver aquí sus últimos
            artículos.
          </p>
        </div>
      ) : selected.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">Elige una referencia</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Activa uno o varios chips para ver sus últimos artículos.
          </p>
        </div>
      ) : loading && merged.length === 0 ? (
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
            {merged.map((item) => {
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
                  onRead={() =>
                    window.open(item.url, "_blank", "noopener,noreferrer")
                  }
                  onAdd={() => openPicker(item)}
                  onCreate={() => createTripFrom(item)}
                />
              )
            })}
          </ul>
        </div>
      )}

      <AddArticleToTripDialog
        open={Boolean(picking)}
        articleTitle={picking?.title ?? ""}
        options={pickerOptions}
        onOpenChange={(open) => {
          if (!open) setPicking(null)
        }}
        onPick={pickTrip}
      />
    </div>
  )
}
