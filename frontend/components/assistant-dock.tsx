"use client"

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react"
import {
  ArrowLeft,
  ArrowUp,
  History,
  Loader2,
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
import { ActionCard } from "@/components/assistant-action-card"
import { useCollapsingHeader } from "@/hooks/use-collapsing-header"
import { useIsMobile } from "@/hooks/use-mobile"
import { useStableList } from "@/hooks/use-stable-list"
import { useVirtualKeyboard } from "@/hooks/use-virtual-keyboard"
import {
  useAssistantChat,
  type AssistantConversationSummary,
  type ChatAction,
  type ChatMessage,
} from "@/hooks/use-assistant-chat"
import { useAuth } from "@/lib/auth-context"
import { loadActiveConversationId } from "@/lib/db/assistant-repo"
import { useTrips } from "@/lib/trip-context"
import { cn } from "@/lib/utils"
import type { ItemType, UserDayItem } from "@/types/itinerary"
import type { MoveParams } from "@/lib/itinerary-dnd"
import { buildAssistantSuggestions } from "@/lib/assistant-suggestions"
import {
  buildAssistantTransportStub,
  inverseMoveParams,
  isAssistantActionStale,
  parseTaskCategory,
  resolveAddSourceBasic,
  resolveConsolidateSourceItem,
  resolveMoveItem,
  resolveRemoveItem,
  resolveSetTaskCost,
  resolveSwapItems,
} from "@/lib/assistant-actions"
import { ASSISTANT_SOURCE_ID } from "@/lib/item-provenance"
import { AiTransferGate } from "@/components/ai-transfer-gate"
import {
  fetchAiTransferConsent,
  hasAiTransferConsent,
  recordAiTransferConsent,
  rememberAiTransferConsent,
} from "@/lib/ai-transfer-consent"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { MAX_SOURCES_PER_TRIP, sourceMatchKey } from "@/lib/trip-sources"
import { toast } from "sonner"

const COMPOSER_MAX_HEIGHT = 168
/** Distancia al fondo (px) para considerar que el usuario quiere auto-follow. */
const NEAR_BOTTOM_PX = 80

type PanelView = "chat" | "history"

type AssistantPanelLayerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
  /**
   * `panel`: columna hermana en el layout desktop (siempre montada).
   * `section`: sección hermana en la navegación móvil; se mantiene montada
   * aunque no esté visible para no cortar el streaming.
   */
  variant?: "panel" | "section"
  /**
   * Solo `section` (móvil): fila de navegación que se incrusta bajo el composer
   * para formar un único elemento flotante (se retira con el teclado abierto).
   */
  bottomNav?: ReactNode
}

function composerFollowupsFor(isStreaming: boolean, messages: ChatMessage[]): string[] {
  if (isStreaming || messages.length === 0) return []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === "assistant") return (m.followups ?? []).slice(0, 3)
  }
  return []
}

const CHIP_CLASS =
  "rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs text-primary transition-colors hover:border-transparent hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"

function SuggestionChips({
  prompts,
  layout,
  disabled,
  onPick,
}: {
  prompts: readonly string[]
  layout: "stack" | "row"
  disabled: boolean
  onPick: (prompt: string) => void
}) {
  if (prompts.length === 0) return null
  return (
    <div
      className={
        layout === "stack"
          ? "flex flex-col items-start gap-1.5"
          : "flex flex-nowrap gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      }
      aria-label="Sugerencias"
    >
      {prompts.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          disabled={disabled}
          className={layout === "row" ? `shrink-0 ${CHIP_CLASS}` : CHIP_CLASS}
        >
          {s}
        </button>
      ))}
    </div>
  )
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

/**
 * Memoizado con callbacks estables (reciben `messageId`): durante el streaming solo
 * se re-renderiza la burbuja cola, y escribir en el composer no re-parsea el markdown.
 */
