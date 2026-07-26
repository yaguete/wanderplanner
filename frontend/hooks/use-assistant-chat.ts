"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Source, Trip } from "@/types/itinerary"
import {
  streamAssistant,
  type AssistantAction,
  type AssistantChatMessage,
} from "@/lib/assistant-api"
import { buildTripBriefing } from "@/lib/assistant-context"
import {
  deriveConversationTitle,
  loadAssistantState,
  saveAssistantState,
  type PersistedAssistantConversation,
  type PersistedAssistantMessage,
  type PersistedAssistantTripState,
} from "@/lib/assistant-persistence"

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

function sortByUpdatedDesc(a: PersistedAssistantConversation, b: PersistedAssistantConversation) {
  return b.updatedAt.localeCompare(a.updatedAt)
}

function toSummary(c: PersistedAssistantConversation): AssistantConversationSummary {
  return {
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt,
    createdAt: c.createdAt,
    messageCount: c.messages.filter((m) => !isEmptyAssistant(m as ChatMessage)).length,
  }
}

export function useAssistantChat(tripId: string, trip: Trip | undefined, sources: Source[]) {
  const [conversations, setConversations] = useState<PersistedAssistantConversation[]>([])
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

  tripRef.current = trip
  sourcesRef.current = sources
  conversationsRef.current = conversations
  activeIdRef.current = activeConversationId
  messagesRef.current = messages

  const persistSnapshot = useCallback(
    (
      nextConversations: PersistedAssistantConversation[],
      nextActiveId: string | null,
    ) => {
      const state: PersistedAssistantTripState = {
        version: 1,
        tripId,
        activeConversationId: nextActiveId,
        conversations: nextConversations,
        updatedAt: new Date().toISOString(),
      }
      saveAssistantState(state)
    },
    [tripId],
  )

  useEffect(() => {
    skipPersistRef.current = true
    const saved = loadAssistantState(tripId)
    setConversations(saved.conversations)
    setActiveConversationId(saved.activeConversationId)
    const active = saved.conversations.find((c) => c.id === saved.activeConversationId)
    setMessages((active?.messages as ChatMessage[]) ?? [])
    setError(null)
    setIsStreaming(false)
    setStatusLabel(null)
    setHydrated(true)
    // Permitir el siguiente ciclo de persistencia tras hidratar
    requestAnimationFrame(() => {
      skipPersistRef.current = false
    })
  }, [tripId])

  // Persistir mensajes de la conversación activa (o drafts vacíos no guardados hasta el 1er mensaje)
  useEffect(() => {
    if (!hydrated || skipPersistRef.current) return

    const activeId = activeIdRef.current
    const toSave = messages.filter((m) => !isEmptyAssistant(m)) as PersistedAssistantMessage[]

    // Chat vacío sin id → no crear entrada hasta el primer mensaje
    if (!activeId) {
      if (toSave.length === 0) return
      // No debería ocurrir: newConversation deja id null hasta send; send crea la conversación
      return
    }

    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === activeId)
      if (idx < 0) {
        // Conversación aún no en la lista: solo persistir si hay mensajes
        if (toSave.length === 0) {
          persistSnapshot(prev, activeId)
          return prev
        }
        const now = new Date().toISOString()
        const created: PersistedAssistantConversation = {
          id: activeId,
          title: deriveConversationTitle(toSave),
          messages: toSave,
          createdAt: now,
          updatedAt: now,
        }
        const next = [created, ...prev]
        persistSnapshot(next, activeId)
        return next
      }

      const existing = prev[idx]!
      const nextConv: PersistedAssistantConversation = {
        ...existing,
        messages: toSave,
        title: deriveConversationTitle(toSave) || existing.title,
        updatedAt: new Date().toISOString(),
      }
      const next = [...prev]
      next[idx] = nextConv
      persistSnapshot(next, activeId)
      return next
    })
  }, [messages, tripId, hydrated, persistSnapshot])

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
    // No persistimos conversaciones vacías; active queda null hasta el primer send
    persistSnapshot(conversationsRef.current, null)
  }, [stop, persistSnapshot])

  const openConversation = useCallback(
    (conversationId: string) => {
      stop()
      setError(null)
      const conv = conversationsRef.current.find((c) => c.id === conversationId)
      if (!conv) return
      skipPersistRef.current = true
      setActiveConversationId(conversationId)
      setMessages((conv.messages as ChatMessage[]) ?? [])
      persistSnapshot(conversationsRef.current, conversationId)
      requestAnimationFrame(() => {
        skipPersistRef.current = false
      })
    },
    [stop, persistSnapshot],
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
      persistSnapshot(remaining, nextActive)
      requestAnimationFrame(() => {
        skipPersistRef.current = false
      })
    },
    [stop, persistSnapshot],
  )

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      const currentTrip = tripRef.current
      if (!trimmed || !currentTrip || isStreaming) return

      setError(null)

      // Crear conversación al primer mensaje si no hay activa
      let convId = activeIdRef.current
      if (!convId) {
        convId = crypto.randomUUID()
        setActiveConversationId(convId)
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
      const briefing = buildTripBriefing(currentTrip, sourcesRef.current)
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
          countries: currentTrip.countries ?? [],
          messages: history,
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
            const chatAction: ChatAction = {
              ...action,
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
          onError: (message) => {
            setError(message)
            setIsStreaming(false)
            setStatusLabel(null)
            abortRef.current = null
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
    [isStreaming],
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
