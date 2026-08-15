"use client"

/**
 * Flujo «Añadir fuente»: solo formulario de URL.
 * La extracción vive en trip-context (`startSourceExtraction`); el progreso/error
 * se muestran como chip pendiente en InspirationPanel.
 */
import { useEffect, useId, useState, type FormEvent } from "react"
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
import { isMobileViewport } from "@/hooks/use-mobile"
import type { ItineraryProgressStage } from "@/lib/api"
import { MAX_SOURCES_PER_TRIP } from "@/lib/trip-sources"

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

type AddSourceFlowProps = {
  initialUrl?: string | null
  onSubmit: (url: string) => void
  onCancel: () => void
  /** Gate de segunda fuente / límite invitado; return false para abortar. */
  guardBeforeSubmit?: () => boolean
}

/** Formulario de URL compartido (Dialog desktop y sheet móvil). */
export function AddSourceFlow({
  initialUrl,
  onSubmit,
  onCancel,
  guardBeforeSubmit,
}: AddSourceFlowProps) {
  const id = useId()
  const [url, setUrl] = useState(initialUrl?.trim() ?? "")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setUrl(initialUrl?.trim() ?? "")
    setError(null)
  }, [initialUrl])

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault()
    const validation = validateSourceUrl(url)
    if (validation) {
      setError(validation)
      return
    }
    if (guardBeforeSubmit && !guardBeforeSubmit()) {
      onCancel()
      return
    }
    setError(null)
    onSubmit(url.trim())
  }

  const urlId = `${id}-url`
  const canSubmit = url.trim().length > 0

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
      <DialogFooter className="gap-2 sm:gap-0">
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
}

/** Diálogo desktop: solo URL. */
export function AddSourceDialog({
  open,
  onOpenChange,
  initialUrl,
  onSubmit,
  guardBeforeSubmit,
}: AddSourceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir fuente</DialogTitle>
          <DialogDescription>
            Pega la URL de un artículo de viajes. Destilaremos la ruta para consolidarla en tu
            viaje.
          </DialogDescription>
        </DialogHeader>
        <AddSourceFlow
          initialUrl={initialUrl}
          onSubmit={(url) => {
            onSubmit(url)
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
          guardBeforeSubmit={guardBeforeSubmit}
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
