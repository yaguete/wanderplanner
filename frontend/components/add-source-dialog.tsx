"use client"

/**
 * Flujo «Añadir fuente»: formulario de URL + fase de análisis bloqueante.
 * Desktop usa Dialog; móvil reutiliza el sheet del InspirationPanel con este contenido.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { Loader2 } from "lucide-react"
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
import { ApiLimitError, isAbortError, type ItineraryProgressStage } from "@/lib/api"
import type { Source } from "@/types/itinerary"

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
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Analizando la fuente…</p>
        <p className="text-xs text-muted-foreground">
          {stage === "extracting" ? "Destilando la ruta…" : "Leyendo el artículo…"}
        </p>
        <p className="max-w-sm text-balance text-xs text-muted-foreground">
          Puede tardar más de 30 segundos si el artículo es largo. No cierres esta ventana.
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  )
}

export type AddSourceSubmitResult = {
  source: Source
}

type AddSourceFlowProps = {
  tripId: string
  initialUrl?: string | null
  loadingStage: ItineraryProgressStage | null
  onExtract: (url: string, signal: AbortSignal) => Promise<Source>
  onSuccess: (source: Source) => void
  onCancel: () => void
  onGuestBlocked?: () => void
  /** Si true, no se puede cerrar por fuera (fase análisis). */
  analyzing: boolean
  setAnalyzing: (v: boolean) => void
  /** Gate de segunda fuente / límite invitado; return false para abortar. */
  guardBeforeExtract?: () => boolean
}

/** Contenido compartido (fase URL o análisis) para Dialog y sheet móvil. */
export function AddSourceFlow({
  initialUrl,
  loadingStage,
  onExtract,
  onSuccess,
  onCancel,
  onGuestBlocked,
  analyzing,
  setAnalyzing,
  guardBeforeExtract,
}: AddSourceFlowProps) {
  const id = useId()
  const [url, setUrl] = useState(initialUrl?.trim() ?? "")
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!analyzing) {
      setUrl(initialUrl?.trim() ?? "")
      setError(null)
    }
  }, [initialUrl, analyzing])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const handleCancel = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setAnalyzing(false)
    onCancel()
  }

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault()
    const validation = validateSourceUrl(url)
    if (validation) {
      setError(validation)
      return
    }
    if (guardBeforeExtract && !guardBeforeExtract()) {
      onCancel()
      return
    }
    setError(null)
    const ac = new AbortController()
    abortRef.current = ac
    setAnalyzing(true)
    try {
      const source = await onExtract(url.trim(), ac.signal)
      abortRef.current = null
      setAnalyzing(false)
      onSuccess(source)
    } catch (err) {
      abortRef.current = null
      setAnalyzing(false)
      if (isAbortError(err)) {
        onCancel()
        return
      }
      if (err instanceof ApiLimitError && err.limit === "guest") {
        onGuestBlocked?.()
        onCancel()
        return
      }
      if (err instanceof ApiLimitError) {
        setError(err.message)
        return
      }
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo extraer la fuente. Comprueba la URL y que el backend esté en marcha.",
      )
    }
  }

  if (analyzing) {
    return <AddSourceProgress stage={loadingStage} onCancel={handleCancel} />
  }

  const urlId = `${id}-url`
  const canSubmit = url.trim().length > 0

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
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
          autoFocus
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
  tripId: string
  initialUrl?: string | null
  loadingStage: ItineraryProgressStage | null
  onExtract: (url: string, signal: AbortSignal) => Promise<Source>
  onSuccess: (source: Source) => void
  guardBeforeExtract?: () => boolean
  onGuestLimit?: () => void
}

/** Diálogo desktop (bloqueante en fase análisis). */
export function AddSourceDialog({
  open,
  onOpenChange,
  tripId,
  initialUrl,
  loadingStage,
  onExtract,
  onSuccess,
  guardBeforeExtract,
  onGuestLimit,
}: AddSourceDialogProps) {
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    if (!open) setAnalyzing(false)
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (analyzing && !next) return
        onOpenChange(next)
      }}
    >
      <DialogContent
        hideClose={analyzing}
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          if (analyzing) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (analyzing) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{analyzing ? "Analizando fuente" : "Añadir fuente"}</DialogTitle>
          {!analyzing ? (
            <DialogDescription>
              Pega la URL de un artículo de viajes. Destilaremos la ruta para consolidarla en Mi
              viaje.
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <AddSourceFlow
          tripId={tripId}
          initialUrl={initialUrl}
          loadingStage={loadingStage}
          onExtract={onExtract}
          onSuccess={(source) => {
            onSuccess(source)
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
          analyzing={analyzing}
          setAnalyzing={setAnalyzing}
          guardBeforeExtract={guardBeforeExtract}
          onGuestBlocked={onGuestLimit}
        />
      </DialogContent>
    </Dialog>
  )
}
