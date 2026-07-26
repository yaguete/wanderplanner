"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react"
import {
  ArrowLeft,
  History,
  Link2,
  Loader2,
  Minus,
  Plus,
  SendHorizontal,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AssistantMarkdown } from "@/components/assistant-markdown"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  useAssistantChat,
  type AssistantConversationSummary,
  type ChatAction,
  type ChatMessage,
} from "@/hooks/use-assistant-chat"
import { useTrips } from "@/lib/trip-context"
import { isInspirationalSourceUrl } from "@/lib/inspirational-source"
import { ITEM_LABELS } from "@/lib/item-styles"
import { cn } from "@/lib/utils"
import type { ItemType, UserDayItem } from "@/types/itinerary"

/** Offset desde la derecha cuando «Mi viaje» está abierto (right-2 + ancho panel + gap). */
export const PLAN_PANEL_RIGHT_OFFSET =
  "calc(0.5rem + min(560px, calc(100vw - 2rem)) + 0.75rem)"

const SUGGESTIONS = [
  "¿Necesito visado para este viaje?",
  "¿Qué me falta para completar el plan?",
  "Sugiéreme otra fuente útil",
]

type PanelView = "chat" | "history"

type AssistantPanelLayerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  /** En desktop, desplaza el chat a la izquierda del panel Mi viaje. */
  shiftForPlan?: boolean
}

function StatusPill({ label }: { label: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      <span>{label}</span>
    </div>
  )
}

function formatConversationDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ""
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d)
  } catch {
    return ""
  }
}

function ActionCard({
  action,
  busy,
  onAccept,
  onDismiss,
}: {
  action: ChatAction
  busy: boolean
  onAccept: () => void
  onDismiss: () => void
}) {
  if (action.status === "accepted") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        Añadido al viaje
      </div>
    )
  }
  if (action.status === "dismissed") {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Propuesta descartada
      </div>
    )
  }

  if (action.kind === "add_source") {
    if (!isInspirationalSourceUrl(action.url)) {
      return null
    }
    return (
      <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Link2 className="h-3.5 w-3.5 text-primary" />
          Añadir fuente
        </div>
        <p className="text-sm font-medium text-foreground">{action.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{action.url}</p>
        {action.why ? (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{action.why}</p>
        ) : null}
        <div className="mt-2.5 flex gap-2">
          <Button type="button" size="sm" className="h-7 text-xs" disabled={busy} onClick={onAccept}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Añadir"}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={onDismiss}>
            Descartar
          </Button>
        </div>
      </div>
    )
  }

  const typeLabel = ITEM_LABELS[action.type as ItemType] ?? action.type
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
      <div className="mb-1 text-xs font-medium text-foreground">Añadir al día</div>
      <p className="text-sm font-medium text-foreground">
        [{typeLabel}] {action.name}
      </p>
      {action.detail ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{action.detail}</p>
      ) : null}
      {action.region ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{action.region}</p>
      ) : null}
      <div className="mt-2.5 flex gap-2">
        <Button type="button" size="sm" className="h-7 text-xs" disabled={busy} onClick={onAccept}>
          Añadir
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={onDismiss}>
          Descartar
        </Button>
      </div>
    </div>
  )
}

function normalizeSourceUrl(url: string): string {
  try {
    const u = new URL(url.trim())
    u.hash = ""
    let path = u.pathname
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
    u.pathname = path
    return u.toString()
  } catch {
    return url.trim()
  }
}

