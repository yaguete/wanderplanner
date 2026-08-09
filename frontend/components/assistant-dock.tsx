"use client"

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import {
  ArrowLeft,
  ArrowUp,
  History,
  Link2,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
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
import { useCollapsingHeader } from "@/hooks/use-collapsing-header"
import { useIsMobile } from "@/hooks/use-mobile"
import { useVirtualKeyboard } from "@/hooks/use-virtual-keyboard"
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
import { ASSISTANT_SOURCE_ID } from "@/lib/item-provenance"
import { buildAssistantSuggestions } from "@/lib/assistant-suggestions"

const ASSISTANT_WIDTH_NARROW = "min(560px, calc(100% - 1rem))"
const ASSISTANT_WIDTH_WIDE = "min(760px, calc(100% - 1rem))"
/** Tope de crecimiento del textarea antes de pasar a scroll interno (px). */
const COMPOSER_MAX_HEIGHT = 168

type PanelView = "chat" | "history"

type AssistantPanelLayerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  /**
   * `overlay` (default): capa modal sobre Fuentes (desktop + legacy).
   * `section`: sección hermana en la navegación móvil; se mantiene montada
   * aunque no esté visible para no cortar el streaming.
   */
  variant?: "overlay" | "section"
  /**
   * Solo `section` (móvil): fila de navegación que se incrusta bajo el composer
   * para formar un único elemento flotante (se retira con el teclado abierto).
   */
  bottomNav?: ReactNode
}

