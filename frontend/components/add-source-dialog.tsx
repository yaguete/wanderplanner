"use client"

/**
 * Flujo «Añadir fuente»: URL + buscador de destino (si el viaje aún no tiene)
 * o sugerencias «Sugeridas para …» cuando ya conocemos el destino.
 * La extracción vive en trip-context (`startSourceExtraction`); el progreso/error
 * se muestran como chip pendiente en InspirationPanel.
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react"
import { track } from "@vercel/analytics"
import { AlertCircle, RefreshCw } from "lucide-react"
import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DestinationSearchField } from "@/components/destination-search-field"
import { SourceSuggestList } from "@/components/source-suggest-list"
import { useTripSourceSuggestions } from "@/hooks/use-trip-source-suggestions"
import { isMobileViewport } from "@/hooks/use-mobile"
import type { ItineraryProgressStage } from "@/lib/api"
import {
  EXTRACTION_PROVIDER_BUSY,
  looksLikeProviderDump,
} from "@/lib/extraction-errors"
import {
  buildQuipDecks,
  msUntilNextQuip,
  quipAt,
  quipTickAt,
  rememberQuips,
  readSeenQuips,
} from "@/lib/extraction-quips"
import { isSourceSuggestEnabled, type SourceSuggestHit } from "@/lib/source-suggest"
import {
  fetchTripSourceSuggestions,
  filterUnusedHits,
  foldSuggestText,
  sanitizeSuggestQuery,
  TRIP_SOURCE_SUGGEST_MOBILE_MAX,
} from "@/lib/trip-source-suggestions"
import { MAX_SOURCES_PER_TRIP } from "@/lib/trip-sources"
import { unsupportedSourceUrlMessage } from "@/lib/instagram-url"
import type { Source, Trip } from "@/types/itinerary"

export function validateSourceUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return "Pega la URL del artículo o del post."
  if (!/^https?:\/\//i.test(trimmed)) {
    return "La URL debe empezar por http:// o https://."
  }
  try {
    // eslint-disable-next-line no-new
    new URL(trimmed)
  } catch {
    return "La URL no es válida."
  }
  return unsupportedSourceUrlMessage(trimmed)
}

/**
 * Frase de la ardilla para la espera. La baraja se sortea una vez por intento
 * (`startedAt`) y esquiva lo visto en extracciones recientes, para que nadie
 * pueda anticipar cuál viene ahora. El temporizador se reprograma frase a
 * frase porque la cadencia no es constante: ver `extraction-quips.ts`.
 */
function useSquirrelQuip(startedAt: number, stage: ItineraryProgressStage | null) {
  const decks = useMemo(() => {
    // `startedAt` no se usa dentro: está en las deps porque es justo lo que
    // queremos que rebaraje (cada extracción y cada reintento son un sorteo
    // nuevo). El barajado es Math.random a propósito, no una semilla derivada:
    // si el orden se pudiera deducir, se podría anticipar la frase siguiente.
    void startedAt
    return buildQuipDecks({ rng: Math.random, avoid: readSeenQuips() })
  }, [startedAt])
  // Arranca en 0 (= sin frase) para que el primer render coincida con el del
  // servidor; el efecto pone el tiempo real, que puede venir de lejos si el
  // usuario se fue a Mi viaje y ha vuelto.
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const step = () => {
      if (cancelled) return
      const now = Date.now() - startedAt
      setElapsed(now)
      timer = setTimeout(step, Math.max(250, msUntilNextQuip(now)))
    }
    step()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [startedAt])

  const quip = quipAt(decks, quipTickAt(elapsed), stage)

  useEffect(() => {
    if (quip) rememberQuips([quip])
  }, [quip])

  return quip
}

