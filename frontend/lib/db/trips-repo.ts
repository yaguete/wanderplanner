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
import { mergeTrips } from "@/lib/trip-merge"
import type {
  ExtraTask,
  ShareCard,
  Source,
  TaskGroupCategory,
  Trip,
  TripBudget,
  TripOrigin,
  TripTaskState,
  UserBasicItem,
  UserDay,
} from "@/types/itinerary"
import { stripNullChars } from "@/lib/day-summary"
import {
  isMissingOptionalColumnError,
  isMissingVersionColumnError,
  isSchemaCacheError,
  type PostgrestLikeError,
} from "@/lib/db/schema-column-errors"
import { sanitizeUserDays } from "@/lib/route-legs"
import { isReusableDraftTrip, mergeDraftReferrer } from "@/lib/partner-trip"
import { endDateFromStartAndNumDays, tomorrowISO } from "@/lib/trip-dates"
import { pruneTaskStates } from "@/lib/trip-tasks"
import { TASK_CATEGORY_ORDER } from "@/lib/task-labels"
import { reconcileExtractedSource, hydrateAffiliateUrlsFromSources, hydrateCoordsFromSources } from "@/lib/itinerary-utils"
import {
  toStartCandidate,
  type StartCandidateTrip,
} from "@/lib/start-session"

export {
  isMissingBudgetColumnError,
  isMissingOptionalColumnError,
  isMissingShareCardColumnError,
  isMissingVersionColumnError,
  isSchemaCacheError,
} from "@/lib/db/schema-column-errors"

/**
 * Lectura defensiva de `trips.origin`. Cualquier forma inválida (incluido
 * coords como tupla) → null: los viajes legacy y el jsonb corrupto no rompen
 * la carga.
 */
export function parseTripOrigin(raw: unknown): TripOrigin | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const label = typeof obj.label === "string" ? obj.label.trim() : ""
  if (!label) return null

  let lng: number | null = null
  let lat: number | null = null
  const coords = obj.coords
  if (coords && typeof coords === "object" && !Array.isArray(coords)) {
    const c = coords as Record<string, unknown>
    if (typeof c.lng === "number" && typeof c.lat === "number") {
      lng = c.lng
      lat = c.lat
    }
  } else if (Array.isArray(coords) && coords.length >= 2) {
    // Tupla legacy/corrupta: degradar a null (contrato = objeto {lng,lat}).
    return null
  }
  if (
    lng == null ||
    lat == null ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lng < -180 ||
    lng > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return null
  }

  let countryCode: string | null = null
  if (typeof obj.countryCode === "string") {
    const code = obj.countryCode.trim().toUpperCase()
    if (/^[A-Z]{2}$/.test(code)) countryCode = code
  }

  return { label, countryCode, coords: { lng, lat } }
}

/**
 * Lectura defensiva de `trips.budget`. Cualquier forma inválida, números no
 * finitos, negativos o claves desconocidas se descartan. Si no queda nada → null.
 * Un 0 sí cuenta como techo (el setter de la UI no lo escribe).
 */
export function parseTripBudget(raw: unknown): TripBudget | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>

  let total: number | null = null
  if (typeof obj.total === "number" && Number.isFinite(obj.total) && obj.total >= 0) {
    total = obj.total
  }

  const byCategory: Partial<Record<TaskGroupCategory, number>> = {}
  const rawBy = obj.byCategory
  if (rawBy && typeof rawBy === "object" && !Array.isArray(rawBy)) {
    const rec = rawBy as Record<string, unknown>
    for (const key of TASK_CATEGORY_ORDER) {
      const v = rec[key]
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        byCategory[key] = v
      }
    }
  }

  if (total == null && Object.keys(byCategory).length === 0) return null
  return { total, byCategory }
}

/**
 * Lectura defensiva de `trips.share_card`. Cualquier forma inválida, texto
 * vacío o firma ausente → null. El resumen es derivado: un jsonb raro no
 * debe romper la carga.
 */