function StatusPill({ label }: { label: string }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 py-1 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span className="assistant-status-loader shrink-0" aria-hidden />
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
  variant = "overlay",
  bottomNav,
}: AssistantPanelLayerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const isSection = variant === "section"
  const { open: keyboardOpen, inset: keyboardInset } = useVirtualKeyboard()
  /** Alto real del composer flotante: reserva espacio al final de la conversación. */
  const [composerHeight, setComposerHeight] = useState(0)
  const { containerRef: panelRef, collapsed: headerCollapsed } = useCollapsingHeader(
    isMobile && isSection,
  )
  const [draft, setDraft] = useState("")
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [busySourceUrl, setBusySourceUrl] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [view, setView] = useState<PanelView>("chat")
  const [pendingDelete, setPendingDelete] = useState<AssistantConversationSummary | null>(null)
  /** Solo desktop: modo de lectura más ancho; se conserva al minimizar en la misma vista. */
  const [wide, setWide] = useState(false)

  const { getTrip, getTripSources, addSourceToTrip, addItemToDay, isLoadingSource } = useTrips()
  const trip = getTrip(tripId)
  const sources = getTripSources(tripId)
  const suggestions = useMemo(
    () => buildAssistantSuggestions(trip, sources),
    [trip, sources],
  )
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
    // En móvil no auto-enfocamos: levantaría el teclado al entrar en la pestaña.
    if (!open || view !== "chat" || isMobile) return
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(t)
  }, [open, view, isMobile])

  /** El textarea crece con el contenido hasta `COMPOSER_MAX_HEIGHT`; a partir de ahí, scroll. */
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`
  }, [draft, view])

  useEffect(() => {
    const el = composerRef.current
    if (!el) {
      setComposerHeight(0)
      return
    }
    const measure = () => setComposerHeight(el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [view, isSection])

  useEffect(() => {
    if (!open || isSection) return
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
  }, [open, onOpenChange, view, isSection])

  useEffect(() => {
    if (view !== "chat") return
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, statusLabel, isStreaming, open, view, keyboardOpen, keyboardInset])

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
          sourceId: ASSISTANT_SOURCE_ID,
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

  // Overlay: desmontar al cerrar. Section: permanece montado (streaming) y se oculta con CSS.
  if (!open && !isSection) return null

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
  /** Bocadillo vacío en curso: muestra spinner dentro; si hay statusLabel, manda el pill. */
  const streamingTailId =
    isStreaming && !statusLabel && lastAssistant && !lastAssistant.content.trim()
      ? lastAssistant.id
      : null

  const showHistory = view === "history"

  return (
    <div
      ref={panelRef}
      id="inspiration-assistant-panel"
      role={isSection ? "region" : "dialog"}
      aria-modal={isSection ? undefined : isMobile ? true : undefined}
      aria-label="Asistente de viaje"
      aria-hidden={isSection && !open ? true : undefined}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-background",
        isSection
          ? cn(
              "absolute inset-0 z-10",
              open ? "visible" : "invisible pointer-events-none",
            )
          : cn(
              "absolute z-40",
              "inset-0 border-t border-border",
              "sm:inset-auto sm:top-2 sm:right-2 sm:bottom-2",
              "sm:rounded-xl sm:border sm:shadow-[0_16px_48px_rgba(0,0,0,0.14)]",
              "duration-200 animate-in fade-in-0 slide-in-from-bottom-2",
              "sm:transition-[width] sm:duration-200 sm:ease-out",
            ),
      )}
      style={
        isSection || isMobile
          ? undefined
          : { width: wide ? ASSISTANT_WIDTH_WIDE : ASSISTANT_WIDTH_NARROW }
      }
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-2",
          isSection
            ? "overflow-hidden px-4 transition-[max-height,opacity,padding] duration-200 ease-out"
            : "h-12 border-b border-border px-3 sm:px-4",
          isSection &&
            (headerCollapsed
              ? "max-h-0 py-0 opacity-0"
              : "max-h-20 pb-2 pt-3.5 opacity-100"),
        )}
      >
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
            <p
              className={cn(
                "min-w-0 flex-1 truncate font-semibold text-foreground",
                isSection ? "text-lg tracking-tight" : "text-sm",
              )}
            >
              Conversaciones
            </p>
          </>
        ) : (
          <>
            {!isSection ? (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              </span>
            ) : null}
            <p
              className={cn(
                "min-w-0 flex-1 truncate font-semibold text-foreground",
                isSection ? "text-lg tracking-tight" : "text-sm",
              )}
            >
              Asistente
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
            {!isMobile && !isSection ? (
              <button
                type="button"
                onClick={() => setWide((v) => !v)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={wide ? "Reducir ancho del asistente" : "Ampliar asistente para lectura"}
                aria-pressed={wide}
                title={wide ? "Ancho normal" : "Modo lectura amplia"}
              >
                {wide ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            ) : null}
          </>
        )}
        {!isSection ? (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Minimizar asistente"
            title="Minimizar"
          >
            <Minus className="h-4 w-4" strokeWidth={2.25} />
          </button>
        ) : null}
      </div>

      {showHistory ? (
        <ScrollArea className="min-h-0 flex-1">
          <div
            className={cn(
              "space-y-3 p-4",
              isSection && "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]",
            )}
          >
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
      ) : null}

      {/* Historial (móvil): sin composer, el nav mantiene su propia tarjeta flotante. */}
      {showHistory && isSection && bottomNav ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <div
            className={cn(
              "pointer-events-auto rounded-2xl",
              "border border-border/60 bg-background/80 backdrop-blur-xl",
              "shadow-[0_10px_40px_-12px_rgba(0,0,0,0.28)]",
            )}
          >
            {bottomNav}
          </div>
        </div>
      ) : null}

      {!showHistory ? (
        <>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-4">
              {!hydrated ? null : messages.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Pregúntame sobre tus fuentes, el plan o requisitos oficiales. Puedo buscar en
                  internet y proponer fuentes o ítems para que tú confirmes.
                </p>
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

              {/*
                Spacer con altura explícita (no padding): el Viewport de Radix ScrollArea
                a veces no reserva bien el padding-bottom y el texto acaba bajo el composer.
              */}
              <div
                ref={bottomRef}
                aria-hidden
                className="shrink-0"
                style={{
                  // Con teclado overlay (iOS), el inset también tapa conversación.
                  height:
                    Math.max(composerHeight, 64) +
                    20 +
                    (isSection && keyboardOpen ? keyboardInset : 0),
                }}
              />
            </div>
          </ScrollArea>

          {/* Composer flotante: fondo transparente para que la conversación corra por detrás. */}
          <div
            ref={composerRef}
            className={cn(
              "pointer-events-none absolute inset-x-0 z-20 px-3 pt-3 transition-[bottom] duration-200 ease-out",
              // Móvil + teclado: pegado al teclado. Sin teclado: alineado con el dock flotante.
              isSection && keyboardOpen
                ? "pb-2"
                : isSection
                  ? "pb-[max(env(safe-area-inset-bottom),0.75rem)]"
                  : "pb-3",
            )}
            style={{
              bottom: isSection && keyboardOpen ? keyboardInset : 0,
            }}
          >
            {hydrated && messages.length === 0 ? (
              <div className="pointer-events-auto mb-2 flex flex-col items-start gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    disabled={isStreaming || !trip}
                    className="w-fit rounded-xl border border-border bg-muted/30 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
            <div
              className={cn(
                "pointer-events-auto overflow-hidden rounded-2xl",
                "border border-border/60 bg-background/80 backdrop-blur-xl",
                "shadow-[0_10px_40px_-12px_rgba(0,0,0,0.28)]",
              )}
            >
              <div className="flex items-end gap-2 p-1.5">
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
                  // text-base en móvil: <16px provoca auto-zoom de iOS al enfocar (y no se deshace).
                  className="min-h-8 flex-1 resize-none border-0 bg-transparent px-0 py-1.5 text-base shadow-none focus-visible:ring-0 md:text-sm"
                  style={{ maxHeight: COMPOSER_MAX_HEIGHT }}
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
                    <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                )}
              </div>

              {/* Nav incrustado: composer + pestañas como un único elemento flotante. */}
              {isSection && bottomNav && !keyboardOpen ? (
                <div className="border-t border-border/50">{bottomNav}</div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

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