export function AddSourceProgress({
  stage,
  startedAt,
  onCancel,
}: {
  stage: ItineraryProgressStage | null
  startedAt: number
  onCancel: () => void
}) {
  const quip = useSquirrelQuip(startedAt, stage)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <BrandMark
        variant="mono"
        className="h-10 wp-squirrel-hop text-foreground"
      />
      <div className="space-y-1.5">
        {/*
          El estado real hace de título: no había nada que ganar repitiendo
          «Analizando la fuente…» encima de él. Es lo único que se anuncia.
        */}
        <p className="text-sm font-medium text-foreground" aria-live="polite">
          {stage === "extracting"
            ? "Destilando la ruta…"
            : stage === "resolving"
              ? "Leyendo el post de Instagram…"
              : "Leyendo el artículo…"}
        </p>
        {/*
          Voz de la ardilla, no progreso: va `aria-hidden` porque un lector de
          pantalla no quiere un chiste nuevo cada siete segundos.

          `min-h-8` reserva las dos líneas del peor caso: sin eso, cada frase
          que envuelve movería el botón Cancelar. `max-w-sm` marca dónde
          envuelve; medido, ninguna frase del repertorio pasa de dos líneas ni
          en un panel de 260 px.
        */}
        <p
          key={quip ?? "wp-quip-empty"}
          aria-hidden
          className="wp-quip min-h-8 max-w-sm text-balance text-xs text-foreground"
        >
          {quip}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  )
}

