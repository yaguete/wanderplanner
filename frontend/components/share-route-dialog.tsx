"use client"

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { track } from "@vercel/analytics"
import { Copy, Mail, Share2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { AiTransferGate } from "@/components/ai-transfer-gate"
import { BRAND_INK } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth-context"
import {
  fetchAiTransferConsent,
  hasAiTransferConsent,
  recordAiTransferConsent,
  rememberAiTransferConsent,
} from "@/lib/ai-transfer-consent"
import { ApiLimitError } from "@/lib/api"
import { buildSharePlan, shareCardIsStale, shareCardNeedsGenerate, sharePlanSignature } from "@/lib/share-briefing"
import { generateShareSummary } from "@/lib/share-summary"
import {
  canNativeShare,
  shareTargetsFor,
  withShareFooter,
  type ShareTargetId,
} from "@/lib/share-targets"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { useTrips } from "@/lib/trip-context"
import { cn } from "@/lib/utils"
import type { ShareCard } from "@/types/itinerary"

const GENERATING_LINES = [
  "Contando los días…",
  "Buscando lo que más te va a apetecer…",
  "Dándole el punto…",
] as const

export function ShareRouteDialog({
  tripId,
  open,
  onOpenChange,
}: {
  tripId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { getTrip, getTripSources, setShareCard } = useTrips()
  const trip = getTrip(tripId)
  const sources = open ? getTripSources(tripId) : []
  const plan = open && trip ? buildSharePlan(trip, sources) : null
  const signature = plan ? sharePlanSignature(plan) : ""
  const card = trip?.shareCard ?? null
  const displayText = card?.text ?? ""

  const [aiConsent, setAiConsent] = useState<boolean | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lineIndex, setLineIndex] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const copyRef = useRef<HTMLButtonElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const startedRef = useRef(false)
  const noticeId = useId()
  const stale = shareCardIsStale(card, signature)

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      abortRef.current = null
      startedRef.current = false
      setGenerating(false)
      setError(null)
      setLineIndex(0)
      setEditing(false)
      setDraft("")
      return
    }
    if (!userId) {
      setAiConsent(null)
      return
    }
    if (hasAiTransferConsent(userId)) {
      setAiConsent(true)
      return
    }
    if (!isSupabaseConfigured()) {
      setAiConsent(false)
      return
    }
    let cancelled = false
    void fetchAiTransferConsent(createClient(), userId).then((granted) => {
      if (cancelled) return
      if (granted) rememberAiTransferConsent(userId)
      setAiConsent(granted)
    })
    return () => {
      cancelled = true
    }
  }, [open, userId])

  const runGenerate = useCallback(
    async (force: boolean) => {
      if (!trip || !plan) return
      const current = trip.shareCard
      const sig = sharePlanSignature(plan)
      if (!force && !shareCardNeedsGenerate(current)) {
        track("share_sheet_open", {
          cached: true,
          stale: current.signature !== sig,
        })
        return
      }
      if (!force) track("share_sheet_open", { cached: false })
      if (force) track("share_summary_regenerated")

      setEditing(false)
      setDraft("")
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setGenerating(true)
      setError(null)
      try {
        const text = await generateShareSummary(plan, ac.signal)
        if (ac.signal.aborted) return
        const next: ShareCard = {
          text,
          signature: sig,
          generatedAt: new Date().toISOString(),
        }
        setShareCard(trip.id, next)
        track("share_summary_generated", {
          days: plan.num_days,
          sources: plan.sources.length,
          chars: text.length,
        })
        requestAnimationFrame(() => copyRef.current?.focus())
      } catch (e) {
        if (ac.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return
        const message =
          e instanceof ApiLimitError
            ? e.message
            : e instanceof Error
              ? e.message
              : "No hemos podido escribir el resumen. Inténtalo otra vez."
        setError(message)
      } finally {
        if (abortRef.current === ac) {
          setGenerating(false)
          abortRef.current = null
        }
      }
    },
    [plan, setShareCard, trip],
  )

  useEffect(() => {
    if (!open || aiConsent !== true) return
    if (startedRef.current) return
    startedRef.current = true
    void runGenerate(false)
    return () => {
      abortRef.current?.abort()
      startedRef.current = false
    }
    // Intencionadamente sin `runGenerate`: si entra, un cambio de identidad
    // abortaría y relanzaría la llamada en cada mutación del viaje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, aiConsent])

  useEffect(() => {
    if (!generating) {
      setLineIndex(0)
      return
    }
    const id = window.setInterval(() => {
      setLineIndex((i) => (i + 1) % GENERATING_LINES.length)
    }, 2500)
    return () => window.clearInterval(id)
  }, [generating])

  useEffect(() => {
    if (!editing) return
    const el = editRef.current
    if (!el) return
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
  }, [editing])

  const acceptConsent = () => {
    if (!userId) return
    rememberAiTransferConsent(userId)
    setAiConsent(true)
    if (isSupabaseConfigured()) {
      void recordAiTransferConsent(createClient(), userId)
    }
  }

  const startEdit = () => {
    setDraft(displayText)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setDraft("")
  }

  const saveEdit = () => {
    const text = draft.trim()
    if (!trip || !card || !text) return
    if (text !== card.text) {
      setShareCard(trip.id, { ...card, text })
      track("share_summary_edited")
    }
    setEditing(false)
    setDraft("")
  }

  const copyText = async () => {
    const text = withShareFooter(displayText)
    try {
      await navigator.clipboard.writeText(text)
      track("share_target", { target: "copy" satisfies ShareTargetId })
      toast.success("Listo, ya puedes pegarlo")
    } catch {
      toast.error("No hemos podido copiarlo. Selecciónalo a mano.")
    }
  }

  const nativeShare = async () => {
    const text = withShareFooter(displayText)
    try {
      await navigator.share({ title: trip?.name || "Ruta", text })
      track("share_target", { target: "native" })
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return
      toast.error("No se pudo abrir la hoja de compartir")
    }
  }

  const trackLink = (target: Exclude<ShareTargetId, "copy" | "native">) => {
    track("share_target", { target })
  }

  const targets = shareTargetsFor(displayText, {
    tripName: trip?.name,
    nativeAvailable: canNativeShare(),
  })
  const showCard = Boolean(displayText) && !generating
  const showSkeleton = generating
  const actionsDisabled = generating || !displayText || editing

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullscreenOnMobile
        className="sm:max-w-lg"
        onEscapeKeyDown={(e) => {
          if (!editing) return
          e.preventDefault()
          cancelEdit()
        }}
      >
        <DialogHeader className="shrink-0 space-y-1.5 px-6 py-4 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Comparte tu ruta
          </DialogTitle>
          <DialogDescription>
            Un resumen de tu plan, listo para pegar donde quieras.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {aiConsent !== true ? (
            <AiTransferGate
              purpose="share"
              ready={aiConsent !== null && Boolean(userId)}
              onAccept={acceptConsent}
            />
          ) : (
            <>
              <div
                className={cn(
                  "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-muted/40",
                  "sm:min-h-[8rem] sm:max-h-[45svh] sm:flex-none",
                )}
              >
                {showCard ? (
                  <div className="flex shrink-0 items-center justify-end gap-0.5 px-1.5 pt-1.5">
                    {stale ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        disabled={generating}
                        title="El plan ha cambiado. Volver a escribir el resumen perderá tus cambios."
                        onClick={() => void runGenerate(true)}
                      >
                        Regenerar
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={cn(
                        "h-7 px-2 text-xs",
                        editing
                          ? "font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      disabled={editing && !draft.trim()}
                      onClick={() => {
                        if (editing) saveEdit()
                        else startEdit()
                      }}
                    >
                      {editing ? "Guardar" : "Editar"}
                    </Button>
                  </div>
                ) : null}
                <div
                  className={cn(
                    "min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-sm leading-6",
                    showCard ? "pt-1" : "p-4",
                    !editing && "whitespace-pre-wrap select-text",
                  )}
                >
                  {showSkeleton ? (
                    <p className="text-muted-foreground" aria-live="polite">
                      {GENERATING_LINES[lineIndex]}
                    </p>
                  ) : showCard && editing ? (
                    <textarea
                      ref={editRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault()
                          e.stopPropagation()
                          cancelEdit()
                        }
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                          e.preventDefault()
                          saveEdit()
                        }
                      }}
                      aria-label="Resumen para compartir"
                      className="m-0 min-h-[12rem] w-full resize-none border-0 bg-transparent p-0 text-sm leading-6 outline-none"
                      style={{ color: BRAND_INK }}
                    />
                  ) : showCard ? (
                    <p className="m-0" style={{ color: BRAND_INK }}>
                      {displayText}
                    </p>
                  ) : error ? (
                    <p className="text-muted-foreground">{error}</p>
                  ) : (
                    <p className="text-muted-foreground">Preparando el resumen…</p>
                  )}
                </div>
              </div>

              {error && displayText ? (
                <p className="mt-2 text-xs text-destructive">{error}</p>
              ) : null}

              {error && !displayText ? (
                <button
                  type="button"
                  className="mt-2 self-start text-xs font-medium text-foreground underline underline-offset-4"
                  onClick={() => {
                    void runGenerate(true)
                  }}
                >
                  Reintentar
                </button>
              ) : null}

              <div className="mt-4 flex shrink-0 flex-wrap gap-2">
                {targets.native ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 max-sm:order-1 sm:order-5"
                    disabled={actionsDisabled}
                    onClick={() => void nativeShare()}
                  >
                    <Share2 className="h-3.5 w-3.5" aria-hidden />
                    Compartir…
                  </Button>
                ) : null}
                <Button
                  ref={copyRef}
                  type="button"
                  size="sm"
                  className="h-8 max-sm:order-2 sm:order-1"
                  disabled={actionsDisabled}
                  onClick={() => void copyText()}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Copiar
                </Button>
                <ShareLinkButton
                  label="Email"
                  icon={<Mail className="h-3.5 w-3.5" aria-hidden />}
                  href={targets.email.href}
                  reason={targets.email.reason}
                  disabled={actionsDisabled}
                  className={cn(
                    "max-sm:order-3 sm:order-2",
                    targets.native && "max-sm:hidden",
                  )}
                  onClick={() => trackLink("email")}
                />
                <ShareLinkButton
                  label="WhatsApp"
                  icon={<WhatsAppIcon />}
                  href={targets.whatsapp.href}
                  reason={targets.whatsapp.reason}
                  disabled={actionsDisabled}
                  className={cn(
                    "max-sm:order-4 sm:order-3",
                    targets.native && "max-sm:hidden",
                  )}
                  onClick={() => trackLink("whatsapp")}
                />
                <ShareLinkButton
                  label="Telegram"
                  icon={<TelegramIcon />}
                  href={targets.telegram.href}
                  reason={targets.telegram.reason}
                  disabled={actionsDisabled}
                  className={cn(
                    "max-sm:order-5 sm:order-4",
                    targets.native && "max-sm:hidden",
                  )}
                  onClick={() => trackLink("telegram")}
                />
              </div>

              <p
                id={noticeId}
                className="mt-4 shrink-0 text-pretty text-xs leading-5 text-muted-foreground"
              >
                El resumen lo escribe una IA fuera de la UE. No enviamos tu nombre ni tu correo.{" "}
                <Link
                  href="/legal/privacidad#terceros"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Más información
                </Link>
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ShareLinkButton({
  label,
  icon,
  href,
  reason,
  disabled,
  className,
  onClick,
}: {
  label: string
  icon: ReactNode
  href: string | null
  reason?: string
  disabled: boolean
  className?: string
  onClick: () => void
}) {
  const inner = (
    <>
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </>
  )
  const classes = cn("h-8 max-sm:w-8 max-sm:px-0", className)
  if (!href || disabled) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={classes}
        disabled
        title={reason ?? label}
        aria-label={label}
      >
        {inner}
      </Button>
    )
  }
  const isMailto = href.startsWith("mailto:")
  return (
    <Button type="button" size="sm" variant="outline" className={classes} asChild>
      <a
        href={href}
        {...(isMailto
          ? {}
          : { target: "_blank", rel: "noopener noreferrer" })}
        onClick={onClick}
        title={reason ?? label}
        aria-label={label}
      >
        {inner}
      </a>
    </Button>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}