export function parseShareCard(raw: unknown): ShareCard | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const text = typeof obj.text === "string" ? stripNullChars(obj.text).trim() : ""
  const signature = typeof obj.signature === "string" ? stripNullChars(obj.signature) : ""
  if (!text || !signature) return null
  const generatedAt =
    typeof obj.generatedAt === "string" && obj.generatedAt.trim()
      ? stripNullChars(obj.generatedAt.trim())
      : "1970-01-01T00:00:00.000Z"
  return { text, signature, generatedAt }
}

/** Postgres rechaza \\u0000 en text/jsonb (error 22P05). También limpia `route` corrupto. */
function sanitizeDaysForDb(days: UserDay[]): UserDay[] {
  return sanitizeUserDays(days).map((d) => {
    const label = d.label != null ? stripNullChars(d.label) : d.label
    const summarySignature =
      d.summarySignature != null ? stripNullChars(d.summarySignature) : d.summarySignature
    if (label === d.label && summarySignature === d.summarySignature) return d
    return { ...d, label, summarySignature }
  })
}

const DEBOUNCE_MS = 1_000
const MAX_ATTEMPTS = 3

export type TripsSnapshot = { trips: Trip[]; sources: Source[] }

export type TripRow = {
  id: string
  user_id: string
  version?: number | null
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
  tasks: Record<string, TripTaskState> | null
  extra_tasks: ExtraTask[] | null
  dismissed_country_tasks: string[] | null
  num_travelers: number | null
  currency: string | null
  origin: TripOrigin | null
  budget: TripBudget | null
  share_card: ShareCard | null
}

type SourceRow = {
  id: string
  user_id: string
  url: string
  author: string
  title: string
  area: string | null
  total_days: number | null
  og_image: string | null
  items: Source["items"] | null
  basics: Source["basics"] | null
  article_html?: string | null
}

const TRIP_COLUMNS_BASE =
  "id, user_id, name, countries, start_date, end_date, num_days, expectations, cover, cover_url, archived, referrer, source_ids, days, basics, tasks, extra_tasks, dismissed_country_tasks, num_travelers, currency, origin"
const TRIP_COLUMNS_WITH_VERSION = "id, user_id, version, name, countries, start_date, end_date, num_days, expectations, cover, cover_url, archived, referrer, source_ids, days, basics, tasks, extra_tasks, dismissed_country_tasks, num_travelers, currency, origin"

/**
 * Fallback solo en dev: el front local a veces apunta al proyecto gestionado
 * antes de aplicar la migración. En producción el fallo tiene que ser ruidoso
 * (DEPLOY.md: migrar `budget` / `share_card` / `version` antes de mergear); bajar
 * el pestillo ahí haría que el syncer diera éxito y el jsonb desapareciera al recargar.
 */
let optionalColumnsLive = true
let versionColumnLive = true

function shouldRetryWithoutVersion(error: PostgrestLikeError): boolean {
  if (!versionColumnLive || !error) return false
  return isMissingVersionColumnError(error) || isSchemaCacheError(error)
}

function schemaFallbackAllowed(): boolean {
  return process.env.NEXT_PUBLIC_ALLOW_SCHEMA_FALLBACK === "1"
}

function noteOptionalColumnsMissing(): void {
  if (!schemaFallbackAllowed()) {
    console.warn(
      "[trips-repo] trips.budget/share_card missing; refusing to omit the columns in production",
    )
    return
  }
  if (optionalColumnsLive) {
    console.warn(
      "[trips-repo] trips.budget/share_card missing; omitting them for the rest of this session (dev-only)",
    )
  }
  optionalColumnsLive = false
}

function noteVersionColumnMissing(): void {
  // Solo con NEXT_PUBLIC_ALLOW_SCHEMA_FALLBACK=1 (local). `next start` es
  // NODE_ENV=production y no debe apagar OCC por un blip de red.
  if (!schemaFallbackAllowed()) {
    console.warn(
      "[trips-repo] trips.version missing; refusing to omit OCC (set NEXT_PUBLIC_ALLOW_SCHEMA_FALLBACK=1 locally)",
    )
    return
  }
  if (versionColumnLive) {
    console.warn(
      "[trips-repo] trips.version missing; loading without OCC until the sharing migration is applied",
    )
  }
  versionColumnLive = false
}