export function AddSourceErrorState({
  message,
  onRetry,
  onDismiss,
  destination,
  usedUrls = [],
  onSelectSuggestion,
}: {
  message?: string | null
  onRetry?: () => void
  onDismiss: () => void
  destination?: string | null
  usedUrls?: string[]
  onSelectSuggestion?: (url: string) => void
}) {
  const dest = destination?.trim() || null
  const providerBusy = Boolean(
    message &&
      (message === EXTRACTION_PROVIDER_BUSY || looksLikeProviderDump(message)),
  )
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <AlertCircle className="size-6 text-destructive" aria-hidden />
      <div className="space-y-1.5">
        <p className="max-w-sm text-balance text-sm font-medium text-foreground">
          {providerBusy
            ? EXTRACTION_PROVIDER_BUSY
            : "Algo ha salido mal. Inténtalo de nuevo."}
        </p>
        {!providerBusy && message ? (
          <p className="max-w-sm text-balance text-xs text-muted-foreground">{message}</p>
        ) : null}
      </div>
      {dest && onSelectSuggestion ? (
        <InstagramFallbackSuggestions
          destination={dest}
          usedUrls={usedUrls}
          onSelect={onSelectSuggestion}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry ? (
          <Button type="button" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
            Recargar
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
          Descartar
        </Button>
      </div>
    </div>
  )
}

function InstagramFallbackSuggestions({
  destination,
  usedUrls,
  onSelect,
}: {
  destination: string
  usedUrls: string[]
  onSelect: (url: string) => void
}) {
  const [hits, setHits] = useState<SourceSuggestHit[]>([])
  const query = sanitizeSuggestQuery(destination)
  const usedKey = usedUrls.join("\n")

  useEffect(() => {
    if (!query || !isSourceSuggestEnabled()) return
    const ac = new AbortController()
    const urls = usedKey ? usedKey.split("\n") : []
    void fetchTripSourceSuggestions(query, `ig-fallback:${query.toLowerCase()}`, {
      signal: ac.signal,
    })
      .then((results) => {
        if (ac.signal.aborted || !results) return
        setHits(filterUnusedHits(results, urls))
      })
      .catch(() => {
        /* silencioso: el error principal ya está a la vista */
      })
    return () => ac.abort()
  }, [query, usedKey])

  if (!query || hits.length === 0) return null

  return (
    <div className="w-full max-w-sm space-y-2 text-left">
      <p className="text-balance text-xs text-muted-foreground">
        No hemos podido sacar una ruta de este post, pero sobre{" "}
        <span className="font-medium text-foreground">{destination}</span> tenemos esto
      </p>
      <SourceSuggestList
        hits={hits}
        compactSubtitle
        onSelect={(hit) => onSelect(hit.url)}
      />
    </div>
  )
}

type AddSourceSuggestContext = {
  trip?: Trip | null
  sources?: Source[]
  pendingUrls?: string[]
  atSourceCap?: boolean
  loadingPendingCount?: number
  isMobile?: boolean
}

type AddSourceFlowProps = {
  initialUrl?: string | null
  onSubmit: (url: string) => void
  onCancel: () => void
  /** Gate de segunda fuente / límite invitado; return false para abortar. */
  guardBeforeSubmit?: () => boolean
} & AddSourceSuggestContext

function pickSuggestHit(hit: SourceSuggestHit, onPick: (url: string) => void) {
  track("trip_source_suggest_click", { origin: hit.origin, instant: hit.instant })
  onPick(hit.url)
}

/** Viaje sin destino conocido: mismo buscador que la landing, con cuota `scope=trip`. */
function AddSourceDestinationSearch({
  pendingUrls = [],
  onPick,
}: {
  pendingUrls?: string[]
  onPick: (url: string) => void
}) {
  const id = useId()
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hits, setHits] = useState<SourceSuggestHit[] | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const shownKey = useRef<string | null>(null)

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const visible = filterUnusedHits(hits ?? [], pendingUrls)

  useEffect(() => {
    if (!hits || hits.length === 0) return
    const shown = filterUnusedHits(hits, pendingUrls)
    if (shown.length === 0) return
    const key = `${shown[0]!.url}:${shown.length}`
    if (shownKey.current === key) return
    shownKey.current = key
    track("trip_source_suggest_shown", { origin: shown[0]!.origin, n: shown.length })
  }, [hits, pendingUrls])

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
    track("trip_source_dest_search")
    void fetchTripSourceSuggestions(query, foldSuggestText(query), { signal: controller.signal })
      .then((results) => {
        if (controller.signal.aborted) return
        if (results) {
          setHits(results)
          return
        }
        setHits([])
        setError("No hemos podido buscar artículos. Inténtalo de nuevo.")
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        setHits([])
        setError("No hemos podido buscar artículos. Inténtalo de nuevo.")
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
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="shrink-0 text-xs font-medium text-muted-foreground">Busca un destino</p>
      <div className="shrink-0 pt-2">
        <DestinationSearchField
          id={`${id}-dest`}
          value={value}
          loading={loading}
          onChange={onChange}
          onSubmit={runSearch}
        />
        {error ? (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        {loading && hits == null ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">Buscando artículos…</p>
        ) : null}
        {hits && visible.length === 0 && !error && !loading ? (
          <p className="px-1 text-sm text-muted-foreground">
            No hemos encontrado artículos para ese destino. Prueba con otro nombre o pega una URL.
          </p>
        ) : null}
        {visible.length > 0 ? (
          <SourceSuggestList hits={visible} onSelect={(hit) => pickSuggestHit(hit, onPick)} compactSubtitle />
        ) : null}
      </div>
    </div>
  )
}

function AddSourceSuggestions({
  trip,
  sources = [],
  pendingUrls = [],
  atSourceCap = false,
  loadingPendingCount = 0,
  isMobile = false,
  onPick,
}: AddSourceSuggestContext & { onPick: (url: string) => void }) {
  const suggestOn =
    Boolean(trip) &&
    !atSourceCap &&
    loadingPendingCount === 0 &&
    isSourceSuggestEnabled()
  const hasSources = sources.length > 0

  const { query, hits, fetched, loading, refresh } = useTripSourceSuggestions({
    trip,
    sources,
    pendingUrls,
    // El nombre del viaje no cuenta como destino: sin fuentes, buscador.
    enabled: suggestOn && hasSources,
  })

  const shownKey = useRef<string | null>(null)
  useEffect(() => {
    if (!hasSources || !query || hits.length === 0) return
    const key = `${query}:${hits.length}:${hits[0]?.origin ?? ""}`
    if (shownKey.current === key) return
    shownKey.current = key
    track("trip_source_suggest_shown", { origin: hits[0]!.origin, n: hits.length })
  }, [hasSources, query, hits])

  if (!suggestOn) return null
  if (!hasSources || !query) {
    return <AddSourceDestinationSearch pendingUrls={pendingUrls} onPick={onPick} />
  }

  const visible = isMobile ? hits.slice(0, TRIP_SOURCE_SUGGEST_MOBILE_MAX) : hits
  const showEmpty = fetched && !loading && visible.length === 0
  if (!loading && !fetched) return null

  const handleMore = () => {
    track("trip_source_suggest_more")
    refresh()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="shrink-0 text-xs font-medium text-muted-foreground">
        Sugeridas para {query}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto pt-2">
        {loading && visible.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">Buscando artículos…</p>
        ) : null}
        {visible.length > 0 ? (
          <SourceSuggestList
            hits={visible}
            onSelect={(hit) => pickSuggestHit(hit, onPick)}
            compactSubtitle
          />
        ) : null}
        {showEmpty ? (
          <div className="space-y-2">
            <p className="px-1 text-sm text-muted-foreground">
              No quedan sugerencias para este destino.
            </p>
            <button
              type="button"
              onClick={handleMore}
              disabled={loading}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            >
              Buscar más
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Cabecera + URL fijos; el buscador de destino es un form hermano (no anidar). */
export function AddSourceFlow({
  initialUrl,
  onSubmit,
  onCancel,
  guardBeforeSubmit,
  trip,
  sources,
  pendingUrls,
  atSourceCap,
  loadingPendingCount,
  isMobile,
}: AddSourceFlowProps) {
  const id = useId()
  const [url, setUrl] = useState(initialUrl?.trim() ?? "")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setUrl(initialUrl?.trim() ?? "")
    setError(null)
  }, [initialUrl])

  const commit = (raw: string) => {
    if (guardBeforeSubmit && !guardBeforeSubmit()) {
      onCancel()
      return
    }
    setError(null)
    onSubmit(raw.trim())
  }

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault()
    const validation = validateSourceUrl(url)
    if (validation) {
      setError(validation)
      return
    }
    commit(url.trim())
  }

  const urlId = `${id}-url`
  const urlFormId = `${id}-url-form`
  const canSubmit = url.trim().length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-4 px-6 pt-6">
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Añadir fuente
          </DialogTitle>
          <DialogDescription>
            Pega la URL de un artículo de viajes o de un post de Instagram, o busca un destino.
            Destilaremos la ruta para consolidarla en tu viaje.
          </DialogDescription>
        </DialogHeader>
        <form id={urlFormId} onSubmit={handleSubmit} className="space-y-2">
          <Label htmlFor={urlId}>URL del artículo o del post</Label>
          <Input
            id={urlId}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              if (error) setError(null)
            }}
            placeholder="https://… o un post de Instagram"
            autoFocus={!isMobileViewport()}
            aria-invalid={!!error}
          />
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-4 pt-4">
        <AddSourceSuggestions
          trip={trip}
          sources={sources}
          pendingUrls={pendingUrls}
          atSourceCap={atSourceCap}
          loadingPendingCount={loadingPendingCount}
          isMobile={isMobile}
          onPick={commit}
        />
      </div>
      <DialogFooter className="shrink-0 bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" form={urlFormId} disabled={!canSubmit}>
          Añadir
        </Button>
      </DialogFooter>
    </div>
  )
}

