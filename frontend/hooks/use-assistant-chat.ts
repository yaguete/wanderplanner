"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Source, Trip } from "@/types/itinerary"
import {
  streamAssistant,
  type AssistantAction,
  type AssistantChatMessage,
} from "@/lib/assistant-api"
import { ApiLimitError } from "@/lib/api"
import {
  buildTripBriefing,
  buildUserProfileBriefing,
  preferredDomainsFrom,
} from "@/lib/assistant-context"
import { snapshotMoveProposal } from "@/lib/assistant-actions"
import { resolveTripCountryCodes } from "@/lib/countries"
import {
  ConversationSyncer,
  deleteConversationRow,
  deriveConversationTitle,
  loadActiveConversationId,
  loadConversations,
  saveActiveConversationId,
  type AssistantConversation,
  type AssistantMessage,
} from "@/lib/db/assistant-repo"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { useAuth } from "@/lib/auth-context"
import { useTrips } from "@/lib/trip-context"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { hasAiTransferConsent } from "@/lib/ai-transfer-consent"
import { toast } from "sonner"

export type ChatAction = AssistantAction & {
  id: string
  status: "pending" | "accepted" | "dismissed"
}

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  actions?: ChatAction[]
}

export type AssistantConversationSummary = {
  id: string
  title: string
  updatedAt: string
  createdAt: string
  messageCount: number
}

const TOOL_STATUS: Record<string, string> = {
  web_search: "Buscando en internet…",
  fetch_url: "Leyendo página…",
  get_country_brief: "Consultando ficha país…",
  propose_add_source: "Preparando propuesta…",
  propose_add_item: "Preparando propuesta…",
  propose_move_item: "Preparando cambio de día…",
}

/** Une bocadillos consecutivos del asistente al enviar historial al API. */
function toApiHistory(messages: ChatMessage[]): AssistantChatMessage[] {
  const out: AssistantChatMessage[] = []
  for (const m of messages) {
    const content = m.content.trim()
    if (!content) continue
    const last = out[out.length - 1]
    if (last && last.role === m.role && m.role === "assistant") {
      last.content = `${last.content}\n\n${content}`
    } else {
      out.push({ role: m.role, content })
    }
  }
  return out
}

function isEmptyAssistant(m: ChatMessage): boolean {
  return m.role === "assistant" && !m.content.trim() && !(m.actions?.length)
}

function sortByUpdatedDesc(a: AssistantConversation, b: AssistantConversation) {
  return b.updatedAt.localeCompare(a.updatedAt)
}

function toSummary(c: AssistantConversation): AssistantConversationSummary {
  return {
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt,
    createdAt: c.createdAt,
    messageCount: c.messages.filter((m) => !isEmptyAssistant(m as ChatMessage)).length,
  }
}

