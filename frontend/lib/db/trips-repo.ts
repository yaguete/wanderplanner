/**
 * Persistencia de viajes y fuentes en Supabase (modelo documento).
 *
 * Sustituye a `lib/trip-persistence.ts`: el estado en memoria de `trip-context` sigue siendo
 * síncrono y optimista, y aquí solo se traduce a filas. `days`, `basics` e `items` viajan como
 * jsonb con el mismo camelCase de `types/itinerary.ts`; solo las columnas planas se mapean.
 *
 * Guardado por diffing: como el estado se actualiza de forma inmutable, una fila cambiada es un
 * objeto nuevo. Se comparan referencias contra el último snapshot persistido y se hace upsert
 * solo de lo cambiado, con debounce, cola secuencial y last-write-wins (sin rollback).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Source, Trip, UserBasicItem, UserDay } from "@/types/itinerary"

const DEBOUNCE_MS = 1_000
const MAX_ATTEMPTS = 3

export type TripsSnapshot = { trips: Trip[]; sources: Source[] }

type TripRow = {
  id: string
  user_id: string
  name: string
  countries: string[] | null
  start_date: string | null
  end_date: string | null
  num_days: number | null
  expectations: string | null
  cover: string
  cover_url: string | null
  archived: boolean
  referrer: string | null
  source_ids: string[] | null
  days: UserDay[] | null
  basics: UserBasicItem[] | null
}

type SourceRow = {
  id: string
  user_id: string
  url: string
  author: string
  title: string
  area: string | null
  og_image: string | null
  items: Source["items"] | null
  basics: Source["basics"] | null
  article_html?: string | null
}

const TRIP_COLUMNS =
  "id, name, countries, start_date, end_date, num_days, expectations, cover, cover_url, archived, referrer, source_ids, days, basics"
/** Sin `article_html`: puede ser enorme y solo hace falta al abrir la Crónica. */
const SOURCE_COLUMNS = "id, url, author, title, area, og_image, items, basics"

// ── Mapeo fila ↔ dominio ──────────────────────────────────────────────────────

function rowToTrip(row: TripRow): Trip {
  return {
    id: row.id,
    name: row.name,
    countries: row.countries ?? [],
    startDate: row.start_date,
    endDate: row.end_date,
    numDays: row.num_days,
    expectations: row.expectations,
    cover: row.cover,
    coverUrl: row.cover_url,
    sourceIds: row.source_ids ?? [],
    days: row.days ?? [],
    basics: row.basics ?? [],
    archived: row.archived,
    referrer: row.referrer,
  }
}

function tripToRow(trip: Trip, userId: string): TripRow {
  return {
    id: trip.id,
    user_id: userId,
    name: trip.name,
    countries: trip.countries ?? [],
    start_date: trip.startDate || null,
    end_date: trip.endDate || null,
    num_days: trip.numDays ?? null,
    expectations: trip.expectations?.trim() ? trip.expectations.trim() : null,
    cover: trip.cover || "✈️",
    cover_url: trip.coverUrl || null,
    archived: Boolean(trip.archived),
    referrer: trip.referrer ?? null,
    source_ids: trip.sourceIds ?? [],
    days: trip.days ?? [],
    basics: trip.basics ?? [],
  }
}

function rowToSource(row: SourceRow): Source {
  return {
    id: row.id,
    url: row.url,
    author: row.author,
    title: row.title,
    area: row.area,
    items: row.items ?? [],
    basics: row.basics ?? [],
    articleHtml: row.article_html ?? "",
    ogImage: row.og_image,
  }
}

function sourceToRow(source: Source, userId: string, includeHtml: boolean): SourceRow {
  const row: SourceRow = {
    id: source.id,
    user_id: userId,
    url: source.url,
    author: source.author,
    title: source.title,
    area: source.area,
    og_image: source.ogImage,
    items: source.items ?? [],
    basics: source.basics ?? [],
  }
  if (includeHtml) row.article_html = source.articleHtml ?? ""
  return row
}

// ── Carga ─────────────────────────────────────────────────────────────────────

export async function loadTripsState(
  supabase: SupabaseClient,
  userId: string,
): Promise<TripsSnapshot> {
  const [tripsResult, sourcesResult] = await Promise.all([
    supabase
      .from("trips")
      .select(TRIP_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("sources")
      .select(SOURCE_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ])

  if (tripsResult.error) throw tripsResult.error
  if (sourcesResult.error) throw sourcesResult.error

  return {
    trips: ((tripsResult.data ?? []) as unknown as TripRow[]).map(rowToTrip),
    sources: ((sourcesResult.data ?? []) as unknown as SourceRow[]).map(rowToSource),
  }
}

/**
 * Viaje borrador del CTA de un blog partner. Se inserta directamente (fuera de `trip-context`,
 * que solo vive bajo `/trips`) para poder redirigir al detalle con el id ya creado.
 */
export async function insertDraftTrip(
  supabase: SupabaseClient,
  userId: string,
  data: { name: string; referrer: string | null },
): Promise<string> {
  const id = crypto.randomUUID()
  const { error } = await supabase.from("trips").insert({
    id,
    user_id: userId,
    name: data.name,
    num_days: 1,
    days: [{ id: crypto.randomUUID(), label: "", items: [] }],
    basics: [],
    source_ids: [],
    referrer: data.referrer,
  })
  if (error) throw error
  return id
}

/** HTML del artículo bajo demanda (al abrir la pestaña Crónica). */
export async function fetchArticleHtml(
  supabase: SupabaseClient,
  sourceId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("sources")
    .select("article_html")
    .eq("id", sourceId)
    .maybeSingle<{ article_html: string | null }>()

  if (error) throw error
  return data?.article_html ?? ""
}

// ── Guardado ──────────────────────────────────────────────────────────────────

async function withRetry(run: () => Promise<void>): Promise<void> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await run()
      return
    } catch (e) {
      lastError = e
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt))
      }
    }
  }
  throw lastError
}

