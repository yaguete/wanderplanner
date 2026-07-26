/**
 * Persistencia del asistente por viaje (localStorage).
 * v1: múltiples conversaciones + activeConversationId.
 * Migración lazy desde el hilo único legacy `{ tripId, messages, updatedAt }`.
 */
import type { AssistantAction } from "@/lib/assistant-api"

const KEY_PREFIX = "wanderplanner:assistant:"
const SCHEMA_VERSION = 1 as const

export type PersistedAssistantMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  /** Acciones propuestas asociadas a este mensaje del asistente */
  actions?: Array<AssistantAction & { id: string; status: "pending" | "accepted" | "dismissed" }>
}

export type PersistedAssistantConversation = {
  id: string
  title: string
  messages: PersistedAssistantMessage[]
  createdAt: string
  updatedAt: string
}

export type PersistedAssistantTripState = {
  version: typeof SCHEMA_VERSION
  tripId: string
  activeConversationId: string | null
  conversations: PersistedAssistantConversation[]
  updatedAt: string
}

/** Formato legacy (un único hilo por viaje). */
type LegacyAssistantThread = {
  tripId: string
  messages: PersistedAssistantMessage[]
  updatedAt: string
  version?: never
  conversations?: never
}

function key(tripId: string): string {
  return `${KEY_PREFIX}${tripId}`
}

/** Título local a partir del primer mensaje del usuario. */
export function deriveConversationTitle(messages: PersistedAssistantMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user" && m.content.trim())
  if (!firstUser) return "Nueva conversación"
  const text = firstUser.content.trim().replace(/\s+/g, " ")
  if (text.length <= 48) return text
  return `${text.slice(0, 45).trimEnd()}…`
}

function emptyState(tripId: string): PersistedAssistantTripState {
  const now = new Date().toISOString()
  return {
    version: SCHEMA_VERSION,
    tripId,
    activeConversationId: null,
    conversations: [],
    updatedAt: now,
  }
}

function migrateLegacy(
  tripId: string,
  legacy: LegacyAssistantThread,
): PersistedAssistantTripState {
  const now = legacy.updatedAt || new Date().toISOString()
  if (!Array.isArray(legacy.messages) || legacy.messages.length === 0) {
    return emptyState(tripId)
  }
  const id = crypto.randomUUID()
  const conv: PersistedAssistantConversation = {
    id,
    title: deriveConversationTitle(legacy.messages) || "Conversación inicial",
    messages: legacy.messages,
    createdAt: now,
    updatedAt: now,
  }
  return {
    version: SCHEMA_VERSION,
    tripId,
    activeConversationId: id,
    conversations: [conv],
    updatedAt: now,
  }
}

function isV1State(parsed: unknown): parsed is PersistedAssistantTripState {
  if (!parsed || typeof parsed !== "object") return false
  const o = parsed as Record<string, unknown>
  return (
    o.version === SCHEMA_VERSION &&
    typeof o.tripId === "string" &&
    Array.isArray(o.conversations)
  )
}

function isLegacyThread(parsed: unknown): parsed is LegacyAssistantThread {
  if (!parsed || typeof parsed !== "object") return false
  const o = parsed as Record<string, unknown>
  return (
    typeof o.tripId === "string" &&
    Array.isArray(o.messages) &&
    !Array.isArray(o.conversations) &&
    o.version == null
  )
}

export function loadAssistantState(tripId: string): PersistedAssistantTripState {
  if (typeof window === "undefined") return emptyState(tripId)
  try {
    const raw = localStorage.getItem(key(tripId))
    if (!raw) return emptyState(tripId)
    const parsed: unknown = JSON.parse(raw)
    if (isV1State(parsed) && parsed.tripId === tripId) {
      return {
        ...parsed,
        activeConversationId:
          parsed.activeConversationId &&
          parsed.conversations.some((c) => c.id === parsed.activeConversationId)
            ? parsed.activeConversationId
            : parsed.conversations[0]?.id ?? null,
      }
    }
    if (isLegacyThread(parsed) && parsed.tripId === tripId) {
      const migrated = migrateLegacy(tripId, parsed)
      saveAssistantState(migrated)
      return migrated
    }
    return emptyState(tripId)
  } catch {
    return emptyState(tripId)
  }
}

export function saveAssistantState(state: PersistedAssistantTripState): void {
  if (typeof window === "undefined") return
  try {
    const payload: PersistedAssistantTripState = {
      ...state,
      version: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(key(state.tripId), JSON.stringify(payload))
  } catch {
    /* cuota / modo privado */
  }
}

/** Elimina todo el estado del asistente de un viaje (p. ej. al borrar el viaje). */
export function clearAssistantState(tripId: string): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(key(tripId))
  } catch {
    /* ignore */
  }
}

/** @deprecated Usar clearAssistantState */
export function clearAssistantThread(tripId: string): void {
  clearAssistantState(tripId)
}