function tripSelectColumns(): string {
  const core = versionColumnLive ? TRIP_COLUMNS_WITH_VERSION : TRIP_COLUMNS_BASE
  return optionalColumnsLive ? `${core}, budget, share_card` : core
}

function omitOptionalColumns<T extends { budget?: unknown; share_card?: unknown }>(row: T): T {
  if (optionalColumnsLive) return row
  const next = { ...row }
  delete next.budget
  delete next.share_card
  return next
}

/**
 * Columnas de `/start`. Incluye `seed_source_key`, que NO va en `TRIP_COLUMNS` ni
 * en `tripToRow`: el upsert del syncer la pisaría con null.
 */
const START_CANDIDATE_COLUMNS =
  "id, name, archived, referrer, seed_source_key, source_ids, start_date, days, basics, tasks, extra_tasks, expectations, num_travelers"
/** Sin `article_html`: puede ser enorme y solo hace falta al abrir la Crónica. */
const SOURCE_COLUMNS = "id, user_id, url, author, title, area, total_days, og_image, items, basics"

type StartTripRow = {
  id: string
  name: string
  archived: boolean
  referrer: string | null
  seed_source_key: string | null
  source_ids: string[] | null
  start_date: string | null
  days: UserDay[] | null
  basics: UserBasicItem[] | null
  tasks: Record<string, TripTaskState> | null
  extra_tasks: ExtraTask[] | null
  expectations: string | null
  num_travelers: number | null
}

export type LoadedStartTrip = StartCandidateTrip & { sourceIds: string[] }

function startRowToLoaded(row: StartTripRow): LoadedStartTrip {
  const sourceIds = row.source_ids ?? []
  return {
    ...toStartCandidate({
      id: row.id,
      name: row.name,
      archived: Boolean(row.archived),
      referrer: row.referrer,
      seedSourceKey: row.seed_source_key,
      sourceIds,
      startDate: row.start_date,
      days: row.days ?? [],
      basics: row.basics ?? [],
      extraTasks: row.extra_tasks ?? [],
      tasks: row.tasks ?? {},
      expectations: row.expectations,
      numTravelers: row.num_travelers,
    }),
    sourceIds,
  }
}

// ── Mapeo fila ↔ dominio ──────────────────────────────────────────────────────

export function rowToTrip(row: TripRow): Trip {
  const days = sanitizeDaysForDb(row.days ?? [])
  // Normalización en lectura: legacy desacoplaba end_date / num_days de days.length.
  // Fuente de verdad = days.length; endDate inclusive desde startDate.
  // La fila en Supabase conserva el valor viejo hasta la siguiente escritura.
  const numDays = days.length > 0 ? days.length : row.num_days
  const startDate = row.start_date
  const endDate =
    startDate && numDays != null && numDays > 0
      ? endDateFromStartAndNumDays(startDate, numDays)
      : null
  return {
    id: row.id,
    name: row.name,
    countries: row.countries ?? [],
    startDate,
    endDate,
    numDays,
    expectations: row.expectations,
    cover: row.cover,
    coverUrl: row.cover_url,
    sourceIds: row.source_ids ?? [],
    days,
    basics: row.basics ?? [],
    tasks: row.tasks ?? {},
    extraTasks: row.extra_tasks ?? [],
    dismissedCountryTasks: Array.isArray(row.dismissed_country_tasks)
      ? row.dismissed_country_tasks.filter((id): id is string => typeof id === "string")
      : [],
    numTravelers: row.num_travelers ?? null,
    currency: row.currency?.trim() ? row.currency.trim() : "EUR",
    origin: parseTripOrigin(row.origin),
    budget: parseTripBudget(row.budget),
    shareCard: parseShareCard(row.share_card),
    archived: row.archived,
    referrer: row.referrer,
    ownerId: row.user_id,
    version: typeof row.version === "number" && row.version > 0 ? row.version : 1,
  }
}

