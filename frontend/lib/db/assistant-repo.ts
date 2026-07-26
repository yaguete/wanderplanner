/**
 * Conversaciones del asistente en Supabase (`assistant_conversations`, una fila por conversación
 * con `messages jsonb`). Sustituye a `lib/assistant-persistence.ts`.
 *
 * `activeConversationId` no se guarda aquí: es preferencia de UI y vive en localStorage por viaje.
 * Al borrar un viaje, las filas caen por `on delete cascade`.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AssistantAction } from "@/lib/assistant-api"

export type AssistantMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  actions?: Array<AssistantAction & { id: string; status: "pending" | "accepted" | "dismissed" }>
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

export function loadActiveConversationId(tripId: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(`${ACTIVE_KEY_PREFIX}${tripId}`)
  } catch {
    return null
  }
}

export function saveActiveConversationId(tripId: string, id: string | null): void {
  if (typeof window === "undefined") return
  try {
    const key = `${ACTIVE_KEY_PREFIX}${tripId}`
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
  } catch {
    /* cuota / modo privado */
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