function MessageBubble({
  message,
  isStreamingTail,
  actionBusyId,
  onAcceptAction,
  onDismissAction,
  onAddSourceLink,
  busySourceUrl,
  addedSourceUrls,
}: {
  message: ChatMessage
  isStreamingTail: boolean
  actionBusyId: string | null
  onAcceptAction: (action: ChatAction) => void
  onDismissAction: (action: ChatAction) => void
  onAddSourceLink: (url: string) => void
  busySourceUrl: string | null
  addedSourceUrls: ReadonlySet<string>
}) {
  const isUser = message.role === "user"
  if (
    !isUser &&
    !message.content.trim() &&
    !(message.actions?.length) &&
    !isStreamingTail
  ) {
    return null
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[min(92%,36rem)] rounded-2xl bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    )
  }

  // Asistente: ancho completo, sin bocadillo (estilo tipo Claude).
  return (
    <div className="w-full min-w-0 space-y-2 text-sm leading-relaxed text-foreground">
      {message.content.trim() ? (
        <AssistantMarkdown
          content={message.content}
          onAddSourceLink={onAddSourceLink}
          busyUrl={busySourceUrl}
          addedUrls={addedSourceUrls}
        />
      ) : isStreamingTail ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Escribiendo…
        </span>
      ) : null}
      {message.actions?.length ? (
        <div className="space-y-2 pt-1">
          {message.actions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              busy={actionBusyId === action.id}
              onAccept={() => onAcceptAction(action)}
              onDismiss={() => onDismissAction(action)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ConversationHistoryList({
  conversations,
  activeConversationId,
  onOpen,
  onRequestDelete,
}: {
  conversations: AssistantConversationSummary[]
  activeConversationId: string | null
  onOpen: (id: string) => void
  onRequestDelete: (conv: AssistantConversationSummary) => void
}) {
  if (conversations.length === 0) {
    return (
      <div className="px-1 py-8 text-center">
        <p className="text-sm text-muted-foreground">Aún no hay conversaciones en este viaje.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Empieza a chatear y aparecerán aquí.
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {conversations.map((c) => {
        const isActive = c.id === activeConversationId
        return (
          <li key={c.id}>
            <div
              className={cn(
                "group flex items-stretch overflow-hidden rounded-xl border border-border bg-card transition-colors",
                isActive && "border-primary/40 bg-primary/5",
              )}
            >
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                className="min-w-0 flex-1 px-3 py-2.5 text-left hover:bg-muted/40"
              >
                <p className="truncate text-sm font-medium text-foreground">{c.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatConversationDate(c.updatedAt)}
                  {c.messageCount > 0 ? ` · ${c.messageCount} mensajes` : null}
                </p>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRequestDelete(c)
                }}
                className="inline-flex w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Eliminar conversación: ${c.title}`}
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function AssistantPanelLayer({
  open,
  onOpenChange,
  tripId,
  shiftForPlan = false,
}: AssistantPanelLayerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const [draft, setDraft] = useState("")
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [busySourceUrl, setBusySourceUrl] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [view, setView] = useState<PanelView>("chat")
  const [pendingDelete, setPendingDelete] = useState<AssistantConversationSummary | null>(null)

  const { getTrip, getTripSources, addSourceToTrip, addItemToDay, isLoadingSource } = useTrips()
  const trip = getTrip(tripId)
  const sources = getTripSources(tripId)
  const addedSourceUrls = useMemo(
    () => new Set(sources.map((s) => normalizeSourceUrl(s.url))),
    [sources],
  )

  const {
    messages,
    isStreaming,
    statusLabel,
    error,
    send,
    stop,
    setActionStatus,
    hydrated,
    conversations,
    activeConversationId,
    newConversation,
    openConversation,
    deleteConversation,
  } = useAssistantChat(tripId, trip, sources)

  useEffect(() => {
    if (!open) return
    setView("chat")
  }, [open, tripId])

  useEffect(() => {
    if (!open || view !== "chat") return
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(t)
  }, [open, view])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view === "history") {
          setView("chat")
          return
        }
        onOpenChange(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange, view])

  useEffect(() => {
    if (view !== "chat") return
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, statusLabel, isStreaming, open, view])

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || isStreaming) return
    setDraft("")
    await send(text)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleAddSourceLink = async (url: string) => {
    const normalized = normalizeSourceUrl(url)
    if (!trip || isLoadingSource || busySourceUrl) return
    if (addedSourceUrls.has(normalized)) return
    setLinkError(null)
    setBusySourceUrl(url)
    try {
      await addSourceToTrip(tripId, url)
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "No se pudo añadir la fuente")
    } finally {
      setBusySourceUrl(null)
    }
  }

  const handleAcceptAction = async (messageId: string, action: ChatAction) => {
    if (action.status !== "pending" || !trip) return
    setActionBusyId(action.id)
    setLinkError(null)
    try {
      if (action.kind === "add_source") {
        const normalized = normalizeSourceUrl(action.url)
        if (!addedSourceUrls.has(normalized)) {
          await addSourceToTrip(tripId, action.url)
        }
        setActionStatus(messageId, action.id, "accepted")
      } else {
        const dayExists = trip.days.some((d) => d.id === action.day_id)
        if (!dayExists) {
          setActionStatus(messageId, action.id, "dismissed")
          return
        }
        const itemType = (["transport", "stay", "food", "activity"] as ItemType[]).includes(
          action.type as ItemType,
        )
          ? (action.type as ItemType)
          : "activity"
        const item: UserDayItem = {
          id: crypto.randomUUID(),
          sourceItemId: `assistant-${crypto.randomUUID()}`,
          sourceId: "assistant",
          type: itemType,
          name: action.name,
          detail: action.detail ?? null,
          sourceAuthor: "Asistente",
          region: action.region ?? null,
        }
        addItemToDay(tripId, action.day_id, item)
        setActionStatus(messageId, action.id, "accepted")
      }
    } catch {
      /* el error de addSource se propaga; dejamos la acción pendiente */
    } finally {
      setActionBusyId(null)
    }
  }

  const handleNewConversation = () => {
    newConversation()
    setDraft("")
    setView("chat")
  }

  const handleOpenConversation = (id: string) => {
    openConversation(id)
    setDraft("")
    setView("chat")
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    deleteConversation(pendingDelete.id)
    setPendingDelete(null)
  }

  if (!open) return null

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
  /** Bocadillo vacío en curso: muestra spinner dentro; si hay statusLabel, manda el pill. */
  const streamingTailId =
    isStreaming && !statusLabel && lastAssistant && !lastAssistant.content.trim()
      ? lastAssistant.id
      : null

  const showHistory = view === "history"

  return (
    <div
      id="inspiration-assistant-panel"
      role="dialog"
      aria-modal={isMobile ? true : undefined}
      aria-label="Asistente de viaje"
      className={cn(
        "absolute z-40 flex min-h-0 flex-col overflow-hidden bg-background",
        "inset-0 border-t border-border",
        /* Mismo footprint que «Mi viaje» en desktop: top/bottom/right-2 + ancho 560 */
        "sm:inset-auto sm:top-2 sm:bottom-2 sm:w-[min(560px,calc(100vw-2rem))]",
        "sm:rounded-xl sm:border sm:shadow-[0_16px_48px_rgba(0,0,0,0.14)]",
        "duration-200 animate-in fade-in-0 slide-in-from-bottom-2",
        shiftForPlan ? "sm:right-[var(--plan-panel-offset)]" : "sm:right-2",
      )}
      style={
        shiftForPlan
          ? ({ "--plan-panel-offset": PLAN_PANEL_RIGHT_OFFSET } as CSSProperties)
          : undefined
      }
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        {showHistory ? (
          <>
            <button
              type="button"
              onClick={() => setView("chat")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Volver al chat"
              title="Volver"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              Conversaciones
            </p>
          </>
        ) : (
          <>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              Asistente del viaje
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
              onClick={handleNewConversation}
              disabled={isStreaming}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nueva conversación</span>
              <span className="sm:hidden">Nueva</span>
            </Button>
            <button
              type="button"
              onClick={() => setView("history")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Historial de conversaciones"
              title="Historial"
            >
              <History className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Minimizar asistente"
          title="Minimizar"
        >
          <Minus className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>

      {showHistory ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 p-4">
            <ConversationHistoryList
              conversations={conversations}
              activeConversationId={activeConversationId}
              onOpen={handleOpenConversation}
              onRequestDelete={setPendingDelete}
            />
            <button
              type="button"
              onClick={handleNewConversation}
              disabled={isStreaming}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/30 hover:text-foreground disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva conversación
            </button>
          </div>
        </ScrollArea>
      ) : (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-4">
              {!hydrated ? null : messages.length === 0 ? (
                <div className="space-y-4">
                  <p className="max-w-[300px] text-xs leading-relaxed text-muted-foreground">
                    Pregúntame sobre tus fuentes, el plan o requisitos oficiales. Puedo buscar en
                    internet y proponer fuentes o ítems para que tú confirmes.
                  </p>
                  <div className="flex flex-col gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        disabled={isStreaming || !trip}
                        className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isStreamingTail={m.id === streamingTailId}
                    actionBusyId={actionBusyId}
                    onAcceptAction={(action) => void handleAcceptAction(m.id, action)}
                    onDismissAction={(action) => setActionStatus(m.id, action.id, "dismissed")}
                    onAddSourceLink={(url) => void handleAddSourceLink(url)}
                    busySourceUrl={busySourceUrl}
                    addedSourceUrls={addedSourceUrls}
                  />
                ))
              )}

              {statusLabel ? (
                <div className="flex justify-start">
                  <StatusPill label={statusLabel} />
                </div>
              ) : null}

              {busySourceUrl && !statusLabel ? (
                <div className="flex justify-start">
                  <StatusPill label="Añadiendo fuente…" />
                </div>
              ) : null}

              {error || linkError ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {linkError || error}
                </p>
              ) : null}

              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="shrink-0 border-t border-border bg-background p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-1.5 shadow-sm">
              <button
                type="button"
                disabled
                className="mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/50"
                aria-label="Adjuntar archivo (próximamente)"
                title="Adjuntar (próximamente)"
              >
                <Plus className="h-4 w-4" />
              </button>
              <Textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Pregunta sobre tu viaje…"
                rows={1}
                className="max-h-28 min-h-8 flex-1 resize-none border-0 bg-transparent px-0 py-1.5 text-sm shadow-none focus-visible:ring-0"
                aria-label="Mensaje al asistente"
                disabled={!trip}
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stop}
                  className="mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
                  aria-label="Detener"
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!draft.trim() || !trip}
                  className="mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
                  aria-label="Enviar mensaje"
                >
                  <SendHorizontal className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              Los enlaces se abren en una pestaña; «Añadir fuente» los incorpora al viaje
            </p>
          </div>
        </>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null)
        }}
      >
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar conversación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres eliminar «{pendingDelete?.title}»? Esta acción no se puede
              deshacer. Los ítems o fuentes ya añadidos al viaje se mantienen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              onClick={confirmDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