export function tripToRow(trip: Trip, userId: string): TripRow {
  const row: TripRow = {
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
    days: sanitizeDaysForDb(trip.days ?? []),
    basics: trip.basics ?? [],
    // Poda única al serializar: el jsonb persistido no retiene estados huérfanos.
    tasks: pruneTaskStates(trip),
    extra_tasks: trip.extraTasks ?? [],
    dismissed_country_tasks: trip.dismissedCountryTasks ?? [],
    num_travelers: trip.numTravelers ?? null,
    currency: trip.currency?.trim() ? trip.currency.trim() : "EUR",
    origin: parseTripOrigin(trip.origin),
    budget: trip.budget,
    share_card: trip.shareCard ?? null,
  }
  return omitOptionalColumns(row)
}

/** Payload de UPDATE: sin `user_id` ni `version` (OCC va en el WHERE). */
export function tripToUpdateRow(trip: Trip): Record<string, unknown> {
  const full = tripToRow(trip, trip.ownerId || "")
  const { user_id: _uid, version: _v, ...rest } = full as TripRow & { version?: number }
  void _uid
  void _v
  return omitOptionalColumns(rest)
}

/**
 * Realtime / hidratación clonan el viaje (nueva referencia) sin cambiar el
 * documento. Comparar por identidad dispararía un UPDATE → bump de `version` →
 * eco de Realtime → bucle y el toast de «no hemos podido guardar».
 */
export function tripUpdatePayloadsEqual(a: Trip, b: Trip): boolean {
  return JSON.stringify(tripToUpdateRow(a)) === JSON.stringify(tripToUpdateRow(b))
}

/** Baseline OCC: nunca adoptar `trip.version` si no vino de una escritura o lectura real. */
export function keepSavedVersion(saved: Trip, trip: Trip): Trip {
  const version = saved.version ?? 1
  return (trip.version ?? 1) === version ? trip : { ...trip, version }
}

function rowToSource(row: SourceRow): Source {
  const reconciled = reconcileExtractedSource(
    row.items ?? [],
    row.basics ?? [],
    row.article_html,
  )
  return {
    id: row.id,
    url: row.url,
    author: row.author,
    title: row.title,
    area: row.area,
    totalDays: row.total_days ?? null,
    items: reconciled.items,
    basics: reconciled.basics,
    articleHtml: row.article_html ?? "",
    ogImage: row.og_image,
    ownerId: row.user_id,
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
    total_days: source.totalDays ?? null,
    og_image: source.ogImage,
    items: source.items ?? [],
    basics: source.basics ?? [],
  }
  if (includeHtml) row.article_html = source.articleHtml ?? ""
  return row
}

function sourceUpdatePayloadsEqual(
  a: Source,
  b: Source,
  ownerId: string,
  includeHtml: boolean,
): boolean {
  const { user_id: uidA, ...left } = sourceToRow(a, ownerId, includeHtml)
  const { user_id: uidB, ...right } = sourceToRow(b, ownerId, includeHtml)
  void uidA
  void uidB
  return JSON.stringify(left) === JSON.stringify(right)
}

// ── Carga ─────────────────────────────────────────────────────────────────────

export async function loadTripsState(
  supabase: SupabaseClient,
  _userId: string,
): Promise<TripsSnapshot> {
  const loadTrips = () =>
    supabase.from("trips").select(tripSelectColumns()).order("created_at", { ascending: true })

  const tripsResult = await loadTrips()
  let tripsData = tripsResult
  if (tripsData.error && versionColumnLive && shouldRetryWithoutVersion(tripsData.error)) {
    console.warn("[trips-repo] trips select failed; retrying without version", tripsData.error)
    noteVersionColumnMissing()
    if (!versionColumnLive) tripsData = await loadTrips()
  }
  if (isMissingOptionalColumnError(tripsData.error) && optionalColumnsLive) {
    noteOptionalColumnsMissing()
    if (!optionalColumnsLive) tripsData = await loadTrips()
  }

  if (tripsData.error) throw tripsData.error

  const trips = ((tripsData.data ?? []) as unknown as TripRow[]).map(rowToTrip)
  const sourceIds = [...new Set(trips.flatMap((t) => t.sourceIds))].filter(Boolean)

  if (sourceIds.length === 0) {
    return { trips, sources: [] }
  }

  const sources = await loadSourcesByIds(supabase, sourceIds)
  return {
    trips: hydrateCoordsFromSources(hydrateAffiliateUrlsFromSources(trips, sources), sources),
    sources,
  }
}