const MessageBubble = memo(function MessageBubble({
  message,
  isStreamingTail,
  actionBusyId,
  currency,
  undoableIds,
  undoneIds,
  staleActionIds,
  onAcceptAction,
  onDismissAction,
  onUndoAction,
  onAddSourceLink,
  busySourceUrl,
  addedSourceUrls,
}: {
  message: ChatMessage
  isStreamingTail: boolean
  actionBusyId: string | null
  currency: string
  undoableIds: ReadonlySet<string>
  undoneIds: ReadonlySet<string>
  staleActionIds: ReadonlySet<string>
  onAcceptAction: (messageId: string, action: ChatAction) => void
  onDismissAction: (messageId: string, action: ChatAction) => void
  onUndoAction: (messageId: string, action: ChatAction) => void
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
      <div
        className="flex justify-end"
        data-message-role="user"
        data-message-id={message.id}
      >
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
              currency={currency}
              canUndo={undoableIds.has(action.id)}
              undone={undoneIds.has(action.id)}
              stale={staleActionIds.has(action.id)}
              onAccept={() => onAcceptAction(message.id, action)}
              onDismiss={() => onDismissAction(message.id, action)}
              onUndo={() => onUndoAction(message.id, action)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
})

/**
 * Composer con estado propio: cada tecla re-renderiza solo este componente,
 * no el panel entero (con todo el markdown de la conversación). Clave para
 * que escribir en móvil vaya fluido.
 */
const ChatComposer = memo(function ChatComposer({
  inputRef,
  disabled,
  isStreaming,
  onSend,
  onStop,
  conversationKey,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>
  disabled: boolean
  isStreaming: boolean
  onSend: (text: string) => void
  onStop: () => void
  /** Al cambiar de conversación se descarta el borrador. */
  conversationKey: string | null
}) {
  const [draft, setDraft] = useState("")

  // Descarta el borrador al cambiar de conversación (ajuste de estado en render,
  // sin efecto: https://react.dev/learn/you-might-not-need-an-effect).
  const [prevKey, setPrevKey] = useState(conversationKey)
  if (prevKey !== conversationKey) {
    setPrevKey(conversationKey)
    setDraft("")
  }

  /** El textarea crece con el contenido hasta `COMPOSER_MAX_HEIGHT`; a partir de ahí, scroll.
   * También se re-mide con ResizeObserver: si el panel nace oculto (ancho 0), el scrollHeight
   * basura no debe quedarse pegado al abrir. */
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return

    const measure = () => {
      if (el.clientWidth === 0) return
      el.style.height = "auto"
      el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [draft, inputRef])

  const handleSend = () => {
    const text = draft.trim()
    if (!text || isStreaming) return
    setDraft("")
    onSend(text)
    // Móvil: bajar el teclado en el mismo gesto que envía (tras preventDefault en pointerdown).
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
      inputRef.current?.blur()
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  /** Evita blur del textarea en pointerdown → el composer no salta y el click aterriza. */
  const keepFocusOnPointerDown = (e: PointerEvent) => {
    e.preventDefault()
  }

  return (
    <div className="flex items-end gap-2 p-1.5 pl-3">
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
        disabled={disabled}
      />
      {isStreaming ? (
        <button
          type="button"
          onPointerDown={keepFocusOnPointerDown}
          onClick={onStop}
          className="mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
          aria-label="Detener"
        >
          <Square className="h-3 w-3 fill-current" />
        </button>
      ) : (
        <button
          type="button"
          onPointerDown={keepFocusOnPointerDown}
          onClick={handleSend}
          disabled={!draft.trim() || disabled}
          className="mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
          aria-label="Enviar mensaje"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
})

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
  tripId,
  variant = "panel",
  bottomNav,
}: AssistantPanelLayerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const lastAnchoredUserIdRef = useRef<string | null>(null)
  const isMobile = useIsMobile()
  const isSection = variant === "section"
  const isPanel = variant === "panel"
  const { open: keyboardOpen, inset: keyboardInset } = useVirtualKeyboard()
  /** Alto real del composer flotante: reserva espacio al final de la conversación. */
  const [composerHeight, setComposerHeight] = useState(0)
  const { containerRef: panelRef, collapsed: headerCollapsed } = useCollapsingHeader(
    isMobile && isSection,
  )
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const undoByActionIdRef = useRef(
    new Map<
      string,
      | { type: "move"; inverse: MoveParams }
      | { type: "swap"; itemIdA: string; itemIdB: string }
      | {
          type: "remove"
          item: UserDayItem
          dayId: string
          index: number
          taskKey: string
          cost: number | null
        }
    >(),
  )
  const [undoableIds, setUndoableIds] = useState<ReadonlySet<string>>(() => new Set())
  const [undoneIds, setUndoneIds] = useState<ReadonlySet<string>>(() => new Set())
  /** Pending iniciado desde este dock (pill / busy de enlaces); no el del panel Fuentes. */
  const [assistantPendingId, setAssistantPendingId] = useState<string | null>(null)
  const [view, setView] = useState<PanelView>("chat")
  const [pendingDelete, setPendingDelete] = useState<AssistantConversationSummary | null>(null)
  /** `null` = aún no se sabe (primer render o consulta en vuelo): el gate no deja pulsar. */
  const [aiConsent, setAiConsent] = useState<boolean | null>(null)
  // Reset de vista solo al cambiar de viaje — no al abrir/cerrar el panel.
  const [viewTripId, setViewTripId] = useState(tripId)
  if (viewTripId !== tripId) {
    setViewTripId(tripId)
    setView("chat")
    setAssistantPendingId(null)
  }

  const {
    getTrip,
    getTripSources,
    startSourceExtraction,
    pendingSources,
    addItemToDay,
    addItemsToDay,
    moveItemBetweenDays,
    removeItemFromDay,
    addExtraTask,
    addBasicToTrip,
    setTaskState,
  } = useTrips()
  const { user } = useAuth()
  const userId = user?.id ?? null

  // El navegador responde al instante; si no sabe nada, se mira la constancia del
  // perfil (otro dispositivo, o almacenamiento borrado). Si Supabase falla, se
  // pregunta otra vez: es el lado seguro y nunca deja el asistente inservible.
  useEffect(() => {
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
  }, [userId])

  const trip = getTrip(tripId)
  // Identidad estable: `getTripSources` devuelve un array nuevo en cada render y
  // eso invalidaba `addedSourceUrls` → `memo(MessageBubble)` → re-parseo del
  // markdown de toda la conversación en cada mutación del viaje.
  const sources = useStableList(getTripSources(tripId))
  const tripLoadingPending = useMemo(
    () => pendingSources.find((p) => p.tripId === tripId && p.status === "loading") ?? null,
    [pendingSources, tripId],
  )

  useEffect(() => {
    if (!assistantPendingId) return
    const stillLoading = pendingSources.some(
      (p) => p.id === assistantPendingId && p.status === "loading",
    )
    if (!stillLoading) setAssistantPendingId(null)
  }, [pendingSources, assistantPendingId])

  const assistantLoading =
    tripLoadingPending?.id === assistantPendingId ? tripLoadingPending : null
  const busySourceUrl = assistantLoading?.url ?? null
  /** Sin conversación activa en localStorage → chips ya; si hay id, esperar a hydrated. */
  const canShowSuggestionsEarly = useMemo(() => {
    const uid = user?.id
    if (!uid) return true
    return loadActiveConversationId(uid, tripId) === null
  }, [user?.id, tripId])
  const addedSourceUrls = useMemo(
    () => new Set(sources.map((s) => sourceMatchKey(s.url))),
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

  const suggestions = useMemo(
    () => buildAssistantSuggestions(trip, sources),
    [trip, sources],
  )
  const composerFollowups = composerFollowupsFor(isStreaming, messages)
  const staleActionIdKey = useMemo(() => {
    if (!trip) return ""
    const ids: string[] = []
    for (const m of messages) {
      for (const a of m.actions ?? []) {
        if (a.status !== "pending") continue
        if (isAssistantActionStale(trip, sources, a)) ids.push(a.id)
      }
    }
    ids.sort()
    return ids.join("\0")
  }, [trip, sources, messages])
  const staleActionIds = useMemo(
    () => new Set(staleActionIdKey === "" ? [] : staleActionIdKey.split("\0")),
    [staleActionIdKey],
  )

  useEffect(() => {
    // En móvil no auto-enfocamos: levantaría el teclado al entrar en la pestaña.
    // Doble rAF: saca el focus del frame crítico donde Fuentes/Viaje re-maquetan al abrir.
    if (!open || view !== "chat" || isMobile) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => inputRef.current?.focus())
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [open, view, isMobile])

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
  }, [view, isSection, isPanel])

  /** Escucha scroll del viewport de Radix para saber si el usuario está al fondo. */
  useEffect(() => {
    const root = chatScrollRef.current
    if (!root) return
    const viewport = root.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null
    if (!viewport) return
    const onScroll = () => {
      const dist = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      nearBottomRef.current = dist <= NEAR_BOTTOM_PX
    }
    onScroll()
    viewport.addEventListener("scroll", onScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", onScroll)
  }, [view, open])

  const prevOpenRef = useRef(open)
  useEffect(() => {
    if (view !== "chat" || !open) {
      prevOpenRef.current = open
      return
    }

    // Al abrir el panel: jump instantáneo. Smooth solo con mensajes nuevos / streaming.
    const justOpened = !prevOpenRef.current
    prevOpenRef.current = true
    const scrollBehavior: ScrollBehavior = justOpened ? "auto" : "smooth"

    const lastUser = [...messages].reverse().find((m) => m.role === "user")
    if (lastUser && lastUser.id !== lastAnchoredUserIdRef.current) {
      lastAnchoredUserIdRef.current = lastUser.id
      nearBottomRef.current = false
      requestAnimationFrame(() => {
        const el = chatScrollRef.current?.querySelector(
          `[data-message-id="${lastUser.id}"]`,
        )
        el?.scrollIntoView({ block: "start", behavior: scrollBehavior })
      })
      return
    }

    if (nearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: scrollBehavior, block: "end" })
    }
  }, [messages, statusLabel, isStreaming, open, view, keyboardOpen, keyboardInset, composerHeight])

  const handleComposerSend = useCallback(
    (text: string) => {
      void send(text)
    },
    [send],
  )

  const handleAddSourceLink = useCallback(
    (url: string) => {
      const normalized = sourceMatchKey(url)
      if (!trip || tripLoadingPending) return
      if (addedSourceUrls.has(normalized)) return
      const result = startSourceExtraction(tripId, url)
      if (!result.ok) {
        if (result.reason === "max-sources") {
          toast.error(
            `Has llegado al máximo de ${MAX_SOURCES_PER_TRIP} fuentes en este viaje. Quita alguna para añadir otra.`,
          )
        } else if (result.reason === "already-loading") {
          toast.message("Espera a que termine la fuente en curso")
        } else {
          toast.error("No se pudo iniciar la extracción")
        }
        return
      }
      setAssistantPendingId(result.pendingId)
    },
    [trip, tripLoadingPending, addedSourceUrls, startSourceExtraction, tripId],
  )

  const markUndoable = useCallback((actionId: string) => {
    setUndoableIds((prev) => new Set(prev).add(actionId))
  }, [])

  const failAction = useCallback(
    (messageId: string, actionId: string, message: string) => {
      toast.error(message)
      setActionStatus(messageId, actionId, "dismissed")
    },
    [setActionStatus],
  )

  const handleAcceptAction = useCallback(
    (messageId: string, action: ChatAction) => {
      if (action.status !== "pending" || !trip) return
      setActionBusyId(action.id)
      try {
        if (action.kind === "add_source") {
          const normalized = sourceMatchKey(action.url)
          if (!addedSourceUrls.has(normalized)) {
            const result = startSourceExtraction(tripId, action.url)
            if (!result.ok) {
              if (result.reason === "max-sources") {
                toast.error(
                  `Has llegado al máximo de ${MAX_SOURCES_PER_TRIP} fuentes en este viaje. Quita alguna para añadir otra.`,
                )
              } else if (result.reason === "already-loading") {
                toast.message("Espera a que termine la fuente en curso")
              }
              return
            }
            setAssistantPendingId(result.pendingId)
          }
          setActionStatus(messageId, action.id, "accepted")
          return
        }

        if (action.kind === "move_item") {
          const resolved = resolveMoveItem(trip.days, action)
          if (!resolved.ok) {
            failAction(
              messageId,
              action.id,
              resolved.reason === "leg_locked"
                ? "La ida y la vuelta se editan desde Ruta"
                : resolved.reason === "day_missing"
                  ? "Ese día ya no está en el viaje"
                  : "Esa parada ya no está en el viaje",
            )
            return
          }
          const params = {
            fromDayId: resolved.fromDayId,
            toDayId: resolved.toDayId,
            itemId: resolved.itemId,
            toIndex: resolved.toIndex,
          }
          moveItemBetweenDays(tripId, params)
          undoByActionIdRef.current.set(action.id, {
            type: "move",
            inverse: inverseMoveParams(params, resolved.fromIndex),
          })
          markUndoable(action.id)
          setActionStatus(messageId, action.id, "accepted")
          return
        }

        if (action.kind === "swap_items") {
          const resolved = resolveSwapItems(
            trip.days,
            action.item_id_a,
            action.item_id_b,
            action.name_a,
            action.name_b,
          )
          if (!resolved.ok) {
            failAction(
              messageId,
              action.id,
              resolved.reason === "leg_locked"
                ? "La ida y la vuelta se editan desde Ruta"
                : "Esa parada ya no está en el viaje",
            )
            return
          }
          moveItemBetweenDays(tripId, resolved.moves[0])
          moveItemBetweenDays(tripId, resolved.moves[1])
          undoByActionIdRef.current.set(action.id, {
            type: "swap",
            itemIdA: resolved.moves[0].itemId,
            itemIdB: resolved.moves[1].itemId,
          })
          markUndoable(action.id)
          setActionStatus(messageId, action.id, "accepted")
          return
        }

        if (action.kind === "remove_item") {
          const resolved = resolveRemoveItem(trip, action.item_id, action.name)
          if (!resolved.ok) {
            failAction(
              messageId,
              action.id,
              resolved.reason === "leg_locked"
                ? "La ida y la vuelta se editan desde Ruta"
                : "Esa parada ya no está en el viaje",
            )
            return
          }
          removeItemFromDay(tripId, resolved.dayId, resolved.item.id)
          undoByActionIdRef.current.set(action.id, {
            type: "remove",
            item: resolved.item,
            dayId: resolved.dayId,
            index: resolved.index,
            taskKey: resolved.taskKey,
            cost: resolved.costAtRisk,
          })
          markUndoable(action.id)
          setActionStatus(messageId, action.id, "accepted")
          return
        }

        if (action.kind === "add_transport") {
          const dayExists = trip.days.some((d) => d.id === action.day_id)
          if (!dayExists) {
            failAction(messageId, action.id, "Ese día ya no está en el viaje")
            return
          }
          addItemToDay(
            tripId,
            action.day_id,
            buildAssistantTransportStub({
              from: action.from,
              to: action.to,
              mode: action.mode,
            }),
          )
          setActionStatus(messageId, action.id, "accepted")
          return
        }

        if (action.kind === "add_extra_task") {
          addExtraTask(tripId, {
            title: action.title,
            category: parseTaskCategory(action.category),
          })
          setActionStatus(messageId, action.id, "accepted")
          return
        }

        if (action.kind === "add_basic") {
          const resolved = resolveAddSourceBasic(
            trip,
            sources,
            action.source_id,
            action.source_basic_id,
          )
          if (!resolved.ok) {
            failAction(
              messageId,
              action.id,
              resolved.reason === "duplicate"
                ? "Esa oferta ya está en Básicos"
                : "Esa oferta ya no está en las fuentes",
            )
            return
          }
          addBasicToTrip(tripId, resolved.basic)
          setActionStatus(messageId, action.id, "accepted")
          return
        }

        if (action.kind === "set_task_cost") {
          const resolved = resolveSetTaskCost(trip, action.task_ref, action.cost)
          if (!resolved.ok) {
            failAction(messageId, action.id, "Esa reserva ya no está en el viaje")
            return
          }
          setTaskState(tripId, resolved.taskKey, { cost: resolved.cost })
          setActionStatus(messageId, action.id, "accepted")
          return
        }

        if (action.source_id && action.source_item_id) {
          const resolved = resolveConsolidateSourceItem(
            trip,
            sources,
            action.source_id,
            action.source_item_id,
            action.day_id,
          )
          if (!resolved.ok) {
            failAction(
              messageId,
              action.id,
              resolved.reason === "duplicate"
                ? "Esa parada ya está en ese día"
                : resolved.reason === "day_missing"
                  ? "Ese día ya no está en el viaje"
                  : "Esa parada ya no está en las fuentes",
            )
            return
          }
          addItemsToDay(tripId, resolved.dayId, [resolved.item])
          setActionStatus(messageId, action.id, "accepted")
          return
        }

        if (action.kind !== "add_item") return
        const dayExists = trip.days.some((d) => d.id === action.day_id)
        if (!dayExists) {
          failAction(messageId, action.id, "Ese día ya no está en el viaje")
          return
        }
        const itemType = (["transport", "stay", "food", "activity"] as ItemType[]).includes(
          action.type,
        )
          ? action.type
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
      } finally {
        setActionBusyId(null)
      }
    },
    [
      trip,
      sources,
      addedSourceUrls,
      startSourceExtraction,
      addItemToDay,
      addItemsToDay,
      moveItemBetweenDays,
      removeItemFromDay,
      addExtraTask,
      addBasicToTrip,
      setTaskState,
      setActionStatus,
      failAction,
      markUndoable,
      tripId,
    ],
  )

  const handleUndoAction = useCallback(
    (_messageId: string, action: ChatAction) => {
      const payload = undoByActionIdRef.current.get(action.id)
      if (!payload || !trip) return
      if (payload.type === "move") {
        moveItemBetweenDays(tripId, payload.inverse)
      } else if (payload.type === "swap") {
        const resolved = resolveSwapItems(trip.days, payload.itemIdA, payload.itemIdB)
        if (resolved.ok) {
          moveItemBetweenDays(tripId, resolved.moves[0])
          moveItemBetweenDays(tripId, resolved.moves[1])
        }
      } else {
        addItemToDay(tripId, payload.dayId, payload.item)
        moveItemBetweenDays(tripId, {
          fromDayId: payload.dayId,
          toDayId: payload.dayId,
          itemId: payload.item.id,
          toIndex: payload.index,
        })
        if (payload.cost != null) {
          setTaskState(tripId, payload.taskKey, { cost: payload.cost })
        }
      }
      undoByActionIdRef.current.delete(action.id)
      setUndoableIds((prev) => {
        const next = new Set(prev)
        next.delete(action.id)
        return next
      })
      setUndoneIds((prev) => new Set(prev).add(action.id))
    },
    [trip, tripId, moveItemBetweenDays, addItemToDay, setTaskState],
  )

  const handleDismissAction = useCallback(
    (messageId: string, action: ChatAction) => {
      setActionStatus(messageId, action.id, "dismissed")
    },
    [setActionStatus],
  )

  /**
   * Identidad estable para `memo(MessageBubble)`: los tres handlers dependen de
   * `trip`, que cambia en cada mutación. El cuerpo se lee por ref, así que sigue
   * viendo el viaje actual sin invalidar el memo de cada mensaje.
   */
  const handlersRef = useRef({
    handleAddSourceLink,
    handleAcceptAction,
    handleDismissAction,
    handleUndoAction,
  })
  // eslint-disable-next-line react-hooks/refs -- ref de "último valor": la escritura en render es idempotente y solo se lee desde manejadores de eventos.
  handlersRef.current = {
    handleAddSourceLink,
    handleAcceptAction,
    handleDismissAction,
    handleUndoAction,
  }
  const onAddSourceLink = useCallback(
    (url: string) => handlersRef.current.handleAddSourceLink(url),
    [],
  )
  const onAcceptAction = useCallback(
    (messageId: string, action: ChatAction) =>
      handlersRef.current.handleAcceptAction(messageId, action),
    [],
  )
  const onDismissAction = useCallback(
    (messageId: string, action: ChatAction) =>
      handlersRef.current.handleDismissAction(messageId, action),
    [],
  )
  const onUndoAction = useCallback(
    (messageId: string, action: ChatAction) =>
      handlersRef.current.handleUndoAction(messageId, action),
    [],
  )

  const handleNewConversation = () => {
    newConversation()
    setView("chat")
  }

  const handleOpenConversation = (id: string) => {
    openConversation(id)
    setView("chat")
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    deleteConversation(pendingDelete.id)
    setPendingDelete(null)
  }

  // Panel desktop: siempre montado; el slot padre oculta con content-visibility + inert.
  // (Legacy del overlay: `return null` reintroducía montaje perezoso al hacer clic.)

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
      role="region"
      aria-label="Asistente de viaje"
      aria-hidden={isSection && !open ? true : undefined}
      className={cn(
        "relative flex min-h-0 flex-col overflow-hidden bg-background",
        isSection
          ? cn(
              /*
               * Sección móvil: chat con composer anclado al teclado, así que
               * conserva shell fijo mientras el resto de `/trips` scrollea el
               * documento. `/trips/[tripId]` congela el documento arriba
               * mientras está activa, así que `fixed` cae justo bajo el header.
               */
              "@container fixed inset-x-0 bottom-0 top-[var(--wp-header-height)] z-10",
              open ? "visible" : "invisible pointer-events-none",
            )
          : "h-full w-full",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-2",
          isSection
            ? "overflow-hidden px-4 transition-[max-height,opacity,padding] duration-200 ease-out"
            : "h-12 border-b border-border/60 px-3 @md:px-4",
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
            {isPanel ? (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center text-foreground">
                <Sparkles className="h-4 w-4" aria-hidden />
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
            <button
              type="button"
              onClick={() => setView("history")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Historial de conversaciones"
              title="Historial"
            >
              <History className="h-3.5 w-3.5" />
            </button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
              onClick={handleNewConversation}
              disabled={isStreaming}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden @md:inline">Nueva conversación</span>
              <span className="@md:hidden">Nueva</span>
            </Button>
          </>
        )}
      </div>

      {showHistory ? (
        <ScrollArea className="min-h-0 flex-1">
          <div
            className={cn(
              "space-y-3 p-4",
              isSection && "pb-[var(--wp-nav-clearance)]",
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pt-2 pb-[var(--wp-nav-gap)]">
          <div
            className={cn(
              "pointer-events-auto rounded-2xl",
              "border border-border/60 bg-background",
              "shadow-[0_10px_40px_-12px_rgba(0,0,0,0.28)]",
            )}
          >
            {bottomNav}
          </div>
        </div>
      ) : null}

      {!showHistory ? (
        <>
          <div ref={chatScrollRef} className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              <div className="space-y-3 p-4">
                {messages.length === 0 && (hydrated || canShowSuggestionsEarly) ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Pregúntame sobre tus fuentes, el plan o requisitos oficiales. Puedo buscar en
                    internet y proponer fuentes o ítems para que tú confirmes.
                  </p>
                ) : !hydrated ? null : (
                  messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      isStreamingTail={m.id === streamingTailId}
                      actionBusyId={actionBusyId}
                      currency={(trip?.currency || "EUR").toUpperCase()}
                      undoableIds={undoableIds}
                      undoneIds={undoneIds}
                      staleActionIds={staleActionIds}
                      onAcceptAction={onAcceptAction}
                      onDismissAction={onDismissAction}
                      onUndoAction={onUndoAction}
                      onAddSourceLink={onAddSourceLink}
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

                {assistantLoading && !statusLabel ? (
                  <div className="flex justify-start">
                    <StatusPill label="Añadiendo fuente…" />
                  </div>
                ) : null}

                {error ? (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {error}
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
                    height:
                      Math.max(composerHeight, 64) +
                      20 +
                      (isSection && keyboardOpen ? keyboardInset : 0),
                  }}
                />
              </div>
            </ScrollArea>
          </div>

          {/* Composer flotante: fondo transparente para que la conversación corra por detrás. */}
          <div
            ref={composerRef}
            className={cn(
              "pointer-events-none absolute inset-x-0 z-20 px-3 pt-3 transition-[bottom] duration-200 ease-out",
              // Móvil + teclado: pegado al teclado. Sin teclado: alineado con el dock flotante.
              isSection && keyboardOpen
                ? "pb-2"
                : isSection
                  ? "pb-[var(--wp-nav-gap)]"
                  : "pb-3",
            )}
            style={{
              bottom: isSection && keyboardOpen ? keyboardInset : 0,
            }}
          >
            {aiConsent === true &&
            messages.length === 0 &&
            suggestions.length > 0 &&
            (hydrated || canShowSuggestionsEarly) ? (
              <div className="pointer-events-auto mb-2">
                <SuggestionChips
                  prompts={suggestions}
                  layout="stack"
                  disabled={!trip}
                  onPick={(s) => void send(s)}
                />
              </div>
            ) : aiConsent === true && composerFollowups.length > 0 ? (
              <div className="pointer-events-auto mb-2">
                <SuggestionChips
                  prompts={composerFollowups}
                  layout="row"
                  disabled={!trip}
                  onPick={(s) => void send(s)}
                />
              </div>
            ) : null}
            <div
              className={cn(
                "pointer-events-auto overflow-hidden rounded-2xl border border-border/60",
                isPanel
                  ? "bg-background"
                  : "bg-background shadow-[0_10px_40px_-12px_rgba(0,0,0,0.28)]",
              )}
            >
              {aiConsent === true ? (
                <ChatComposer
                  inputRef={inputRef}
                  disabled={!trip}
                  isStreaming={isStreaming}
                  onSend={handleComposerSend}
                  onStop={stop}
                  conversationKey={activeConversationId}
                />
              ) : (
                <AiTransferGate
                  ready={aiConsent !== null && Boolean(userId)}
                  onAccept={() => {
                    if (!userId) return
                    rememberAiTransferConsent(userId)
                    setAiConsent(true)
                    // La constancia va en diferido: si falla, no se le cierra la puerta.
                    if (isSupabaseConfigured()) {
                      void recordAiTransferConsent(createClient(), userId)
                    }
                  }}
                />
              )}

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