export function useAssistantChat(tripId: string, trip: Trip | undefined, sources: Source[]) {
  const { user, profile, favoriteReferences } = useAuth()
  const { loadTripSourcesWithArticles } = useTrips()
  const { requireAccount } = useRegistrationGate()
  const userId = user?.id ?? null
  const profileRef = useRef(profile)
  const referencesRef = useRef(favoriteReferences)
  profileRef.current = profile
  referencesRef.current = favoriteReferences
  const [conversations, setConversations] = useState<AssistantConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [statusLabel, setStatusLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const tripRef = useRef(trip)
  const sourcesRef = useRef(sources)
  const conversationsRef = useRef(conversations)
  const activeIdRef = useRef(activeConversationId)
  const messagesRef = useRef(messages)
  const skipPersistRef = useRef(false)
  const syncerRef = useRef<ConversationSyncer | null>(null)

  tripRef.current = trip
  sourcesRef.current = sources
  conversationsRef.current = conversations
  activeIdRef.current = activeConversationId
  messagesRef.current = messages

  /** La conversación activa se recuerda en local: es preferencia de UI, no dato del viaje. */
  const persistActiveId = useCallback(
    (nextActiveId: string | null) => {
      if (!userId) return
      saveActiveConversationId(userId, tripId, nextActiveId)
    },
    [tripId, userId],
  )

  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) {
      setConversations([])
      setActiveConversationId(null)
      setMessages([])
      setHydrated(false)
      return
    }

    const supabase = createClient()
    syncerRef.current?.dispose()
    syncerRef.current = new ConversationSyncer(supabase, userId)

    let active = true
    skipPersistRef.current = true
    setHydrated(false)
    setError(null)
    setIsStreaming(false)
    setStatusLabel(null)

    void (async () => {
      let loaded: AssistantConversation[] = []
      try {
        loaded = await loadConversations(supabase, tripId)
      } catch {
        loaded = []
      }
      if (!active) return

      // Sin puntero activo válido → chat limpio (p. ej. tras login). El histórico sigue en `loaded`.
      const preferred = loadActiveConversationId(userId, tripId)
      const activeId =
        preferred && loaded.some((c) => c.id === preferred) ? preferred : null

      setConversations(loaded)
      setActiveConversationId(activeId)
      setMessages((loaded.find((c) => c.id === activeId)?.messages as ChatMessage[]) ?? [])
      setHydrated(true)
      requestAnimationFrame(() => {
        skipPersistRef.current = false
      })
    })()

    return () => {
      active = false
      void syncerRef.current?.flush()
    }
  }, [tripId, userId])

  // Persistir mensajes de la conversación activa (los drafts vacíos no crean fila)
  useEffect(() => {
    if (!hydrated || skipPersistRef.current) return

    const activeId = activeIdRef.current
    const toSave = messages.filter((m) => !isEmptyAssistant(m)) as AssistantMessage[]
    if (!activeId || toSave.length === 0) return

    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === activeId)
      const now = new Date().toISOString()

      if (idx < 0) {
        const created: AssistantConversation = {
          id: activeId,
          tripId,
          title: deriveConversationTitle(toSave),
          messages: toSave,
          createdAt: now,
          updatedAt: now,
        }
        syncerRef.current?.schedule(created)
        return [created, ...prev]
      }

      const existing = prev[idx]!
      const nextConv: AssistantConversation = {
        ...existing,
        messages: toSave,
        title: deriveConversationTitle(toSave) || existing.title,
        updatedAt: now,
      }
      syncerRef.current?.schedule(nextConv)
      const next = [...prev]
      next[idx] = nextConv
      return next
    })
  }, [messages, tripId, hydrated])

  // No perder el último tramo del debounce al cerrar la pestaña.
  useEffect(() => {
    const flush = () => {
      void syncerRef.current?.flush()
    }
    window.addEventListener("pagehide", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
      flush()
    }
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
    setStatusLabel(null)
  }, [])

  const newConversation = useCallback(() => {
    stop()
    setError(null)
    setActiveConversationId(null)
    setMessages([])
    // No se crea fila hasta el primer mensaje: `active` queda null hasta el send
    persistActiveId(null)
  }, [stop, persistActiveId])

  const openConversation = useCallback(
    (conversationId: string) => {
      stop()
      setError(null)
      const conv = conversationsRef.current.find((c) => c.id === conversationId)
      if (!conv) return
      skipPersistRef.current = true
      setActiveConversationId(conversationId)
      setMessages((conv.messages as ChatMessage[]) ?? [])
      persistActiveId(conversationId)
      requestAnimationFrame(() => {
        skipPersistRef.current = false
      })
    },
    [stop, persistActiveId],
  )

  const deleteConversation = useCallback(
    (conversationId: string) => {
      stop()
      setError(null)
      const remaining = conversationsRef.current
        .filter((c) => c.id !== conversationId)
        .sort(sortByUpdatedDesc)
      const wasActive = activeIdRef.current === conversationId
      const nextActive = wasActive ? remaining[0]?.id ?? null : activeIdRef.current
      const nextMessages =
        wasActive
          ? ((remaining[0]?.messages as ChatMessage[]) ?? [])
          : messagesRef.current

      skipPersistRef.current = true
      setConversations(remaining)
      setActiveConversationId(nextActive)
      if (wasActive) setMessages(nextMessages)
      persistActiveId(nextActive)

      syncerRef.current?.drop(conversationId)
      if (isSupabaseConfigured()) {
        void deleteConversationRow(createClient(), conversationId).catch(() => {
          setError("No hemos podido borrar la conversación.")
        })
      }

      requestAnimationFrame(() => {
        skipPersistRef.current = false
      })
    },
    [stop, persistActiveId],
  )

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      const currentTrip = tripRef.current
      if (!trimmed || !currentTrip || isStreaming) return
      // Cinturón: el dock ya tapa el composer sin consentimiento, pero el envío
      // no puede depender de que la UI esté bien montada.
      if (!hasAiTransferConsent(userId)) return

      setError(null)

      // Crear conversación al primer mensaje si no hay activa
      let convId = activeIdRef.current
      if (!convId) {
        convId = crypto.randomUUID()
        activeIdRef.current = convId
        setActiveConversationId(convId)
        persistActiveId(convId)
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
      }

      let currentAssistantId = crypto.randomUUID()
      let openNewBubble = false
      const assistantMsg: ChatMessage = {
        id: currentAssistantId,
        role: "assistant",
        content: "",
        actions: [],
      }

      const baseMessages = messagesRef.current
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsStreaming(true)
      setStatusLabel("Pensando…")

      const history = toApiHistory([...baseMessages, userMsg])
      // El HTML del artículo se carga bajo demanda: sin él, el briefing perdería el texto.
      let briefingSources = sourcesRef.current
      try {
        briefingSources = await loadTripSourcesWithArticles(currentTrip.id)
      } catch {
        /* se envía el briefing con lo que haya en memoria */
      }
      const briefing = buildTripBriefing(currentTrip, briefingSources)
      const controller = new AbortController()
      abortRef.current = controller

      const startNewBubbleIfNeeded = () => {
        if (!openNewBubble) return
        openNewBubble = false
        const prevId = currentAssistantId
        const newId = crypto.randomUUID()
        currentAssistantId = newId
        setMessages((prev) => {
          const cleaned = prev.filter((m) => m.id !== prevId || !isEmptyAssistant(m))
          return [...cleaned, { id: newId, role: "assistant", content: "", actions: [] }]
        })
      }

      await streamAssistant(
        {
          trip_briefing: briefing,
          // createTrip deja countries vacío: inferimos UG/etc. del nombre y fuentes
          // para precargar la ficha MAE en el prompt.
          countries: resolveTripCountryCodes(currentTrip, briefingSources),
          messages: history,
          user_profile: buildUserProfileBriefing(
            profileRef.current,
            referencesRef.current,
          ),
          preferred_domains: preferredDomainsFrom(referencesRef.current),
        },
        {
          onStatus: (label) => setStatusLabel(label),
          onSegment: () => {
            openNewBubble = true
          },
          onDelta: (delta) => {
            startNewBubbleIfNeeded()
            setStatusLabel(null)
            const id = currentAssistantId
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)),
            )
          },
          onTool: ({ name, status }) => {
            if (status === "running") {
              openNewBubble = true
              setStatusLabel(TOOL_STATUS[name] ?? "Trabajando…")
            }
          },
          onAction: (action) => {
            const snapshotted =
              action.kind === "move_item"
                ? {
                    ...action,
                    ...snapshotMoveProposal(currentTrip.days, action),
                  }
                : action
            const chatAction: ChatAction = {
              ...snapshotted,
              id: crypto.randomUUID(),
              status: "pending",
            }
            setMessages((prev) => {
              let attachId = currentAssistantId
              for (let i = prev.length - 1; i >= 0; i--) {
                const m = prev[i]
                if (m.role !== "assistant") continue
                if (m.content.trim() || (m.actions?.length ?? 0) > 0 || m.id === currentAssistantId) {
                  attachId = m.id
                  break
                }
              }
              return prev.map((m) =>
                m.id === attachId ? { ...m, actions: [...(m.actions ?? []), chatAction] } : m,
              )
            })
          },
          onDone: () => {
            setIsStreaming(false)
            setStatusLabel(null)
            abortRef.current = null
            setMessages((prev) => prev.filter((m) => !isEmptyAssistant(m)))
          },
          onError: (err) => {
            setIsStreaming(false)
            setStatusLabel(null)
            abortRef.current = null
            if (err instanceof ApiLimitError && err.limit === "guest") {
              requireAccount("assistant-limit")
              setMessages((prev) => prev.filter((m) => m.id !== currentAssistantId))
              return
            }
            if (err instanceof ApiLimitError) {
              toast.error(err.message)
              setMessages((prev) => prev.filter((m) => m.id !== currentAssistantId))
              return
            }
            const message = typeof err === "string" ? err : "Error del asistente"
            setError(message)
            const id = currentAssistantId
            setMessages((prev) =>
              prev.map((m) =>
                m.id === id
                  ? {
                      ...m,
                      content:
                        m.content.trim() ||
                        "No he podido completar la respuesta. Revisa la conexión o la configuración del API.",
                    }
                  : m,
              ),
            )
          },
        },
        controller.signal,
      )

      setIsStreaming(false)
      setStatusLabel(null)
      abortRef.current = null
    },
    [isStreaming, persistActiveId, loadTripSourcesWithArticles, requireAccount, userId],
  )

  const setActionStatus = useCallback(
    (messageId: string, actionId: string, status: ChatAction["status"]) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id !== messageId
            ? m
            : {
                ...m,
                actions: (m.actions ?? []).map((a) =>
                  a.id === actionId ? { ...a, status } : a,
                ),
              },
        ),
      )
    },
    [],
  )

  const conversationSummaries = useMemo(
    () =>
      [...conversations]
        .sort(sortByUpdatedDesc)
        .map(toSummary),
    [conversations],
  )

  return {
    messages,
    isStreaming,
    statusLabel,
    error,
    send,
    stop,
    setActionStatus,
    hydrated,
    conversations: conversationSummaries,
    activeConversationId,
    newConversation,
    openConversation,
    deleteConversation,
  }
}