export async function loadSourcesByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Source[]> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return []
  const { data, error } = await supabase
    .from("sources")
    .select(SOURCE_COLUMNS)
    .in("id", unique)
    .order("created_at", { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as SourceRow[]).map(rowToSource)
}

export type DraftTripInput = {
  name: string
  referrer: string | null
  numDays?: number | null
  /** `sourceMatchKey` del artículo del CTA; solo `/start` lo escribe. */
  seedSourceKey?: string | null
}

/**
 * Viajes activos del usuario para decidir `/start` (tope 50: el `seed_source_key`
 * se compara en JS). No usa `TRIP_COLUMNS`.
 */
export async function loadStartCandidates(
  supabase: SupabaseClient,
  userId: string,
): Promise<LoadedStartTrip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select(START_CANDIDATE_COLUMNS)
    .eq("user_id", userId)
    .eq("archived", false)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) throw error
  return ((data ?? []) as StartTripRow[]).map(startRowToLoaded)
}

/**
 * Viaje vacío de `/start` (sin fuentes, sin fechas, un día en blanco, con `referrer`).
 * No reusa borradores creados a mano (`referrer` null).
 */
export async function findReusableDraftTrip(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ id: string; referrer: string | null } | null> {
  const loadDrafts = () =>
    supabase
      .from("trips")
      .select(tripSelectColumns())
      .eq("user_id", userId)
      .eq("archived", false)
      .is("start_date", null)
      .not("referrer", "is", null)
      .order("created_at", { ascending: false })
      .limit(20)

  let { data, error } = await loadDrafts()
  if (shouldRetryWithoutVersion(error)) {
    noteVersionColumnMissing()
    ;({ data, error } = await loadDrafts())
  }
  if (isMissingOptionalColumnError(error) && optionalColumnsLive) {
    noteOptionalColumnsMissing()
    if (!optionalColumnsLive) ({ data, error } = await loadDrafts())
  }

  if (error) throw error
  for (const row of (data ?? []) as unknown as TripRow[]) {
    const parsed = rowToTrip(row)
    if (parsed.referrer && isReusableDraftTrip(parsed)) {
      return { id: parsed.id, referrer: parsed.referrer }
    }
  }
  return null
}

/**
 * Reusa el borrador vacío de `/start` si existe; si no, inserta.
 * Nunca secuestra un «Nuevo viaje» a mano (`referrer` null).
 */
export async function reuseOrInsertDraftTrip(
  supabase: SupabaseClient,
  userId: string,
  data: DraftTripInput,
): Promise<string> {
  const existing = await findReusableDraftTrip(supabase, userId)
  if (!existing) {
    return insertDraftTrip(supabase, userId, data)
  }

  const forcedDays =
    data.numDays != null && Number.isFinite(data.numDays) && data.numDays >= 1
      ? Math.floor(data.numDays)
      : null
  const patch: Record<string, unknown> = {
    name: data.name,
    referrer: mergeDraftReferrer(existing.referrer, data.referrer),
  }
  if (data.seedSourceKey) patch.seed_source_key = data.seedSourceKey
  if (forcedDays != null) {
    const startDate = tomorrowISO()
    patch.num_days = forcedDays
    patch.start_date = startDate
    patch.end_date = endDateFromStartAndNumDays(startDate, forcedDays)
    patch.days = Array.from({ length: forcedDays }, () => ({
      id: crypto.randomUUID(),
      label: "",
      items: [],
    }))
  }

  const { error } = await supabase.from("trips").update(patch).eq("id", existing.id)
  if (error) throw error
  return existing.id
}

/**
 * Viaje borrador del CTA de un blog partner. Se inserta directamente (fuera de `trip-context`,
 * que solo vive bajo `/trips`) para poder redirigir al detalle con el id ya creado.
 * Con `numDays` (p. ej. `&days=N` del CTA) crea N días vacíos y fija inicio = mañana.
 */
