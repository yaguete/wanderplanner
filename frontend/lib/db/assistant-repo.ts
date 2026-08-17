/**
 * Conversaciones del asistente en Supabase (`assistant_conversations`, una fila por conversación
 * con `messages jsonb`). Sustituye a `lib/assistant-persistence.ts`.
 *
 * `activeConversationId` no se guarda aquí: es preferencia de UI y vive en localStorage
 * por usuario y viaje. Al borrar un viaje, las filas caen por `on delete cascade`.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AssistantAction } from "@/lib/assistant-api"

export type AssistantMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  actions?: Array<AssistantAction & { id: string; status: "pending" | "accepted" | "dismissed" }>
  followups?: string[]
}

export type AssistantConversation = {
  id: string
  tripId: string
  title: string
  messages: AssistantMessage[]
  createdAt: string
  updatedAt: string
}

type ConversationRow = {
  id: string
  trip_id: string
  title: string
  messages: AssistantMessage[] | null
  created_at: string
  updated_at: string
}

const ACTIVE_KEY_PREFIX = "wanderplanner:assistant-active:"

function activeKey(userId: string, tripId: string): string {
  return `${ACTIVE_KEY_PREFIX}${userId}:${tripId}`
}

function legacyActiveKey(tripId: string): string {
  return `${ACTIVE_KEY_PREFIX}${tripId}`
}

/** Título local a partir del primer mensaje del usuario. */
export function deriveConversationTitle(messages: AssistantMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user" && m.content.trim())
  if (!firstUser) return "Nueva conversación"
  const text = firstUser.content.trim().replace(/\s+/g, " ")
  if (text.length <= 48) return text
  return `${text.slice(0, 45).trimEnd()}…`
}

function rowToConversation(row: ConversationRow): AssistantConversation {
  return {
    id: row.id,
    tripId: row.trip_id,
    title: row.title,
    messages: row.messages ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function loadConversations(
  supabase: SupabaseClient,
  tripId: string,
): Promise<AssistantConversation[]> {
  const { data, error } = await supabase
    .from("assistant_conversations")
    .select("id, trip_id, title, messages, created_at, updated_at")
    .eq("trip_id", tripId)
    .order("updated_at", { ascending: false })

  if (error) throw error
  return ((data ?? []) as unknown as ConversationRow[]).map(rowToConversation)
}

export async function upsertConversation(
  supabase: SupabaseClient,
  userId: string,
  conversation: AssistantConversation,
): Promise<void> {
  const { error } = await supabase.from("assistant_conversations").upsert(
    {
      id: conversation.id,
      user_id: userId,
      trip_id: conversation.tripId,
      title: conversation.title,
      messages: conversation.messages,
    },
    { onConflict: "id" },
  )
  if (error) throw error
}

export async function deleteConversationRow(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<void> {
  const { error } = await supabase
    .from("assistant_conversations")
    .delete()
    .eq("id", conversationId)
  if (error) throw error
}

// ── Preferencia local de conversación activa ─────────────────────────────────

export function loadActiveConversationId(userId: string, tripId: string): string | null {
  if (typeof window === "undefined") return null
  try {
    const scoped = localStorage.getItem(activeKey(userId, tripId))
    if (scoped) return scoped

    // Migración one-shot desde la clave legacy (sin userId).
    const legacy = localStorage.getItem(legacyActiveKey(tripId))
    if (!legacy) return null
    localStorage.setItem(activeKey(userId, tripId), legacy)
    localStorage.removeItem(legacyActiveKey(tripId))
    return legacy
  } catch {
    return null
  }
}

export function saveActiveConversationId(
  userId: string,
  tripId: string,
  id: string | null,
): void {
  if (typeof window === "undefined") return
  try {
    const key = activeKey(userId, tripId)
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
    // Evita que una clave legacy restaure la conversación tras un login limpio.
    localStorage.removeItem(legacyActiveKey(tripId))
  } catch {
    /* cuota / modo privado */
  }
}

/**
 * Borra solo los punteros locales de conversación activa.
 * No toca filas de Supabase (el histórico permanece).
 */
export function clearActiveConversationPointers(): void {
  if (typeof window === "undefined") return
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(ACTIVE_KEY_PREFIX)) toRemove.push(key)
    }
    for (const key of toRemove) localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

// ── Guardado debounced ────────────────────────────────────────────────────────

const DEBOUNCE_MS = 800

/** Agrupa escrituras por conversación; una instancia por sesión de asistente. */
export class ConversationSyncer {
  private readonly supabase: SupabaseClient
  private readonly userId: string
  private readonly onError: (error: unknown) => void
  private pending = new Map<string, AssistantConversation>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private queue: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(
    supabase: SupabaseClient,
    userId: string,
    onError: (error: unknown) => void = () => {},
  ) {
    this.supabase = supabase
    this.userId = userId
    this.onError = onError
  }

  schedule(conversation: AssistantConversation): void {
    if (this.disposed) return
    this.pending.set(conversation.id, conversation)
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, DEBOUNCE_MS)
  }

  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.pending.size === 0) return this.queue
    const batch = [...this.pending.values()]
    this.pending.clear()

    this.queue = this.queue
      .then(async () => {
        for (const conversation of batch) {
          await upsertConversation(this.supabase, this.userId, conversation)
        }
      })
      .catch((e) => {
        this.onError(e)
      })
    return this.queue
  }

  /** La conversación ya no existe: cancela su escritura pendiente. */
  drop(conversationId: string): void {
    this.pending.delete(conversationId)
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending.clear()
  }
}
