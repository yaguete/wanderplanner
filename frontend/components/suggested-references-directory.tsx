"use client"

import { useState } from "react"
import { Check, ExternalLink, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/segmented-control"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { faviconUrlForHost } from "@/lib/reference-feed"
import {
  isSuggestedReferenceAdded,
  readStoredSuggestedLang,
  sortSuggestedReferences,
  SUGGESTED_LANGS,
  suggestedReferenceHomeUrl,
  suggestedReferencesForLang,
  writeStoredSuggestedLang,
  type SuggestedLang,
  type SuggestedReference,
} from "@/lib/suggested-references"
import { cn } from "@/lib/utils"

/**
 * El icono del blog se pinta a 20 px dentro de una casilla de 40.
 * Ampliarlo no lo mejora: gstatic sirve originales de 32 px y cada blog trae un
 * encuadre distinto (foto, garabato, logotipo), así que a tamaño grande la
 * rejilla se vuelve un muestrario de calidades. Pequeño, todos leen igual.
 */
function CatalogMark({ host, added }: { host: string; added?: boolean }) {
  const [failed, setFailed] = useState(false)
  const letter = host.replace(/^www\./i, "").charAt(0).toUpperCase() || "?"
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg",
        added ? "bg-white" : "border border-border bg-muted",
      )}
      aria-hidden
    >
      {failed ? (
        <span className="text-xs font-semibold text-muted-foreground">{letter}</span>
      ) : (
        <img
          src={faviconUrlForHost(host, 64)}
          alt=""
          width={20}
          height={20}
          className="h-5 w-5 object-contain"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}

export function SuggestedReferencesDirectory({
  knownDomains,
  onAdd,
  onRemove,
}: {
  knownDomains: readonly string[]
  onAdd: (homeUrl: string, domain: string, label: string) => Promise<boolean>
  onRemove: (domain: string) => Promise<void>
}) {
  const [pendingHost, setPendingHost] = useState<string | null>(null)
  const [lang, setLang] = useState<SuggestedLang>(readStoredSuggestedLang)
  const items = sortSuggestedReferences(suggestedReferencesForLang(lang), knownDomains)

  const setSuggestedLang = (next: SuggestedLang) => {
    setLang(next)
    writeStoredSuggestedLang(next)
  }

  const add = async (item: SuggestedReference) => {
    if (pendingHost) return
    setPendingHost(item.host)
    try {
      await onAdd(suggestedReferenceHomeUrl(item.host), item.host, item.label)
    } finally {
      setPendingHost(null)
    }
  }

  const remove = async (item: SuggestedReference) => {
    if (pendingHost) return
    setPendingHost(item.host)
    try {
      await onRemove(item.host)
    } finally {
      setPendingHost(null)
    }
  }

  return (
    <div className="@container flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <h2 className="text-lg font-semibold tracking-tight">Sugerencias</h2>
        <SegmentedControl
          items={SUGGESTED_LANGS}
          value={lang}
          onValueChange={setSuggestedLang}
          ariaLabel="Idioma de las sugerencias"
          size="compact"
          emphasis
          fit
        />
      </div>
      {/* Columnas por breakpoint, no `auto-fill`: el contenedor es `max-w-5xl`. */}
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const added = isSuggestedReferenceAdded(item.host, knownDomains)
          const busy = pendingHost === item.host
          const href = suggestedReferenceHomeUrl(item.host)
          return (
            <li
              key={item.host}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border p-3 transition-colors",
                added ? "bg-muted/40" : "bg-card hover:border-foreground/20",
              )}
            >
              <CatalogMark host={item.host} added={added} />
              <div className="min-w-0 flex-1">
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm font-semibold leading-snug tracking-tight hover:underline"
                >
                  {item.label}
                </a>
                <p className="truncate text-[12px] leading-snug text-muted-foreground">
                  {item.host}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Abrir"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="top">Abrir</TooltipContent>
                </Tooltip>
                {added ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={pendingHost !== null}
                        aria-busy={busy}
                        aria-label={`Quitar ${item.label}`}
                        onClick={() => void remove(item)}
                        className={cn(
                          "inline-flex h-8 w-8 items-center justify-center rounded-md",
                          "text-success transition-colors",
                          "hover:bg-sidebar-accent hover:text-success",
                          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          "disabled:pointer-events-none disabled:opacity-50",
                        )}
                      >
                        {busy ? (
                          <Spinner className="size-4" />
                        ) : (
                          <Check className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">En tus fuentes (haz clic para quitar)</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={pendingHost !== null}
                        aria-busy={busy}
                        aria-label={`Añadir ${item.label}`}
                        onClick={() => void add(item)}
                      >
                        {busy ? <Spinner className="size-4" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Añadir a tus fuentes</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