export async function insertDraftTrip(
  supabase: SupabaseClient,
  userId: string,
  data: DraftTripInput,
): Promise<string> {
  const id = crypto.randomUUID()
  const forcedDays =
    data.numDays != null && Number.isFinite(data.numDays) && data.numDays >= 1
      ? Math.floor(data.numDays)
      : null
  const dayCount = forcedDays ?? 1
  const days = Array.from({ length: dayCount }, () => ({
    id: crypto.randomUUID(),
    label: "",
    items: [],
  }))
  const startDate = forcedDays != null ? tomorrowISO() : null
  const endDate =
    startDate && forcedDays != null ? endDateFromStartAndNumDays(startDate, forcedDays) : null

  const payload = omitOptionalColumns({
    id,
    user_id: userId,
    name: data.name,
    num_days: dayCount,
    start_date: startDate,
    end_date: endDate,
    days,
    basics: [],
    tasks: {},
    extra_tasks: [],
    dismissed_country_tasks: [],
    num_travelers: null,
    currency: "EUR",
    origin: null,
    budget: null as TripBudget | null,
    share_card: null as ShareCard | null,
    source_ids: [],
    referrer: data.referrer,
    seed_source_key: data.seedSourceKey || null,
  })
  let { error } = await supabase.from("trips").insert(payload)
  if (isMissingOptionalColumnError(error) && optionalColumnsLive) {
    noteOptionalColumnsMissing()
    if (!optionalColumnsLive) {
      ;({ error } = await supabase.from("trips").insert(omitOptionalColumns(payload)))
    }
  }
  if (error) throw error
  return id
}

/**
 * Poda el hueco del invitado: borra exactamente los ids leídos (nunca un `neq`).
 * `sources` no cae en cascada desde `trips`; las conversaciones sí.
 */
