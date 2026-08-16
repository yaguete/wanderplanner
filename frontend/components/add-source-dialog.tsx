"use client"

/**
 * Flujo «Añadir fuente»: URL + sugerencias del destino del viaje.
 * La extracción vive en trip-context (`startSourceExtraction`); el progreso/error
 * se muestran como chip pendiente en InspirationPanel.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { track } from "@vercel/analytics"
import { AlertCircle, Loader2, RefreshCw } from "lucide-react"
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
import { SourceSuggestList } from "@/components/source-suggest-list"
import { useTripSourceSuggestions } from "@/hooks/use-trip-source-suggestions"
import { isMobileViewport } from "@/hooks/use-mobile"
import type { ItineraryProgressStage } from "@/lib/api"
import { isSourceSuggestEnabled, type SourceSuggestHit } from "@/lib/source-suggest"
import { TRIP_SOURCE_SUGGEST_MOBILE_MAX } from "@/lib/trip-source-suggestions"
import { MAX_SOURCES_PER_TRIP } from "@/lib/trip-sources"
import type { Source, Trip } from "@/types/itinerary"

export function validateSourceUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return "Pega la URL del artículo."
  if (!/^https?:\/\//i.test(trimmed)) {
    return "La URL debe empezar por http:// o https://."
  }
  try {
    // eslint-disable-next-line no-new
    new URL(trimmed)
  } catch {
    return "La URL no es válida."
  }
  return null
}

export function AddSourceProgress({
  stage,
  onCancel,
}: {
  stage: ItineraryProgressStage | null
  onCancel: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Analizando la fuente…</p>
        <p className="text-xs text-muted-foreground">
          {stage === "extracting" ? "Destilando la ruta…" : "Leyendo el artículo…"}
        </p>
        <p className="max-w-sm text-balance text-xs text-muted-foreground">
          Puede tardar más de 30 segundos si el artículo es largo. Puedes seguir trabajando
          en Mi viaje o el asistente.
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
}: {
  message?: string | null
  onRetry: () => void
  onDismiss: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <AlertCircle className="size-6 text-destructive" aria-hidden />
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">
          Algo ha salido mal. Inténtalo de nuevo.
        </p>
        {message ? (
          <p className="max-w-sm text-balance text-xs text-muted-foreground">{message}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
          Recargar
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
          Descartar
        </Button>
      </div>
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

function AddSourceSuggestions({
  trip,
  sources = [],
  pendingUrls = [],
  atSourceCap = false,
  loadingPendingCount = 0,
  isMobile = false,
  onPick,
}: AddSourceSuggestContext & { onPick: (url: string) => void }) {
  const enabled =
    Boolean(trip) &&
    !atSourceCap &&
    loadingPendingCount === 0 &&
    isSourceSuggestEnabled()

  const { query, hits, fetched, loading, refresh } = useTripSourceSuggestions({
    trip,
    sources,
    pendingUrls,
    enabled,
  })

  const shownKey = useRef<string | null>(null)
  useEffect(() => {
    if (!query || hits.length === 0) return
    const key = `${query}:${hits.length}:${hits[0]?.origin ?? ""}`
    if (shownKey.current === key) return
    shownKey.current = key
    track("trip_source_suggest_shown", { origin: hits[0]!.origin, n: hits.length })
  }, [query, hits])

  if (!enabled || !query) return null

  const visible = isMobile ? hits.slice(0, TRIP_SOURCE_SUGGEST_MOBILE_MAX) : hits
  const showEmpty = fetched && !loading && visible.length === 0
  if (!loading && !fetched) return null

  const handleSelect = (hit: SourceSuggestHit) => {
    track("trip_source_suggest_click", { origin: hit.origin, instant: hit.instant })
    onPick(hit.url)
  }

  const handleMore = () => {
    track("trip_source_suggest_more")
    refresh()
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Sugeridas para {query}</p>
      {loading && visible.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Buscando artículos…</p>
      ) : null}
      {visible.length > 0 ? (
        <SourceSuggestList hits={visible} onSelect={handleSelect} compactSubtitle />
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
  )
}

/** Formulario de URL: cabecera + campo + sugerencias + pie fijo (móvil a pantalla completa). */
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
  const canSubmit = url.trim().length > 0

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-10 pt-6">
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Añadir fuente
          </DialogTitle>
          <DialogDescription>
            Pega la URL de un artículo de viajes o elige una sugerencia. Destilaremos la ruta
            para consolidarla en tu viaje.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={urlId}>URL del artículo</Label>
          <Input
            id={urlId}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              if (error) setError(null)
            }}
            placeholder="https://blog.com/mi-viaje-a..."
            autoFocus={!isMobileViewport()}
            aria-invalid={!!error}
          />
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
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
        <Button type="submit" disabled={!canSubmit}>
          Añadir
        </Button>
      </DialogFooter>
    </form>
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