/**
 * Sincroniza snapshots del contexto contra Supabase.
 * Una instancia por sesión de usuario; `reset` tras la carga inicial.
 */
export class TripsSyncer {
  private readonly supabase: SupabaseClient
  private readonly userId: string
  private readonly onError: (error: unknown) => void

  /** Última versión persistida por id: la comparación es por referencia de objeto. */
  private savedTrips = new Map<string, Trip>()
  private savedSources = new Map<string, Source>()
  /** Fuentes cargadas sin `article_html`: no debemos sobrescribirlo con "". */
  private deferredHtml = new Set<string>()

  private latest: TripsSnapshot | null = null
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

  /** Marca un snapshot como ya persistido (tras `loadTripsState`). */
  reset(snapshot: TripsSnapshot): void {
    this.savedTrips = new Map(snapshot.trips.map((t) => [t.id, t]))
    this.savedSources = new Map(snapshot.sources.map((s) => [s.id, s]))
    this.deferredHtml = new Set(snapshot.sources.map((s) => s.id))
    this.latest = null
  }

  /** Tras cargar el HTML de una fuente: evita reescribirlo en el siguiente upsert. */
  acknowledgeSource(source: Source): void {
    this.savedSources.set(source.id, source)
    this.deferredHtml.delete(source.id)
  }

  schedule(snapshot: TripsSnapshot): void {
    if (this.disposed) return
    this.latest = snapshot
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, DEBOUNCE_MS)
  }

  /** Fuerza el guardado pendiente (p. ej. en `pagehide`). */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const snapshot = this.latest
    if (!snapshot) return this.queue
    this.latest = null

    this.queue = this.queue
      .then(() => withRetry(() => this.persist(snapshot)))
      .catch((e) => {
        this.onError(e)
      })
    return this.queue
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.latest = null
  }

  private async persist(snapshot: TripsSnapshot): Promise<void> {
    const tripRows: TripRow[] = []
    const currentTripIds = new Set<string>()
    for (const trip of snapshot.trips) {
      currentTripIds.add(trip.id)
      if (this.savedTrips.get(trip.id) !== trip) {
        tripRows.push(tripToRow(trip, this.userId))
      }
    }

    // Dos lotes: PostgREST exige el mismo juego de columnas dentro de cada upsert.
    const sourceRowsWithHtml: SourceRow[] = []
    const sourceRowsWithoutHtml: SourceRow[] = []
    const currentSourceIds = new Set<string>()
    for (const source of snapshot.sources) {
      currentSourceIds.add(source.id)
      if (this.savedSources.get(source.id) === source) continue
      const skipHtml = this.deferredHtml.has(source.id) && !source.articleHtml
      if (skipHtml) sourceRowsWithoutHtml.push(sourceToRow(source, this.userId, false))
      else sourceRowsWithHtml.push(sourceToRow(source, this.userId, true))
    }

    const removedTripIds = [...this.savedTrips.keys()].filter((id) => !currentTripIds.has(id))
    const removedSourceIds = [...this.savedSources.keys()].filter(
      (id) => !currentSourceIds.has(id),
    )

    if (tripRows.length) {
      const { error } = await this.supabase.from("trips").upsert(tripRows, { onConflict: "id" })
      if (error) throw error
    }
    if (sourceRowsWithHtml.length) {
      const { error } = await this.supabase
        .from("sources")
        .upsert(sourceRowsWithHtml, { onConflict: "id" })
      if (error) throw error
    }
    if (sourceRowsWithoutHtml.length) {
      const { error } = await this.supabase
        .from("sources")
        .upsert(sourceRowsWithoutHtml, { onConflict: "id" })
      if (error) throw error
    }
    // Los viajes van antes que sus borrados para que `assistant_conversations` caiga en cascada.
    if (removedTripIds.length) {
      const { error } = await this.supabase.from("trips").delete().in("id", removedTripIds)
      if (error) throw error
    }
    if (removedSourceIds.length) {
      const { error } = await this.supabase.from("sources").delete().in("id", removedSourceIds)
      if (error) throw error
    }

    this.savedTrips = new Map(snapshot.trips.map((t) => [t.id, t]))
    this.savedSources = new Map(snapshot.sources.map((s) => [s.id, s]))
    for (const row of sourceRowsWithHtml) this.deferredHtml.delete(row.id)
    for (const id of removedSourceIds) this.deferredHtml.delete(id)
  }
}