export async function deleteGuestSlotTrips(
  supabase: SupabaseClient,
  trips: LoadedStartTrip[],
  tripIds: string[],
): Promise<void> {
  if (tripIds.length === 0) return
  const idSet = new Set(tripIds)
  const sourceIds = [
    ...new Set(trips.filter((t) => idSet.has(t.id)).flatMap((t) => t.sourceIds)),
  ]
  const { error: tripError } = await supabase.from("trips").delete().in("id", tripIds)
  if (tripError) throw tripError
  if (sourceIds.length === 0) return
  const { error: sourceError } = await supabase.from("sources").delete().in("id", sourceIds)
  if (sourceError) throw sourceError
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
export type TripsSyncerHooks = {
  onConflictMerged?: (trip: Trip, notes: { field: string }[]) => void
  onAccessRevoked?: (tripId: string) => void
  onRemoteMerged?: (trip: Trip) => void
  onRemoteSources?: (sources: Source[]) => void
}

export class TripsSyncer {
  private readonly supabase: SupabaseClient
  private readonly userId: string
  private readonly onError: (error: unknown) => void
  private readonly hooks: TripsSyncerHooks

  /** Última versión persistida por id: la comparación es por referencia de objeto. */
  private savedTrips = new Map<string, Trip>()
  private savedSources = new Map<string, Source>()
  /** Fuentes cargadas sin `article_html`: no debemos sobrescribirlo con "". */
  private deferredHtml = new Set<string>()

  private latest: TripsSnapshot | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private queue: Promise<void> = Promise.resolve()
  private disposed = false
  private lastError: unknown = null

  constructor(
    supabase: SupabaseClient,
    userId: string,
    onError: (error: unknown) => void = () => {},
    hooks: TripsSyncerHooks = {},
  ) {
    this.supabase = supabase
    this.userId = userId
    this.onError = onError
    this.hooks = hooks
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

  savedTrip(id: string): Trip | undefined {
    return this.savedTrips.get(id)
  }

  /** El remoto es la fila: el baseline OCC pasa a ser eso. No escribe. */
  acknowledgeTrip(remote: Trip): void {
    this.savedTrips.set(remote.id, remote)
  }

  /**
   * Fuentes bajadas por Realtime/conflicto. Sin esto el siguiente persist
   * las inserta con `article_html: ""` y borra el artículo para todos.
   * SOURCE_COLUMNS no trae HTML → deferredHtml.
   */
  acknowledgeLoadedSources(sources: Source[]): void {
    for (const s of sources) {
      this.savedSources.set(s.id, s)
      if (!s.articleHtml) this.deferredHtml.add(s.id)
    }
  }

  /**
   * Ingesta Realtime por la misma cola que persist (evita carrera sobre savedTrips).
   * Skip de eco: el hook no llama si `payload.version <= savedTrip().version`.
   */
  ingestRemote(tripId: string): Promise<void> {
    this.queue = this.queue.then(() => this.runIngestRemote(tripId)).catch((e) => {
      this.lastError = e
      console.error("[trips-repo] ingest remote failed", e)
    })
    return this.queue
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
        this.lastError = e
        this.onError(e)
      })
    return this.queue
  }

  /**
   * Como `flush()`, pero informa de si el persist acabó bien.
   * El login de invitado aborta si esto es `false`: si no, el viaje se pierde
   * al cambiar de sesión.
   */
  async flushNow(): Promise<boolean> {
    if (this.disposed) return false
    this.lastError = null
    await this.flush()
    return this.lastError == null
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.latest = null
  }

  private ownerIdForSource(source: Source, snapshot: TripsSnapshot): string {
    if (source.ownerId) return source.ownerId
    const trip = snapshot.trips.find((t) => t.sourceIds.includes(source.id))
    return trip?.ownerId || this.userId
  }

  private async persistTrip(trip: Trip, expectedVersion: number): Promise<Trip | "revoked"> {
    const payload = tripToUpdateRow(trip)
    if (!versionColumnLive) {
      const { error } = await this.supabase.from("trips").update(payload).eq("id", trip.id)
      if (error) throw error
      return trip
    }
    let expected = expectedVersion
    let current = trip
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await this.supabase
        .from("trips")
        .update(tripToUpdateRow(current))
        .eq("id", current.id)
        .eq("version", expected)
        .select("id, version")
        .maybeSingle()
      if (error) {
        if (shouldRetryWithoutVersion(error)) {
          noteVersionColumnMissing()
          const retry = await this.supabase.from("trips").update(tripToUpdateRow(current)).eq("id", current.id)
          if (retry.error) throw retry.error
          return current
        }
        if (isMissingOptionalColumnError(error) && optionalColumnsLive) {
          noteOptionalColumnsMissing()
          if (!optionalColumnsLive) continue
        }
        throw error
      }
      if (data) {
        return { ...current, version: Number(data.version) || expected + 1 }
      }
      const { data: remoteRow, error: fetchErr } = await this.supabase
        .from("trips")
        .select(tripSelectColumns())
        .eq("id", current.id)
        .maybeSingle()
      if (fetchErr) throw fetchErr
      if (!remoteRow) return "revoked"
      const remote = rowToTrip(remoteRow as unknown as TripRow)
      const base = this.savedTrips.get(current.id) ?? remote
      const merged = mergeTrips(base, current, remote)
      this.hooks.onConflictMerged?.(merged.trip, merged.notes)
      this.acknowledgeTrip(remote)
      current = merged.trip
      expected = remote.version ?? 1
    }
    throw new Error("trip persist conflict retries exhausted")
  }

  private async runIngestRemote(tripId: string): Promise<void> {
    if (this.disposed) return
    const { data, error } = await this.supabase
      .from("trips")
      .select(tripSelectColumns())
      .eq("id", tripId)
      .maybeSingle()
    if (error) throw error
    if (!data) return
    const remote = rowToTrip(data as unknown as TripRow)
    const saved = this.savedTrips.get(tripId)
    if (versionColumnLive && saved && (remote.version ?? 1) <= (saved.version ?? 1)) {
      return
    }
    const local =
      this.latest?.trips.find((t) => t.id === tripId) ?? saved ?? remote
    const base = saved ?? local
    const { trip: merged } = mergeTrips(base, local, remote)
    this.acknowledgeTrip(remote)
    if (this.latest) {
      this.latest = {
        ...this.latest,
        trips: this.latest.trips.map((t) => (t.id === tripId ? merged : t)),
      }
    }
    this.hooks.onRemoteMerged?.(merged)

    const known = new Set(
      (this.latest?.sources ?? [...this.savedSources.values()]).map((s) => s.id),
    )
    const missing = merged.sourceIds.filter((id) => !known.has(id))
    if (missing.length === 0) return
    const loaded = await loadSourcesByIds(this.supabase, missing)
    if (loaded.length === 0) return
    this.acknowledgeLoadedSources(loaded)
    if (this.latest) {
      this.latest = { ...this.latest, sources: [...this.latest.sources, ...loaded] }
    }
    this.hooks.onRemoteSources?.(loaded)
  }

  private async persist(snapshot: TripsSnapshot): Promise<void> {
    const currentTripIds = new Set(snapshot.trips.map((t) => t.id))
    const persistedTrips = new Map<string, Trip>()

    for (const trip of snapshot.trips) {
      const saved = this.savedTrips.get(trip.id)
      if (!saved) {
        const row = omitOptionalColumns(tripToRow(trip, this.userId))
        let { error } = await this.supabase.from("trips").upsert(row, { onConflict: "id" })
        if (isMissingOptionalColumnError(error) && optionalColumnsLive) {
          noteOptionalColumnsMissing()
          if (!optionalColumnsLive) {
            ;({ error } = await this.supabase
              .from("trips")
              .upsert(omitOptionalColumns(row), { onConflict: "id" }))
          }
        }
        if (error) throw error
        persistedTrips.set(trip.id, { ...trip, ownerId: this.userId, version: 1 })
        continue
      }
      if (saved === trip || tripUpdatePayloadsEqual(saved, trip)) {
        persistedTrips.set(trip.id, keepSavedVersion(saved, trip))
        continue
      }
      const result = await this.persistTrip(trip, saved.version ?? 1)
      if (result === "revoked") {
        this.hooks.onAccessRevoked?.(trip.id)
        continue
      }
      persistedTrips.set(trip.id, result)
    }

    const sourceRowsWithHtml: SourceRow[] = []
    const sourceRowsWithoutHtml: SourceRow[] = []
    const currentSourceIds = new Set<string>()
    for (const source of snapshot.sources) {
      currentSourceIds.add(source.id)
      if (this.savedSources.get(source.id) === source) continue
      const ownerId = this.ownerIdForSource(source, snapshot)
      const skipHtml = this.deferredHtml.has(source.id) && !source.articleHtml
      const saved = this.savedSources.get(source.id)
      if (saved && sourceUpdatePayloadsEqual(saved, source, ownerId, !skipHtml)) {
        continue
      }
      if (!saved) {
        if (skipHtml) sourceRowsWithoutHtml.push(sourceToRow(source, ownerId, false))
        else sourceRowsWithHtml.push(sourceToRow(source, ownerId, true))
      } else {
        const row = sourceToRow(source, ownerId, !skipHtml)
        const { user_id: _uid, ...update } = row
        void _uid
        const { error } = await this.supabase.from("sources").update(update).eq("id", source.id)
        if (error) throw error
      }
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

    const removedTripIds = [...this.savedTrips.keys()].filter((id) => !currentTripIds.has(id))
    const ownedRemoved = removedTripIds.filter((id) => {
      const t = this.savedTrips.get(id)
      return !t?.ownerId || t.ownerId === this.userId
    })
    if (ownedRemoved.length) {
      const { error } = await this.supabase.from("trips").delete().in("id", ownedRemoved)
      if (error) throw error
    }

    const removedSourceIds = [...this.savedSources.keys()].filter(
      (id) => !currentSourceIds.has(id),
    )
    const ownedRemovedSources = removedSourceIds.filter((id) => {
      const s = this.savedSources.get(id)
      return !s?.ownerId || s.ownerId === this.userId
    })
    if (ownedRemovedSources.length) {
      const { error } = await this.supabase.from("sources").delete().in("id", ownedRemovedSources)
      if (error) throw error
    }

    this.savedTrips = persistedTrips
    this.savedSources = new Map(snapshot.sources.map((s) => [s.id, s]))
    for (const row of sourceRowsWithHtml) this.deferredHtml.delete(row.id)
    for (const id of removedSourceIds) this.deferredHtml.delete(id)
  }
}