export type AddSourceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialUrl?: string | null
  onSubmit: (url: string) => void
  guardBeforeSubmit?: () => boolean
} & AddSourceSuggestContext

/** Diálogo URL + sugerencias: en móvil, pantalla completa como el resto de formularios. */
export function AddSourceDialog({
  open,
  onOpenChange,
  initialUrl,
  onSubmit,
  guardBeforeSubmit,
  trip,
  sources,
  pendingUrls,
  atSourceCap,
  loadingPendingCount,
  isMobile,
}: AddSourceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullscreenOnMobile
        hideClose
        className="sm:max-h-[min(90vh,40rem)] sm:max-w-lg"
      >
        <AddSourceFlow
          initialUrl={initialUrl}
          onSubmit={(url) => {
            onSubmit(url)
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
          guardBeforeSubmit={guardBeforeSubmit}
          trip={trip}
          sources={sources}
          pendingUrls={pendingUrls}
          atSourceCap={atSourceCap}
          loadingPendingCount={loadingPendingCount}
          isMobile={isMobile}
        />
      </DialogContent>
    </Dialog>
  )
}

/** Modal cuando el viaje ya tiene el máximo de fuentes. */
export function MaxSourcesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Máximo de fuentes</DialogTitle>
          <DialogDescription>
            Has llegado al máximo de {MAX_SOURCES_PER_TRIP} fuentes en este viaje. Quita alguna
            para poder añadir otra.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
