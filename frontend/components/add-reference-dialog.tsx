"use client"

import { useEffect, useId, useState, type FormEvent } from "react"
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
import { Spinner } from "@/components/ui/spinner"
import { isMobileViewport } from "@/hooks/use-mobile"
import {
  classifyReferencePaste,
  type ClassifiedReferencePaste,
} from "@/lib/reference-feed"

type ArticlePaste = Extract<ClassifiedReferencePaste, { kind: "article" }>

export function AddReferenceDialog({
  open,
  onOpenChange,
  knownDomains,
  onAddReference,
  onCreateTrip,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  knownDomains: readonly string[]
  onAddReference: (homeUrl: string, domain: string) => Promise<boolean>
  onCreateTrip: (articleUrl: string) => void
}) {
  const id = useId()
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [choice, setChoice] = useState<ArticlePaste | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) return
    setUrl("")
    setError(null)
    setChoice(null)
    setSaving(false)
  }, [open])

  const close = () => onOpenChange(false)

  const persistReference = async (homeUrl: string, domain: string) => {
    setSaving(true)
    setError(null)
    const ok = await onAddReference(homeUrl, domain)
    setSaving(false)
    if (ok) close()
    return ok
  }

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault()
    const classified = classifyReferencePaste(url, knownDomains)
    if (classified.kind === "invalid") {
      setError(classified.message)
      return
    }
    if (classified.kind === "homepage") {
      if (classified.duplicate) {
        setError("Esa fuente ya está añadida.")
        return
      }
      void persistReference(classified.homeUrl, classified.domain)
      return
    }
    setChoice(classified)
  }

  const urlId = `${id}-url`
  const urlFormId = `${id}-url-form`
  const canSubmit = url.trim().length > 0 && !saving

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullscreenOnMobile
        hideClose
        className="sm:max-w-lg"
      >
        {choice ? (
          <ArticleOrReferenceChoice
            paste={choice}
            saving={saving}
            onBack={() => setChoice(null)}
            onFollow={() => void persistReference(choice.homeUrl, choice.domain)}
            onCreateTrip={() => {
              onCreateTrip(choice.articleUrl)
            }}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 space-y-4 px-6 pt-6">
              <DialogHeader className="space-y-1.5 text-left">
                <DialogTitle className="text-lg font-semibold tracking-tight">
                  Añadir fuente
                </DialogTitle>
                <DialogDescription>
                  Pega la URL de un blog o de un artículo. Si es un artículo, te preguntaremos
                  si quieres seguir esa web o crear un viaje con él.
                </DialogDescription>
              </DialogHeader>
              <form id={urlFormId} onSubmit={handleSubmit} className="space-y-2">
                <Label htmlFor={urlId}>URL del blog o del artículo</Label>
                <Input
                  id={urlId}
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value)
                    if (error) setError(null)
                  }}
                  placeholder="https://mibloguerafavorita.com"
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
            <div className="min-h-0 flex-1" />
            <DialogFooter className="shrink-0 bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button type="button" variant="ghost" onClick={close} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" form={urlFormId} disabled={!canSubmit}>
                {saving ? <Spinner className="size-4" /> : null}
                Añadir
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ArticleOrReferenceChoice({
  paste,
  saving,
  onBack,
  onFollow,
  onCreateTrip,
}: {
  paste: ArticlePaste
  saving: boolean
  onBack: () => void
  onFollow: () => void
  onCreateTrip: () => void
}) {
  const follow = paste.canFollow && !paste.duplicate
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-4 px-6 pt-6">
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {follow ? "¿Referencia o viaje?" : "Crear viaje"}
          </DialogTitle>
          <DialogDescription>
            {paste.duplicate
              ? `${paste.domain} ya está en tus fuentes. ¿Quieres crear un viaje a partir de este artículo?`
              : follow
                ? `Has pegado un artículo de ${paste.domain}. Puedes seguir esa web como referencia o crear un viaje con el artículo.`
                : `Este enlace es un artículo. No podemos seguir ${paste.domain} como referencia; sí puedes crear un viaje con él.`}
          </DialogDescription>
        </DialogHeader>
        {follow ? (
          <div className="flex flex-col gap-2">
            <Button type="button" onClick={onFollow} disabled={saving}>
              {saving ? <Spinner className="size-4" /> : null}
              Añadir {paste.domain} como referencia
            </Button>
            <Button type="button" variant="outline" onClick={onCreateTrip} disabled={saving}>
              Crear viaje con este artículo
            </Button>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1" />
      <DialogFooter className="shrink-0 bg-background px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button type="button" variant="ghost" onClick={onBack} disabled={saving}>
          Volver
        </Button>
        {follow ? null : (
          <Button type="button" onClick={onCreateTrip} disabled={saving}>
            Crear viaje
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}
