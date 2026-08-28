"use client"

/**
 * Estado global de viajes y fuentes. Las mutaciones siguen siendo síncronas y optimistas sobre
 * `useState`; la persistencia vive en `lib/db/trips-repo.ts`, que sincroniza contra Supabase por
 * diffing de filas (debounce + cola secuencial, last-write-wins).
 * Expone `TripProvider` / `useTrips()`. Al tocar `removeSourceFromTrip`, `refetchSource` o
 * añadir ítems, respeta la semántica de `sourceId` / `sourceItemId` / `sourceBasicItemId` en `types/itinerary`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import type {
  Trip,
  TripBudget,
  ShareCard,
  TripOrigin,
  Source,
  SourceItem,
  UserDay,
  UserDayItem,
  UserBasicItem,
  TripTaskState,
  TripTaskCategory,
  ExtraTask,
  RouteLeg,
  TransportRoute,
} from "@/types/itinerary"
import { normalizeTripBudget } from "@/lib/trip-budget"
import { fetchItinerary, ApiLimitError, ExtractError, isAbortError, type ItineraryProgressStage } from "@/lib/api"
import { resolveMapsLinks } from "@/lib/maps-api"
import { canonicalizeMapsUrl } from "@/lib/maps-links"
import {
  applyArticleHtmlToSource,
  applyResolvedMapsPins,
  authorFromUrl,
  buildSource,
  collectShortMapsUrls,
  formatGuideLabel,
  hydrateAffiliateUrlsFromSources,
  hydrateCoordsFromSources,
} from "@/lib/itinerary-utils"
import { isInstagramMediaUrl } from "@/lib/instagram-url"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { fetchArticleHtml, loadSourcesByIds, loadTripsState, TripsSyncer } from "@/lib/db/trips-repo"
import { mergeTrips } from "@/lib/trip-merge"
import { redeemGuestTripClaim } from "@/lib/guest-trip-claim"
import { useAuth } from "@/lib/auth-context"
import { coverQueriesFromSource, fetchCoverFromQueries } from "@/lib/unsplash"
import { endDateFromStartAndNumDays, tomorrowISO } from "@/lib/trip-dates"
import { draftTripNameFor, MAX_AUTO_DAYS } from "@/lib/partner-trip"
import { createExtraTaskState, foldMirroredFlightReturnCost, mergeTaskState, normalizeName, taskKeyForItem, withPrunedTasks } from "@/lib/trip-tasks"
import { countryCodeFromTaskId, isCountryTaskId } from "@/lib/country-tasks"
import {
  applySpanDays,
  clipSpanDaysInDays,
  itemTakesCalendarSpan,
  parseSpanDays,
  reanchorSpannedStays,
  spanClipNotice,
} from "@/lib/item-span"
import {
  buildRouteLegItem,
  dayHasNonLegContent,
  findLegItem,
  isRouteLegItem,
  reanchorRouteLegs,
  rescueLegsFromRemovedDays,
  upsertLegInDays,
} from "@/lib/route-legs"
import {
  buildTransportRouteItem,
  migrateTaskKeyOnStructure,
} from "@/lib/transport-routes"
import { isMirroredFlightRoundtrip } from "@/lib/flight-search"
import { canAddSource } from "@/lib/trip-sources"
import { userDayItemFromSource } from "@/lib/item-provenance"
import {
  applySourceRouteImport,
  planSourceRouteImport,
  sourceRouteItems,
  type SourceRouteImportResult,
} from "@/lib/source-route-import"

export type PendingSourceErrorKind = "guest-limit" | "limit" | "generic" | "permanent"

export type PendingSource = {
  id: string
  tripId: string
  url: string
  author: string
  status: "loading" | "error"
  errorMessage?: string
  errorKind?: PendingSourceErrorKind
  errorDestination?: string
  stage: ItineraryProgressStage | null
  /** Arranque del intento en curso; lo reinicia cada reintento. Alimenta las
   *  frases de espera de la ardilla, que no pueden reiniciarse porque el
   *  usuario se vaya a Mi viaje y vuelva (el panel desmonta y remonta). */
  startedAt: number
}

export type StartSourceExtractionResult =
  | { ok: true; pendingId: string }
  | {
      ok: false
      reason: "max-sources" | "already-loading" | "trip-not-found" | "invalid-state"
    }

/** Evento de resolución para toasts / foco en el panel Fuentes. */
export type SourceExtractionEvent =
  | {
      type: "success"
      tripId: string
      pendingId: string
      source: Source
      seq: number
      /** Epoch ms; el panel ignora el gate de invitado si el evento es viejo. */
      at: number
    }
  | {
      type: "error"
      tripId: string
      pendingId: string
      errorKind: PendingSourceErrorKind
      message: string
      destination?: string
      seq: number
      at: number
    }

/** Alinea numDays y endDate con days.length (+ startDate inclusive). Reancla legs. */
function syncTripSchedule(trip: Trip, days: UserDay[]): Trip {
  const anchored = reanchorRouteLegs(days)
  const numDays = anchored.length
  const endDate = trip.startDate
    ? endDateFromStartAndNumDays(trip.startDate, numDays)
    : null
  return { ...trip, days: anchored, numDays, endDate }
}

function makeEmptyDays(count: number): UserDay[] {
  return Array.from({ length: count }, () => ({
    id: crypto.randomUUID(),
    label: "",
    items: [],
  }))
}

/**
 * Puede renombrarse con la etiqueta de guía (`destino — N días`): primer source de un viaje
 * de partner cuyo nombre sigue siendo el borrador de `/start` o el `area` legacy.
 * Deliberadamente NO exige `!trip.startDate`: con `&days=N` el borrador ya llega con
 * `startDate` puesto y aun así sigue siendo "virgen".
 */
function canRenameFromGuide(trip: Trip, source: Source): boolean {
  if (!trip.referrer || trip.sourceIds.length > 0) return false
  // Solo al añadir la primera fuente (caller pasa el trip antes del push).
  const draft = draftTripNameFor(source.url)
  if (trip.name === draft) return true
  // Legacy: rename antiguo usaba solo `area` («Japan»); subir a «Japan — 21 días».
  if (source.area && trip.name === source.area) return true
  return false
}

/**
 * Solo viajes de partner que siguen tal cual los dejó `insertDraftTrip` SIN `&days=N`: nunca pisar
 * al usuario ni redimensionar dos veces un viaje que ya llegó con N días de `&days=N`.
 * Los tramos de ida/vuelta (T4B.3) NO cuentan como contenido: el usuario puede rellenarlos
 * antes de que llegue la fuente y aun así debe adoptar totalDays + startDate.
 */
function canAdoptGuideSchedule(trip: Trip): boolean {
  if (!trip.referrer || trip.sourceIds.length > 0 || trip.startDate) return false
  if (trip.days.length > 1) return false
  return trip.days.every((d) => !dayHasNonLegContent(d))
}

interface TripContextValue {
  trips: Trip[]
  sources: Source[]
  /** Viajes y fuentes aún cargándose: la UI no debe concluir que un viaje no existe. */
  isLoading: boolean
  /**
   * Vacía el debounce del syncer y espera al persist. `false` si falló:
   * el login de invitado no debe seguir (el viaje se perdería).
   */
  flushPendingSync: () => Promise<boolean>
  /** Relee viajes y fuentes (p. ej. tras aceptar una invitación). */
  reloadTrips: () => Promise<void>
  createTrip: (data: {
    name: string
    countries: string[]
    startDate: string | null
    endDate: string | null
    numDays: number | null
    expectations: string | null
    origin?: TripOrigin | null
    numTravelers?: number | null
    currency?: string
  }) => Trip
  updateTrip: (
    tripId: string,
    data: {
      name: string
      startDate: string | null
      endDate: string | null
      numDays: number | null
      expectations: string | null
      origin?: TripOrigin | null
      numTravelers?: number | null
      currency?: string
    },
  ) => { ok: true } | { ok: false; error: string }
  deleteTrip: (tripId: string) => void
  archiveTrip: (tripId: string) => void
  unarchiveTrip: (tripId: string) => void
  leaveTrip: (tripId: string) => Promise<void>
  applyRemoteTrip: (trip: Trip) => void
  /** Ingesta Realtime por la cola del syncer (refetch + fusión + fuentes). */
  ingestRemote: (tripId: string) => Promise<void>
  savedTrip: (id: string) => Trip | undefined
  /** Quita el viaje del estado local (revocación remota). No llama a leave_trip. */
  dropTrip: (tripId: string) => void

  getTrip: (tripId: string) => Trip | undefined
  getTripSources: (tripId: string) => Source[]
  /** Arranca extracción fire-and-forget; el resultado llega vía pendingSources / lastExtractionEvent. */
  startSourceExtraction: (tripId: string, url: string) => StartSourceExtractionResult
  cancelPendingSource: (pendingId: string) => void
  retryPendingSource: (pendingId: string) => StartSourceExtractionResult
  dismissPendingSource: (pendingId: string) => void
  pendingSources: PendingSource[]
  /** Último éxito/error de extracción (para toasts); `seq` monótono. */
  lastExtractionEvent: SourceExtractionEvent | null
  /** Marca el evento como consumido (evita toast/gate al remontar el panel). */
  ackExtractionEvent: (seq: number) => void
  /** Vuelve a descargar itinerario + HTML del artículo; conserva el id de la fuente. */
  refetchSource: (sourceId: string, url: string) => Promise<void>
  /** True mientras un refetch de Crónica está en curso. */
  isRefetchingSource: boolean
  removeSourceFromTrip: (tripId: string, sourceId: string) => void
  /** Descarga el HTML del artículo (excluido de la carga inicial) al abrir la Crónica. */
  ensureArticleHtml: (sourceId: string) => Promise<void>
  isArticleHtmlLoading: (sourceId: string) => boolean
  /** Fuentes del viaje con el HTML ya resuelto; el briefing del asistente lo necesita. */
  loadTripSourcesWithArticles: (tripId: string) => Promise<Source[]>

  addDay: (tripId: string) => void
  updateDayLabel: (tripId: string, dayId: string, label: string) => void
  /** Escribe label + summarySignature en una sola mutación (descripción por IA). */
  applyDaySummary: (
    tripId: string,
    dayId: string,
    data: { label: string; signature: string },
  ) => void
  removeDay: (tripId: string, dayId: string) => void
  /** Quita días cuyo id esté en la lista; nunca deja el viaje sin días. */
  removeSelectedDays: (tripId: string, dayIds: string[]) => void
  addItemToDay: (tripId: string, dayId: string, item: UserDayItem) => void
  /** Varios ítems a la vez; no duplica `sourceItemId` ya presente en ese día. */
  addItemsToDay: (tripId: string, dayId: string, items: UserDayItem[]) => void
  /**
   * Copia la ruta de una fuente (sin transportes) a Mi viaje: día N → día N.
   * No duplica ítems ya presentes, no mueve los existentes y crea días si faltan.
   */
  addSourceRouteToTrip: (
    tripId: string,
    source: Source,
    items?: SourceItem[],
  ) => Pick<
    SourceRouteImportResult,
    "addedCount" | "skippedExisting" | "skippedPastCap" | "daysCreated"
  >
  removeItemFromDay: (tripId: string, dayId: string, itemId: string) => void
  /** Vacía los ítems de un día (conserva ida/vuelta); una sola mutación. */
  clearDayItems: (tripId: string, dayId: string) => void
  /** Fija coords persistidas (p. ej. «Ajustar ubicación» del mapa). El pin pasa a exacto. */
  setDayItemCoords: (
    tripId: string,
    itemId: string,
    coords: { lng: number; lat: number },
    region?: string | null,
  ) => void
  /** Recorta o amplía `spanDays` del ancla. `undefined` omite el campo (solo su día). */
  setItemSpanDays: (tripId: string, itemId: string, spanDays: number | undefined) => void
  /**
   * Edita un stay / activity / food (nombre, lugar, día, nota, duración).
   * Conserva id, procedencia y afiliado. Los transportes van por su diálogo.
   */
  updateDayItem: (
    tripId: string,
    params: { dayId: string; item: UserDayItem },
  ) => { ok: true } | { ok: false; error: string }
  moveItemBetweenDays: (
    tripId: string,
    params: { fromDayId: string; toDayId: string; itemId: string; toIndex: number },
  ) => void
  addBasicToTrip: (tripId: string, basic: UserBasicItem) => void
  removeBasicFromTrip: (tripId: string, basicId: string) => void

  /**
   * Actualiza el estado de una tarea por clave (`taskKeyForItem` /
   * `taskKeyForBasic`, o el id del extra). Si `taskKey` es un extra, escribe en
   * `ExtraTask.state`; si no, en `trip.tasks[taskKey]`.
   */
  setTaskState: (tripId: string, taskKey: string, patch: Partial<TripTaskState>) => void
  addExtraTask: (
    tripId: string,
    data: { title: string; category: TripTaskCategory; state?: Partial<TripTaskState> },
  ) => ExtraTask
  removeExtraTask: (tripId: string, taskId: string) => void
  updateExtraTask: (
    tripId: string,
    taskId: string,
    data: { title?: string; category?: TripTaskCategory },
  ) => void
  /** Acepta una sugerencia MAE como ExtraTask con id estable. */
  acceptCountryTask: (
    tripId: string,
    data: {
      id: string
      title: string
      category: TripTaskCategory
      state?: Partial<TripTaskState>
    },
  ) => ExtraTask | null
  /** Descarta una sugerencia para que no reaparezca al recargar. */
  dismissCountryTask: (tripId: string, taskId: string) => void
  /**
   * Quita de `dismissedCountryTasks` los ids de países actualmente activos
   * (para resucitar sugerencias tras un descarte/eliminación accidental).
   */
  reevaluateCountryTasks: (tripId: string, activeCountryCodes: string[]) => void

  /** Viajeros del viaje (T4.3: coste por persona). `null` = no configurado. */
  setNumTravelers: (tripId: string, numTravelers: number | null) => void
  /** Divisa del viaje (ISO 4217). Vacío → EUR. */
  setTripCurrency: (tripId: string, currency: string) => void
  /** Techo opcional del viaje. Objeto vacío / importes ≤ 0 → null. */
  setTripBudget: (tripId: string, next: TripBudget | null) => void
  /** Texto de Compartir (derivado). Null = borrar la caché. */
  setShareCard: (tripId: string, next: ShareCard | null) => void
  /**
   * Crea o edita el tramo de ida/vuelta (T4B.3) en una sola mutación.
   * Si `origin` viene y el viaje aún no tiene, lo guarda en el mismo setTrips.
   */
  upsertRouteLeg: (
    tripId: string,
    data: {
      leg: RouteLeg
      route: Omit<TransportRoute, "leg"> & { from: TransportRoute["from"]; to: TransportRoute["to"] }
      detail?: string | null
      vendor?: string | null
      /** Solo se aplica si el viaje aún no tiene origen. */
      origin?: TripOrigin | null
      /** Al crear ida: también crea el retorno espejado en el último día. */
      createMirrorReturn?: boolean
    },
  ) => { ok: true } | { ok: false; error: string }
  /**
   * Crea o edita un traslado interno estructurado (sin `leg`).
   * Migra la clave de tarea legacy → `route:${id}` en el mismo setTrips.
   */
  upsertTransportRouteItem: (
    tripId: string,
    data: {
      dayId: string
      itemId?: string
      route: Omit<TransportRoute, "leg"> & { from: TransportRoute["from"]; to: TransportRoute["to"] }
      detail?: string | null
      vendor?: string | null
    },
  ) => { ok: true } | { ok: false; error: string }
}

const TripContext = createContext<TripContextValue | null>(null)

function hydrateDayItems(trips: Trip[], sources: Source[]): Trip[] {
  return hydrateCoordsFromSources(hydrateAffiliateUrlsFromSources(trips, sources), sources)
}

function mapsPinsFromResolve(
  pins: { url: string; lng: number; lat: number }[],
): Map<string, { lng: number; lat: number }> {
  const resolved = new Map<string, { lng: number; lat: number }>()
  for (const p of pins) {
    const coord = { lng: p.lng, lat: p.lat }
    resolved.set(p.url, coord)
    resolved.set(canonicalizeMapsUrl(p.url), coord)
  }
  return resolved
}

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const [trips, setTrips] = useState<Trip[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [rehydrated, setRehydrated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingSources, setPendingSources] = useState<PendingSource[]>([])
  const [lastExtractionEvent, setLastExtractionEvent] = useState<SourceExtractionEvent | null>(
    null,
  )
  const [isRefetchingSource, setIsRefetchingSource] = useState(false)
  const [loadingArticleIds, setLoadingArticleIds] = useState<string[]>([])
  const tripsRef = useRef(trips)
  const sourcesRef = useRef(sources)
  const pendingSourcesRef = useRef(pendingSources)
  const abortByPendingIdRef = useRef(new Map<string, AbortController>())
  const extractionSeqRef = useRef(0)
  const coverBackfillAttempted = useRef(new Set<string>())
  const mapsResolveInFlight = useRef(new Set<string>())
  const syncerRef = useRef<TripsSyncer | null>(null)
  const hydratedFor = useRef<string | null>(null)
  const claimAttemptedFor = useRef<string | null>(null)

  // En el render, no en un effect: `/start` dispara la extracción en el hijo
  // en el mismo commit en el que llegan los viajes. Un effect deja el ref a []
  // y startSourceExtraction responde trip-not-found.
  tripsRef.current = trips
  sourcesRef.current = sources
  pendingSourcesRef.current = pendingSources

  const applyMergedTrip = useCallback((trip: Trip) => {
    setTrips((prev) => {
      if (!prev.some((t) => t.id === trip.id)) return prev
      const synced = syncTripSchedule(trip, trip.days)
      const next = prev.map((t) => (t.id === trip.id ? synced : t))
      const used = new Set(next.flatMap((t) => t.sourceIds))
      const nextSources = sourcesRef.current.filter((s) => used.has(s.id))
      if (nextSources.length !== sourcesRef.current.length) {
        setSources(nextSources)
      }
      return hydrateDayItems(next, nextSources)
    })
  }, [])

  const applyRemoteSources = useCallback((incoming: Source[]) => {
    if (incoming.length === 0) return
    setSources((prev) => {
      const seen = new Set(prev.map((s) => s.id))
      const added = incoming.filter((s) => !seen.has(s.id))
      if (added.length === 0) return prev
      const next = [...prev, ...added]
      setTrips((tPrev) => hydrateDayItems(tPrev, next))
      return next
    })
  }, [])

  // Al desmontar el provider (salir de /trips): abortar extracciones en vuelo.
  useEffect(() => {
    const aborts = abortByPendingIdRef.current
    return () => {
      for (const ac of aborts.values()) ac.abort()
      aborts.clear()
    }
  }, [])
  // Hidratación por usuario: al cerrar sesión se vacía el estado y se descarta el sincronizador.
  useEffect(() => {
    if (authLoading) return
    const userId = user?.id ?? null

    if (!userId || !isSupabaseConfigured()) {
      syncerRef.current?.dispose()
      syncerRef.current = null
      hydratedFor.current = null
      claimAttemptedFor.current = null
      coverBackfillAttempted.current.clear()
      for (const ac of abortByPendingIdRef.current.values()) ac.abort()
      abortByPendingIdRef.current.clear()
      setTrips([])
      setSources([])
      setPendingSources([])
      setLastExtractionEvent(null)
      setRehydrated(false)
      setIsLoading(false)
      return
    }

    // Ya hidratado con éxito para este usuario (evita recargas en refrescos de sesión).
    if (hydratedFor.current === userId) return

    setIsLoading(true)
    setRehydrated(false)

    const supabase = createClient()
    const syncer = new TripsSyncer(
      supabase,
      userId,
      (error) => {
        console.error("[trips] persist failed", error)
        toast.error("No hemos podido guardar los últimos cambios. Reintentando…")
      },
      {
        onConflictMerged: (trip) => {
          applyMergedTrip(trip)
          toast.message("Se han combinado cambios de las dos personas")
          const missing = trip.sourceIds.filter(
            (id) => !sourcesRef.current.some((s) => s.id === id),
          )
          if (missing.length === 0) return
          void loadSourcesByIds(supabase, missing).then((loaded) => {
            syncerRef.current?.acknowledgeLoadedSources(loaded)
            applyRemoteSources(loaded)
          })
        },
        onAccessRevoked: (tripId) => {
          setTrips((prev) => prev.filter((t) => t.id !== tripId))
          toast.error("Ya no tienes acceso a este viaje")
        },
        onRemoteMerged: (trip) => applyMergedTrip(trip),
        onRemoteSources: (sources) => applyRemoteSources(sources),
      },
    )
    syncerRef.current?.dispose()
    syncerRef.current = syncer

    let active = true
    let completed = false
    let claimedIds: string[] | null = null
    void (async () => {
      try {
        // Redeem ANTES del primer load: si hay stash, el snapshot ya incluye
        // el viaje del invitado. Sin stash es un getItem de localStorage.
        if (claimAttemptedFor.current !== userId) {
          claimedIds = await redeemGuestTripClaim(supabase, userId)
          claimAttemptedFor.current = userId
        }
        if (!active) return
        const snapshot = await loadTripsState(supabase, userId)
        if (!active) return
        syncer.reset(snapshot)
        setTrips(snapshot.trips)
        setSources(snapshot.sources)
        setRehydrated(true)
        hydratedFor.current = userId
        completed = true
        if (claimedIds && claimedIds.length > 0) {
          const names = claimedIds
            .map((id) => snapshot.trips.find((t) => t.id === id)?.name?.trim())
            .filter((n): n is string => Boolean(n))
          if (names.length === 1) {
            toast.success(`Hemos añadido «${names[0]}» a tu cuenta`)
          } else {
            toast.success(`Hemos añadido ${claimedIds.length} viajes a tu cuenta`)
          }
        }
      } catch (err) {
        console.error("[trips] load failed", err)
        if (active) toast.error("No hemos podido cargar tus viajes.")
      } finally {
        if (active) setIsLoading(false)
      }
    })()

    return () => {
      active = false
      // Strict Mode (dev) monta → limpia → remonta: si marcamos hydratedFor antes de
      // terminar, el remount hace early-return y el spinner se queda eterno.
      if (!completed) {
        hydratedFor.current = null
      }
    }
  }, [authLoading, user?.id])

  useEffect(() => {
    if (!rehydrated) return
    syncerRef.current?.schedule({ trips, sources })
  }, [trips, sources, rehydrated])

  // Cierre de pestaña o navegación: no perder lo que quedaba en el debounce.
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

  const flushPendingSync = useCallback(async () => {
    const syncer = syncerRef.current
    if (!syncer) return true
    return syncer.flushNow()
  }, [])

  const reloadTrips = useCallback(async () => {
    const userId = user?.id
    if (!userId || !isSupabaseConfigured()) return
    setIsLoading(true)
    try {
      await syncerRef.current?.flushNow()
      const supabase = createClient()
      const snapshot = await loadTripsState(supabase, userId)
      syncerRef.current?.reset(snapshot)
      setTrips(snapshot.trips)
      setSources(snapshot.sources)
      setRehydrated(true)
      hydratedFor.current = userId
    } catch (err) {
      console.error("[trips] reload failed", err)
      toast.error("No hemos podido cargar tus viajes.")
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  const applyCoverFromSource = useCallback(async (tripId: string, source: Source) => {
    const queries = coverQueriesFromSource(source)
    // Unsplash del destino → genérico (maleta/mapa) → emoji.
    // No usamos og:image: el hero del blog suele ser un paisaje que no es portada.
    const unsplashUrl = await fetchCoverFromQueries(queries)
    const url = unsplashUrl
    setTrips((prev) => {
      const current = prev.find((t) => t.id === tripId)
      if (!current || current.coverUrl === url) return prev
      // /cover puede fallar en local (API apagada, sin Unsplash) o devolver
      // vacío. No pises una portada que ya estaba: el syncer lo persistiría.
      if (!url && current.coverUrl) return prev
      return prev.map((t) => (t.id === tripId ? { ...t, coverUrl: url } : t))
    })
  }, [])

  const scheduleMapsPinResolve = useCallback((source: Source) => {
    const urls = collectShortMapsUrls(source.articleHtml)
    if (urls.length === 0) return
    const needsPin = source.items.some((item) => {
      if (item.type !== "stay" && item.type !== "food" && item.type !== "activity") {
        return false
      }
      const c = item.coords
      return !(c && Number.isFinite(c.lng) && Number.isFinite(c.lat))
    })
    if (!needsPin) return
    if (mapsResolveInFlight.current.has(source.id)) return
    mapsResolveInFlight.current.add(source.id)
    void (async () => {
      try {
        const pins = await resolveMapsLinks(urls)
        if (pins.length === 0) return
        const current = sourcesRef.current.find((s) => s.id === source.id)
        if (!current) return
        const next = applyResolvedMapsPins(current, mapsPinsFromResolve(pins))
        if (next === current) return
        setSources((prev) => prev.map((s) => (s.id === source.id ? next : s)))
        setTrips((prev) =>
          hydrateDayItems(
            prev,
            sourcesRef.current.map((s) => (s.id === source.id ? next : s)),
          ),
        )
      } catch {
        /* fail-open: el mapa sigue geocodificando por nombre */
      } finally {
        mapsResolveInFlight.current.delete(source.id)
      }
    })()
  }, [])

  // Backfill: sin portada, o reaplicar una vez por sesión para recuperar
  // fotos de destino que un fallback genérico hubiera pisado.
  // Idle: no pelear el primer paint de /trips con N GET /cover.
  useEffect(() => {
    if (!rehydrated) return
    const run = () => {
      for (const trip of tripsRef.current) {
        if (trip.sourceIds.length === 0) continue
        if (coverBackfillAttempted.current.has(trip.id)) continue
        const firstId = trip.sourceIds[0]
        const source = sourcesRef.current.find((s) => s.id === firstId)
        if (!source) continue
        coverBackfillAttempted.current.add(trip.id)
        void applyCoverFromSource(trip.id, source)
      }
    }
    let idleId = 0
    let timeoutId = 0
    const ric = (
      globalThis as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      }
    ).requestIdleCallback
    if (typeof ric === "function") {
      idleId = ric(run, { timeout: 2500 })
    } else {
      timeoutId = window.setTimeout(run, 400)
    }
    return () => {
      const cic = (
        globalThis as unknown as { cancelIdleCallback?: (id: number) => void }
      ).cancelIdleCallback
      if (idleId && typeof cic === "function") cic(idleId)
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [rehydrated, trips, sources, applyCoverFromSource])

  const createTrip = useCallback(
    (data: {
      name: string
      countries: string[]
      startDate: string | null
      endDate: string | null
      numDays: number | null
      expectations: string | null
      origin?: TripOrigin | null
      numTravelers?: number | null
      currency?: string
    }): Trip => {
    const dayCount = data.numDays && data.numDays > 0 ? data.numDays : 1
    const days: UserDay[] = Array.from({ length: dayCount }, () => ({
      id: crypto.randomUUID(),
      label: "",
      items: [],
    }))

    const numTravelers =
      data.numTravelers == null || !Number.isFinite(data.numTravelers) || data.numTravelers < 1
        ? null
        : Math.floor(data.numTravelers)

    const currency =
      data.currency?.trim() ? data.currency.trim().toUpperCase() : "EUR"

    const trip = syncTripSchedule(
      {
        id: crypto.randomUUID(),
        name: data.name,
        countries: data.countries,
        startDate: data.startDate,
        endDate: null,
        numDays: null,
        expectations: data.expectations?.trim() ? data.expectations.trim() : null,
        cover: "✈️",
        coverUrl: null,
        sourceIds: [],
        days,
        basics: [],
        tasks: {},
        extraTasks: [],
        dismissedCountryTasks: [],
        numTravelers,
        currency,
        origin: data.origin ?? null,
        budget: null,
        shareCard: null,
        archived: false,
        ownerId: user?.id ?? "",
        version: 1,
      },
      days,
    )
    setTrips((prev) => [...prev, trip])
    return trip
  }, [user?.id])

  const updateTrip = useCallback(
    (
      tripId: string,
      data: {
        name: string
        startDate: string | null
        endDate: string | null
        numDays: number | null
        expectations: string | null
        origin?: TripOrigin | null
        numTravelers?: number | null
        currency?: string
      },
    ): { ok: true } | { ok: false; error: string } => {
      const trip = tripsRef.current.find((t) => t.id === tripId)
      if (!trip) return { ok: false, error: "Viaje no encontrado." }

      const targetDays = data.numDays && data.numDays > 0 ? data.numDays : null
      if (targetDays != null && targetDays < trip.days.length) {
        const excess = trip.days.length - targetDays
        return {
          ok: false,
          error: `Tu itinerario tiene ${trip.days.length} días. Elimina ${excess} día${excess === 1 ? "" : "s"} desde el panel del viaje antes de reducir el número aquí.`,
        }
      }

      const numTravelers =
        data.numTravelers === undefined
          ? trip.numTravelers
          : data.numTravelers == null || !Number.isFinite(data.numTravelers) || data.numTravelers < 1
            ? null
            : Math.floor(data.numTravelers)

      const currency =
        data.currency === undefined
          ? trip.currency
          : data.currency.trim()
            ? data.currency.trim().toUpperCase()
            : "EUR"

      const origin = data.origin === undefined ? trip.origin : data.origin

      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t
          let days = t.days
          if (targetDays != null && targetDays > t.days.length) {
            const extra: UserDay[] = Array.from({ length: targetDays - t.days.length }, () => ({
              id: crypto.randomUUID(),
              label: "",
              items: [],
            }))
            days = [...t.days, ...extra]
          } else if (targetDays != null) {
            days = t.days
          }
          // Sin numDays en el form: conservar days actuales; endDate se deriva de startDate.
          return syncTripSchedule(
            {
              ...t,
              name: data.name,
              startDate: data.startDate,
              expectations: data.expectations?.trim() ? data.expectations.trim() : null,
              origin,
              numTravelers,
              currency,
            },
            days,
          )
        }),
      )
      return { ok: true }
    },
    [],
  )

  const archiveTrip = useCallback((tripId: string) => {
    setTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, archived: true } : t)))
  }, [])

  const unarchiveTrip = useCallback((tripId: string) => {
    setTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, archived: false } : t)))
  }, [])

  // Las conversaciones del asistente caen por `on delete cascade` sobre `trips`.
  const deleteTrip = useCallback((tripId: string) => {
    setTrips((prev) => {
      const next = prev.filter((t) => t.id !== tripId)
      setSources((sPrev) => {
        const used = new Set(next.flatMap((t) => t.sourceIds))
        return sPrev.filter((s) => used.has(s.id))
      })
      return next
    })
  }, [])

  const leaveTrip = useCallback(async (tripId: string) => {
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    const { error } = await supabase.rpc("leave_trip", { p_trip_id: tripId })
    if (error) throw error
    setTrips((prev) => prev.filter((t) => t.id !== tripId))
  }, [])

  const applyRemoteTrip = useCallback((trip: Trip) => {
    setTrips((prev) => {
      const current = prev.find((t) => t.id === trip.id)
      if (!current) return prev
      const saved = syncerRef.current?.savedTrip(trip.id)
      const { trip: merged } = mergeTrips(saved ?? current, current, trip)
      const synced = syncTripSchedule(merged, merged.days)
      const next = prev.map((t) => (t.id === trip.id ? synced : t))
      const used = new Set(next.flatMap((t) => t.sourceIds))
      const nextSources = sourcesRef.current.filter((s) => used.has(s.id))
      if (nextSources.length !== sourcesRef.current.length) {
        setSources(nextSources)
      }
      return hydrateDayItems(next, nextSources)
    })
  }, [])

  const ingestRemote = useCallback((tripId: string) => {
    return syncerRef.current?.ingestRemote(tripId) ?? Promise.resolve()
  }, [])

  const savedTrip = useCallback((id: string) => syncerRef.current?.savedTrip(id), [])

  const dropTrip = useCallback((tripId: string) => {
    setTrips((prev) => prev.filter((t) => t.id !== tripId))
  }, [])

  const ensureArticleHtml = useCallback(async (sourceId: string) => {
    const existing = sourcesRef.current.find((s) => s.id === sourceId)
    if (!existing || existing.articleHtml) return
    if (!isSupabaseConfigured()) return

    setLoadingArticleIds((prev) => (prev.includes(sourceId) ? prev : [...prev, sourceId]))
    try {
      const html = await fetchArticleHtml(createClient(), sourceId)
      if (!html) return
      const current = sourcesRef.current.find((s) => s.id === sourceId)
      if (!current) return
      const next = applyArticleHtmlToSource(current, html)
      const itemsChanged =
        next.items !== current.items || next.basics !== current.basics
      // HTML ya está en Postgres; si solo llega el artículo, no reescribir la fila.
      // Si pegamos enlaces de reserva en ítems, sí hay que persistirlos.
      if (!itemsChanged) syncerRef.current?.acknowledgeSource(next)
      setSources((prev) => prev.map((s) => (s.id === sourceId ? next : s)))
      if (itemsChanged) {
        setTrips((prev) =>
          hydrateDayItems(
            prev,
            sourcesRef.current.map((s) => (s.id === sourceId ? next : s)),
          ),
        )
      }
      scheduleMapsPinResolve(next)
    } catch {
      /* la Crónica muestra su propio estado vacío */
    } finally {
      setLoadingArticleIds((prev) => prev.filter((id) => id !== sourceId))
    }
  }, [scheduleMapsPinResolve])

  const isArticleHtmlLoading = useCallback(
    (sourceId: string) => loadingArticleIds.includes(sourceId),
    [loadingArticleIds],
  )

  const loadTripSourcesWithArticles = useCallback(
    async (tripId: string): Promise<Source[]> => {
      const trip = tripsRef.current.find((t) => t.id === tripId)
      if (!trip) return []
      const tripSources = sourcesRef.current.filter((s) => trip.sourceIds.includes(s.id))
      const missing = tripSources.filter((s) => !s.articleHtml)
      if (missing.length === 0 || !isSupabaseConfigured()) {
        if (missing.length === 0) {
          for (const s of tripSources) scheduleMapsPinResolve(s)
        }
        return tripSources
      }

      const supabase = createClient()
      const fetched = await Promise.all(
        missing.map(async (s) => {
          try {
            return [s.id, await fetchArticleHtml(supabase, s.id)] as const
          } catch {
            return [s.id, ""] as const
          }
        }),
      )
      const htmlById = new Map(fetched)
      const previous = sourcesRef.current
      const nextAll = previous.map((s) => {
        const html = htmlById.get(s.id)
        if (!html) return s
        const next = applyArticleHtmlToSource(s, html)
        if (next.items === s.items && next.basics === s.basics) {
          syncerRef.current?.acknowledgeSource(next)
        }
        return next
      })
      const itemsChanged = nextAll.some((s, i) => {
        const prev = previous[i]
        return prev != null && (prev.items !== s.items || prev.basics !== s.basics)
      })
      setSources(nextAll)
      if (itemsChanged) {
        setTrips((prev) => hydrateDayItems(prev, nextAll))
      }
      for (const s of nextAll) {
        if (trip.sourceIds.includes(s.id)) scheduleMapsPinResolve(s)
      }
      return nextAll.filter((s) => trip.sourceIds.includes(s.id))
    },
    [scheduleMapsPinResolve],
  )

  const getTrip = useCallback((tripId: string) => {
    return trips.find((t) => t.id === tripId)
  }, [trips])

  const getTripSources = useCallback((tripId: string) => {
    const trip = trips.find((t) => t.id === tripId)
    if (!trip) return []
    return sources.filter((s) => trip.sourceIds.includes(s.id))
  }, [trips, sources])

  const removeSourceFromTrip = useCallback(
    (tripId: string, sourceId: string) => {
      const tripBefore = tripsRef.current.find((t) => t.id === tripId)
      const wasFirst = tripBefore?.sourceIds[0] === sourceId

      // Conservar ítems/basics ya consolidados en Mi viaje (sourceAuthor denormalizado).
      const nextTrips: Trip[] = tripsRef.current.map((t) => {
        if (t.id !== tripId) return t
        return {
          ...t,
          sourceIds: t.sourceIds.filter((id) => id !== sourceId),
          ...(wasFirst ? { coverUrl: null } : {}),
        }
      })
      setTrips(nextTrips)
      setSources((prev) => {
        const used = new Set(nextTrips.flatMap((t) => t.sourceIds))
        return prev.filter((s) => used.has(s.id))
      })

      if (wasFirst) {
        const updated = nextTrips.find((t) => t.id === tripId)
        const nextFirstId = updated?.sourceIds[0]
        if (nextFirstId) {
          const nextSource = sourcesRef.current.find((s) => s.id === nextFirstId)
          if (nextSource) void applyCoverFromSource(tripId, nextSource)
        }
      }
      toast.message("Fuente quitada · los ítems siguen en tu viaje")
    },
    [applyCoverFromSource],
  )

  const commitSourceToTrip = useCallback(
    (tripId: string, source: Source) => {
      if (!tripsRef.current.some((t) => t.id === tripId)) return false
      const wasEmpty =
        (tripsRef.current.find((t) => t.id === tripId)?.sourceIds.length ?? 0) === 0

      setSources((prev) => [...prev, source])
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t
          const next: Trip = { ...t, sourceIds: [...t.sourceIds, source.id] }
          const guideLabel = formatGuideLabel(source)
          const named =
            canRenameFromGuide(t, source) && guideLabel
              ? { ...next, name: guideLabel }
              : next
          if (!canAdoptGuideSchedule(t)) return named
          const total = source.totalDays
          if (!total || total < 1 || total > MAX_AUTO_DAYS) return named
          const days = [
            ...named.days,
            ...makeEmptyDays(Math.max(0, total - named.days.length)),
          ]
          return syncTripSchedule({ ...named, startDate: tomorrowISO() }, days)
        }),
      )

      if (wasEmpty) {
        void applyCoverFromSource(tripId, source)
      }
      scheduleMapsPinResolve(source)
      return true
    },
    [applyCoverFromSource, scheduleMapsPinResolve],
  )

  const runPendingExtraction = useCallback(
    async (pendingId: string, tripId: string, url: string) => {
      const ac = new AbortController()
      abortByPendingIdRef.current.get(pendingId)?.abort()
      abortByPendingIdRef.current.set(pendingId, ac)

      setPendingSources((prev) =>
        prev.map((p) =>
          p.id === pendingId
            ? {
                ...p,
                status: "loading",
                stage: isInstagramMediaUrl(url) ? "resolving" : "fetching",
                startedAt: Date.now(),
                errorMessage: undefined,
                errorKind: undefined,
                errorDestination: undefined,
              }
            : p,
        ),
      )

      try {
        const itinerary = await fetchItinerary(
          url,
          (stage) => {
            setPendingSources((prev) =>
              prev.map((p) => (p.id === pendingId ? { ...p, stage } : p)),
            )
          },
          { signal: ac.signal },
        )
        if (ac.signal.aborted) return

        const source = buildSource(url, itinerary)
        const committed = commitSourceToTrip(tripId, source)
        abortByPendingIdRef.current.delete(pendingId)
        setPendingSources((prev) => prev.filter((p) => p.id !== pendingId))

        if (committed) {
          const seq = ++extractionSeqRef.current
          setLastExtractionEvent({
            type: "success",
            tripId,
            pendingId,
            source,
            seq,
            at: Date.now(),
          })
        }
      } catch (err) {
        abortByPendingIdRef.current.delete(pendingId)
        if (isAbortError(err) || ac.signal.aborted) {
          setPendingSources((prev) => prev.filter((p) => p.id !== pendingId))
          return
        }

        let errorKind: PendingSourceErrorKind = "generic"
        let message =
          "No se pudo extraer la fuente. Comprueba la URL y que el backend esté en marcha."
        let errorDestination: string | undefined
        if (err instanceof ApiLimitError) {
          errorKind = err.limit === "guest" ? "guest-limit" : "limit"
          message = err.message
        } else if (err instanceof ExtractError) {
          message = err.message
          errorDestination = err.destination
          if (err.permanent) errorKind = "permanent"
        } else if (err instanceof Error && err.message.trim()) {
          message = err.message
        }

        setPendingSources((prev) =>
          prev.map((p) =>
            p.id === pendingId
              ? {
                  ...p,
                  status: "error",
                  stage: null,
                  errorMessage: message,
                  errorKind,
                  errorDestination,
                }
              : p,
          ),
        )
        const seq = ++extractionSeqRef.current
        setLastExtractionEvent({
          type: "error",
          tripId,
          pendingId,
          errorKind,
          message,
          destination: errorDestination,
          seq,
          at: Date.now(),
        })
      }
    },
    [commitSourceToTrip],
  )

  const startSourceExtraction = useCallback(
    (tripId: string, url: string): StartSourceExtractionResult => {
      const trip = tripsRef.current.find((t) => t.id === tripId)
      if (!trip) return { ok: false, reason: "trip-not-found" }

      const tripPendings = pendingSourcesRef.current.filter((p) => p.tripId === tripId)
      const loadingPendingCount = tripPendings.filter((p) => p.status === "loading").length
      if (loadingPendingCount > 0) {
        return { ok: false, reason: "already-loading" }
      }
      if (
        !canAddSource({
          sourceCount: trip.sourceIds.length,
          loadingPendingCount: 0,
        })
      ) {
        return { ok: false, reason: "max-sources" }
      }

      const pendingId = crypto.randomUUID()
      const pending: PendingSource = {
        id: pendingId,
        tripId,
        url: url.trim(),
        author: authorFromUrl(url.trim()),
        status: "loading",
        stage: isInstagramMediaUrl(url.trim()) ? "resolving" : "fetching",
        startedAt: Date.now(),
      }
      setPendingSources((prev) => [...prev, pending])
      void runPendingExtraction(pendingId, tripId, url.trim())
      return { ok: true, pendingId }
    },
    [runPendingExtraction],
  )

  const cancelPendingSource = useCallback((pendingId: string) => {
    const ac = abortByPendingIdRef.current.get(pendingId)
    if (ac) {
      ac.abort()
      abortByPendingIdRef.current.delete(pendingId)
    }
    setPendingSources((prev) => prev.filter((p) => p.id !== pendingId))
  }, [])

  const dismissPendingSource = useCallback((pendingId: string) => {
    const existing = pendingSourcesRef.current.find((p) => p.id === pendingId)
    if (!existing) return
    if (existing.status === "loading") {
      cancelPendingSource(pendingId)
      return
    }
    setPendingSources((prev) => prev.filter((p) => p.id !== pendingId))
  }, [cancelPendingSource])

  const retryPendingSource = useCallback(
    (pendingId: string): StartSourceExtractionResult => {
      const existing = pendingSourcesRef.current.find((p) => p.id === pendingId)
      if (!existing) return { ok: false, reason: "trip-not-found" }
      if (existing.status !== "error") return { ok: false, reason: "invalid-state" }
      if (existing.errorKind === "permanent") return { ok: false, reason: "invalid-state" }
      const trip = tripsRef.current.find((t) => t.id === existing.tripId)
      if (!trip) return { ok: false, reason: "trip-not-found" }

      const otherLoading = pendingSourcesRef.current.some(
        (p) => p.tripId === existing.tripId && p.status === "loading" && p.id !== pendingId,
      )
      if (otherLoading) return { ok: false, reason: "already-loading" }

      if (
        !canAddSource({
          sourceCount: trip.sourceIds.length,
          loadingPendingCount: 0,
        })
      ) {
        return { ok: false, reason: "max-sources" }
      }

      void runPendingExtraction(pendingId, existing.tripId, existing.url)
      return { ok: true, pendingId }
    },
    [runPendingExtraction],
  )

  const ackExtractionEvent = useCallback((seq: number) => {
    setLastExtractionEvent((prev) => (prev && prev.seq === seq ? null : prev))
  }, [])

  const refetchSource = useCallback(
    async (sourceId: string, url: string) => {
      setIsRefetchingSource(true)
      try {
        const itinerary = await fetchItinerary(url, undefined, { refresh: true })
        const rebuilt = buildSource(url, itinerary)
        const newSource: Source = { ...rebuilt, id: sourceId }

        // Remapear sourceItemId / sourceBasicItemId por type+nombre; no podar ítems del viaje.
        const itemIdByKey = new Map(
          newSource.items.map((i) => [`${i.type}:${normalizeName(i.name)}`, i.id] as const),
        )
        const basicIdByKey = new Map(
          newSource.basics.map(
            (b) => [`${b.category}:${normalizeName(b.name)}`, b.id] as const,
          ),
        )

        const isFirstOfSomeTrip = tripsRef.current.some(
          (t) => t.sourceIds[0] === sourceId,
        )

        setTrips((prev) => {
          const remapped = prev.map((t) => ({
            ...t,
            days: t.days.map((d) => ({
              ...d,
              items: d.items.map((i) => {
                if (i.sourceId !== sourceId) return i
                const nextId = itemIdByKey.get(`${i.type}:${normalizeName(i.name)}`)
                return nextId ? { ...i, sourceItemId: nextId } : i
              }),
            })),
            basics: t.basics.map((b) => {
              if (b.sourceId !== sourceId) return b
              const nextId = basicIdByKey.get(`${b.category}:${normalizeName(b.name)}`)
              return nextId ? { ...b, sourceBasicItemId: nextId } : b
            }),
          }))
          return hydrateDayItems(
            remapped,
            sourcesRef.current.map((s) => (s.id === sourceId ? newSource : s)),
          )
        })
        setSources((prev) => prev.map((s) => (s.id === sourceId ? newSource : s)))

        if (isFirstOfSomeTrip) {
          for (const trip of tripsRef.current) {
            if (trip.sourceIds[0] === sourceId) {
              void applyCoverFromSource(trip.id, newSource)
            }
          }
        }
        scheduleMapsPinResolve(newSource)
      } finally {
        setIsRefetchingSource(false)
      }
    },
    [applyCoverFromSource, scheduleMapsPinResolve],
  )
  const addDay = useCallback((tripId: string) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t
        const newDay: UserDay = { id: crypto.randomUUID(), label: "", items: [] }
        return syncTripSchedule(t, [...t.days, newDay])
      }),
    )
  }, [])

  const updateDayLabel = useCallback((tripId: string, dayId: string, label: string) => {
    setTrips((prev) =>
      prev.map((t) =>
        t.id !== tripId
          ? t
          : { ...t, days: t.days.map((d) => (d.id === dayId ? { ...d, label } : d)) },
      ),
    )
  }, [])

  const applyDaySummary = useCallback(
    (tripId: string, dayId: string, data: { label: string; signature: string }) => {
      setTrips((prev) =>
        prev.map((t) =>
          t.id !== tripId
            ? t
            : {
                ...t,
                days: t.days.map((d) =>
                  d.id === dayId
                    ? { ...d, label: data.label, summarySignature: data.signature }
                    : d,
                ),
              },
        ),
      )
    },
    [],
  )

  const removeDay = useCallback((tripId: string, dayId: string) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t
        const filtered = t.days.filter((d) => d.id !== dayId)
        if (filtered.length === 0) return t
        const days = clipSpanDaysInDays(
          reanchorSpannedStays(t.days, rescueLegsFromRemovedDays(t.days, filtered)),
        )
        return withPrunedTasks(syncTripSchedule(t, days))
      }),
    )
  }, [])

  const removeSelectedDays = useCallback((tripId: string, dayIds: string[]) => {
    const toRemove = new Set(dayIds)
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t
        // Ordenar por índice descendente para quitar de la cola del array sin desalinear; se detiene si quedaría 0 días.
        const marked = t.days
          .map((d, i) => ({ d, i }))
          .filter(({ d }) => toRemove.has(d.id))
          .sort((a, b) => b.i - a.i)
        let filtered = [...t.days]
        for (const { d } of marked) {
          if (filtered.length <= 1) break
          filtered = filtered.filter((x) => x.id !== d.id)
        }
        const days = clipSpanDaysInDays(
          reanchorSpannedStays(t.days, rescueLegsFromRemovedDays(t.days, filtered)),
        )
        return withPrunedTasks(syncTripSchedule(t, days))
      }),
    )
  }, [])

  const addItemToDay = useCallback((tripId: string, dayId: string, item: UserDayItem) => {
    setTrips((prev) =>
      prev.map((t) =>
        t.id !== tripId
          ? t
          : {
              ...t,
              days: t.days.map((d) =>
                d.id === dayId ? { ...d, items: [...d.items, item] } : d,
              ),
            },
      ),
    )
  }, [])

  /** Añade varios ítems a un día; omite los que ya están (mismo `sourceItemId`). */
  const addItemsToDay = useCallback((tripId: string, dayId: string, items: UserDayItem[]) => {
    if (items.length === 0) return
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t
        return {
          ...t,
          days: t.days.map((d) => {
            if (d.id !== dayId) return d
            const seen = new Set(d.items.map((i) => i.sourceItemId))
            const unique: UserDayItem[] = []
            for (const item of items) {
              if (seen.has(item.sourceItemId)) continue
              seen.add(item.sourceItemId)
              unique.push(item)
            }
            if (unique.length === 0) return d
            return { ...d, items: [...d.items, ...unique] }
          }),
        }
      }),
    )
  }, [])

  const addSourceRouteToTrip = useCallback((
    tripId: string,
    source: Source,
    items?: SourceItem[],
  ) => {
    const empty = {
      addedCount: 0,
      skippedExisting: 0,
      skippedPastCap: 0,
      daysCreated: 0,
    }
    const routeItems = items ?? sourceRouteItems(source)
    const trip = tripsRef.current.find((t) => t.id === tripId)
    if (!trip || routeItems.length === 0) return empty
    const plan = planSourceRouteImport(trip.days, routeItems)
    const summary = {
      addedCount: plan.addedCount,
      skippedExisting: plan.skippedExisting,
      skippedPastCap: plan.skippedPastCap,
      daysCreated: plan.daysToCreate,
    }
    if (plan.addedCount === 0 && plan.daysToCreate === 0) return summary
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t
        const applied = applySourceRouteImport(
          t.days,
          routeItems,
          (item) => userDayItemFromSource(item, source),
        )
        if (applied.addedCount === 0 && applied.daysCreated === 0) return t
        return syncTripSchedule(t, applied.days)
      }),
    )
    return summary
  }, [])

  const removeItemFromDay = useCallback((tripId: string, dayId: string, itemId: string) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t
        return withPrunedTasks({
          ...t,
          days: t.days.map((d) =>
            d.id === dayId ? { ...d, items: d.items.filter((i) => i.id !== itemId) } : d,
          ),
        })
      }),
    )
  }, [])

  const clearDayItems = useCallback((tripId: string, dayId: string) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t
        return withPrunedTasks({
          ...t,
          days: t.days.map((d) =>
            d.id === dayId
              ? {
                  ...d,
                  items: d.items.filter((i) => isRouteLegItem(i)),
                  summarySignature: null,
                }
              : d,
          ),
        })
      }),
    )
  }, [])

  const setDayItemCoords = useCallback(
    (
      tripId: string,
      itemId: string,
      coords: { lng: number; lat: number },
      region?: string | null,
    ) => {
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t
          let found = false
          const days = t.days.map((d) => {
            const idx = d.items.findIndex((i) => i.id === itemId)
            if (idx < 0) return d
            found = true
            const items = [...d.items]
            const prevItem = items[idx]!
            items[idx] = {
              ...prevItem,
              coords,
              ...(region !== undefined ? { region } : {}),
            }
            return { ...d, items }
          })
          return found ? { ...t, days } : t
        }),
      )
    },
    [],
  )

  const setItemSpanDays = useCallback(
    (tripId: string, itemId: string, spanDays: number | undefined) => {
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t
          let found = false
          const days = t.days.map((d, dayIndex) => {
            const idx = d.items.findIndex((i) => i.id === itemId)
            if (idx < 0) return d
            found = true
            const items = [...d.items]
            const prevItem = items[idx]!
            const nights = spanDays ?? 1
            items[idx] = applySpanDays(prevItem, nights, dayIndex, t.days.length)
            return { ...d, items }
          })
          return found ? { ...t, days } : t
        }),
      )
    },
    [],
  )

  const updateDayItem = useCallback(
    (
      tripId: string,
      params: { dayId: string; item: UserDayItem },
    ): { ok: true } | { ok: false; error: string } => {
      const trip = tripsRef.current.find((t) => t.id === tripId)
      if (!trip) return { ok: false, error: "Viaje no encontrado." }
      if (!trip.days.some((d) => d.id === params.dayId)) {
        return { ok: false, error: "Día no encontrado." }
      }
      if (params.item.type === "transport") {
        return { ok: false, error: "Los traslados se editan en su propio formulario." }
      }

      let existing: UserDayItem | null = null
      let oldDayId: string | null = null
      let oldIndex = -1
      for (const day of trip.days) {
        const idx = day.items.findIndex((i) => i.id === params.item.id)
        if (idx >= 0) {
          existing = day.items[idx]!
          oldDayId = day.id
          oldIndex = idx
          break
        }
      }
      if (!existing || oldDayId == null) {
        return { ok: false, error: "Ítem no encontrado." }
      }
      if (existing.type !== params.item.type) {
        return { ok: false, error: "No se puede cambiar el tipo." }
      }
      if (existing.route?.leg) {
        return { ok: false, error: "Los tramos de ida/vuelta se editan aparte." }
      }

      const targetDayIndex = trip.days.findIndex((d) => d.id === params.dayId)
      let nextItem: UserDayItem = {
        ...existing,
        name: params.item.name.trim(),
        detail: params.item.detail ?? null,
        region: params.item.region ?? null,
        coords: params.item.coords ?? null,
      }
      if (itemTakesCalendarSpan(existing.type)) {
        nextItem = applySpanDays(
          nextItem,
          parseSpanDays(params.item.spanDays) ?? 1,
          targetDayIndex,
          trip.days.length,
        )
      } else if (nextItem.spanDays !== undefined) {
        const rest = { ...nextItem }
        delete rest.spanDays
        nextItem = rest
      }

      const oldKey = taskKeyForItem(existing)
      const newKey = taskKeyForItem(nextItem)
      const requested = parseSpanDays(params.item.spanDays)
      const nextSpan = parseSpanDays(nextItem.spanDays) ?? 1
      let clipNotice: string | null = null
      if (requested != null && nextSpan < requested) {
        clipNotice = spanClipNotice(existing.type, nextSpan, trip.days.length)
      }

      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t

          const days = t.days.map((d) => {
            let items = d.items
            if (d.id === oldDayId) {
              items = items.filter((i) => i.id !== existing!.id)
            }
            if (d.id === params.dayId) {
              if (oldDayId === params.dayId && oldIndex >= 0) {
                const next = [...items]
                const insertAt = Math.min(oldIndex, next.length)
                next.splice(insertAt, 0, nextItem)
                return { ...d, items: next }
              }
              return { ...d, items: [...items, nextItem] }
            }
            return items === d.items ? d : { ...d, items }
          })

          let tasks = t.tasks
          if (oldKey !== newKey) {
            tasks = migrateTaskKeyOnStructure({ tasks, oldKey, newKey })
          }
          return withPrunedTasks({ ...t, tasks, days })
        }),
      )
      if (clipNotice) toast.message(clipNotice)
      return { ok: true }
    },
    [],
  )

  const moveItemBetweenDays = useCallback((
    tripId: string,
    params: { fromDayId: string; toDayId: string; itemId: string; toIndex: number },
  ) => {
    const { fromDayId, toDayId, itemId, toIndex } = params
    let clipNotice: string | null = null
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t

        const fromDay = t.days.find((d) => d.id === fromDayId)
        const toDay = t.days.find((d) => d.id === toDayId)
        if (!fromDay || !toDay) return t

        const fromIndex = fromDay.items.findIndex((i) => i.id === itemId)
        if (fromIndex < 0) return t

        const movingItem = fromDay.items[fromIndex]
        const sourceItems = [...fromDay.items]
        sourceItems.splice(fromIndex, 1)

        const sameDay = fromDayId === toDayId
        const targetBase = sameDay ? sourceItems : [...toDay.items]
        const safeIndex = Math.max(0, Math.min(toIndex, targetBase.length))
        const toDayIndex = t.days.findIndex((d) => d.id === toDayId)
        const requested = parseSpanDays(movingItem.spanDays)
        const placed =
          !sameDay && itemTakesCalendarSpan(movingItem.type) && requested != null
            ? applySpanDays(movingItem, requested, toDayIndex, t.days.length)
            : movingItem
        if (placed !== movingItem && requested != null) {
          const nextSpan = parseSpanDays(placed.spanDays) ?? 1
          if (nextSpan < requested) {
            clipNotice = spanClipNotice(movingItem.type, nextSpan, t.days.length)
          }
        }
        const targetItems = [...targetBase]
        targetItems.splice(safeIndex, 0, placed)

        return {
          ...t,
          // Mismo día: un solo array reordenado; días distintos: se actualizan el origen (sin el ítem) y el destino.
          days: t.days.map((d) => {
            if (d.id === fromDayId && d.id === toDayId) {
              return { ...d, items: targetItems }
            }
            if (d.id === fromDayId) {
              return { ...d, items: sourceItems }
            }
            if (d.id === toDayId) {
              return { ...d, items: targetItems }
            }
            return d
          }),
        }
      }),
    )
    if (clipNotice) toast.message(clipNotice)
  }, [])

  const addBasicToTrip = useCallback((tripId: string, basic: UserBasicItem) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t
        // Misma oferta de la misma fuente: no duplicar filas de básicos.
        const dup = t.basics.some(
          (b) => b.sourceBasicItemId === basic.sourceBasicItemId && b.sourceId === basic.sourceId,
        )
        if (dup) return t
        return { ...t, basics: [...t.basics, basic] }
      }),
    )
  }, [])

  const removeBasicFromTrip = useCallback((tripId: string, basicId: string) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t
        return withPrunedTasks({
          ...t,
          basics: t.basics.filter((b) => b.id !== basicId),
        })
      }),
    )
  }, [])

  const setNumTravelers = useCallback((tripId: string, numTravelers: number | null) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t
        const next =
          numTravelers == null || !Number.isFinite(numTravelers) || numTravelers < 1
            ? null
            : Math.floor(numTravelers)
        return { ...t, numTravelers: next }
      }),
    )
  }, [])

  const setTripCurrency = useCallback((tripId: string, currency: string) => {
    setTrips((prev) =>
      prev.map((t) =>
        t.id !== tripId
          ? t
          : { ...t, currency: currency.trim() ? currency.trim().toUpperCase() : "EUR" },
      ),
    )
  }, [])

  const setTripBudget = useCallback((tripId: string, next: TripBudget | null) => {
    setTrips((prev) =>
      prev.map((t) => (t.id !== tripId ? t : { ...t, budget: normalizeTripBudget(next) })),
    )
  }, [])

  const setShareCard = useCallback((tripId: string, next: ShareCard | null) => {
    setTrips((prev) => prev.map((t) => (t.id !== tripId ? t : { ...t, shareCard: next })))
  }, [])

  const upsertRouteLeg = useCallback(
    (
      tripId: string,
      data: {
        leg: RouteLeg
        route: Omit<TransportRoute, "leg"> & {
          from: TransportRoute["from"]
          to: TransportRoute["to"]
        }
        detail?: string | null
        vendor?: string | null
        origin?: TripOrigin | null
        createMirrorReturn?: boolean
      },
    ): { ok: true } | { ok: false; error: string } => {
      const trip = tripsRef.current.find((t) => t.id === tripId)
      if (!trip) return { ok: false, error: "Viaje no encontrado." }
      if (trip.days.length === 0) return { ok: false, error: "El viaje no tiene días." }

      const existing = trip.days
        .flatMap((d) => d.items)
        .find((i) => i.type === "transport" && i.route?.leg === data.leg)

      const route: TransportRoute = {
        from: data.route.from,
        to: data.route.to,
        mode: data.route.mode ?? null,
        leg: data.leg,
      }

      const item = buildRouteLegItem({
        route: { ...route, leg: data.leg },
        detail: data.detail,
        vendor: data.vendor,
        existingId: existing?.id,
        existingSourceItemId: existing?.sourceItemId,
      })

      const existingReturn = findLegItem(trip.days, "return")
      const shouldCreateMirror =
        data.leg === "outbound" &&
        Boolean(data.createMirrorReturn) &&
        !existingReturn
      const shouldSyncMirror =
        data.leg === "outbound" &&
        Boolean(existing) &&
        Boolean(existingReturn) &&
        isMirroredFlightRoundtrip(trip.days)

      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t
          const nextOrigin =
            t.origin == null && data.origin != null ? data.origin : t.origin
          let days = upsertLegInDays(t.days, item)
          if (shouldCreateMirror) {
            const retItem = buildRouteLegItem({
              route: {
                from: data.route.to,
                to: data.route.from,
                mode: data.route.mode ?? null,
                leg: "return",
              },
              detail: data.detail,
              vendor: data.vendor,
            })
            days = upsertLegInDays(days, retItem)
          } else if (shouldSyncMirror && existingReturn) {
            const retItem = buildRouteLegItem({
              route: {
                from: data.route.to,
                to: data.route.from,
                mode: data.route.mode ?? null,
                leg: "return",
              },
              detail: existingReturn.item.detail,
              vendor: existingReturn.item.vendor,
              existingId: existingReturn.item.id,
              existingSourceItemId: existingReturn.item.sourceItemId,
            })
            days = upsertLegInDays(days, retItem)
          }
          return withPrunedTasks(syncTripSchedule({ ...t, origin: nextOrigin }, days))
        }),
      )
      return { ok: true }
    },
    [],
  )

  const upsertTransportRouteItem = useCallback(
    (
      tripId: string,
      data: {
        dayId: string
        itemId?: string
        route: Omit<TransportRoute, "leg"> & {
          from: TransportRoute["from"]
          to: TransportRoute["to"]
        }
        detail?: string | null
        vendor?: string | null
      },
    ): { ok: true } | { ok: false; error: string } => {
      const trip = tripsRef.current.find((t) => t.id === tripId)
      if (!trip) return { ok: false, error: "Viaje no encontrado." }
      if (!trip.days.some((d) => d.id === data.dayId)) {
        return { ok: false, error: "Día no encontrado." }
      }

      let existing: UserDayItem | null = null
      let oldDayId: string | null = null
      let oldIndex = -1
      if (data.itemId) {
        for (const day of trip.days) {
          const idx = day.items.findIndex((i) => i.id === data.itemId)
          if (idx >= 0) {
            existing = day.items[idx]!
            oldDayId = day.id
            oldIndex = idx
            break
          }
        }
        if (!existing) return { ok: false, error: "Ítem no encontrado." }
        if (existing.type !== "transport") {
          return { ok: false, error: "Solo se pueden estructurar transportes." }
        }
        if (existing.route?.leg) {
          return { ok: false, error: "Los tramos de ida/vuelta se editan aparte." }
        }
      }

      const oldKey = existing ? taskKeyForItem(existing) : null
      const item = buildTransportRouteItem({
        route: {
          from: data.route.from,
          to: data.route.to,
          mode: data.route.mode ?? null,
        },
        detail: data.detail,
        vendor: data.vendor,
        existing,
      })
      const newKey = taskKeyForItem(item)

      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t

          const days = t.days.map((d) => {
            let items = d.items
            if (existing && d.id === oldDayId) {
              items = items.filter((i) => i.id !== existing!.id)
            }
            if (d.id === data.dayId) {
              if (existing && oldDayId === data.dayId && oldIndex >= 0) {
                const next = [...items]
                const insertAt = Math.min(oldIndex, next.length)
                next.splice(insertAt, 0, item)
                return { ...d, items: next }
              }
              return { ...d, items: [...items, item] }
            }
            return items === d.items ? d : { ...d, items }
          })

          let tasks = t.tasks
          if (oldKey && oldKey !== newKey) {
            tasks = migrateTaskKeyOnStructure({ tasks, oldKey, newKey })
          }
          return withPrunedTasks(syncTripSchedule({ ...t, tasks }, days))
        }),
      )
      return { ok: true }
    },
    [],
  )

  const setTaskState = useCallback(
    (tripId: string, taskKey: string, patch: Partial<TripTaskState>) => {
      const now = new Date().toISOString()
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t
          const extraIdx = t.extraTasks.findIndex((e) => e.id === taskKey)
          if (extraIdx >= 0) {
            const extraTasks = t.extraTasks.map((e, i) =>
              i === extraIdx
                ? { ...e, state: mergeTaskState(e.state, patch, now) }
                : e,
            )
            return { ...t, extraTasks }
          }
          const folded = foldMirroredFlightReturnCost(t.tasks, t.days)
          return {
            ...t,
            tasks: {
              ...folded,
              [taskKey]: mergeTaskState(folded[taskKey], patch, now),
            },
          }
        }),
      )
    },
    [],
  )

  const addExtraTask = useCallback(
    (
      tripId: string,
      data: { title: string; category: TripTaskCategory; state?: Partial<TripTaskState> },
    ): ExtraTask => {
      const extra: ExtraTask = {
        id: crypto.randomUUID(),
        title: data.title.trim(),
        category: data.category,
        state: createExtraTaskState(data.state),
      }
      setTrips((prev) =>
        prev.map((t) =>
          t.id !== tripId ? t : { ...t, extraTasks: [...t.extraTasks, extra] },
        ),
      )
      return extra
    },
    [],
  )

  const removeExtraTask = useCallback((tripId: string, taskId: string) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t
        const nextExtras = t.extraTasks.filter((e) => e.id !== taskId)
        // Tareas de país eliminadas → descartadas para no resucitar al instante.
        if (isCountryTaskId(taskId)) {
          const dismissed = t.dismissedCountryTasks.includes(taskId)
            ? t.dismissedCountryTasks
            : [...t.dismissedCountryTasks, taskId]
          return { ...t, extraTasks: nextExtras, dismissedCountryTasks: dismissed }
        }
        return { ...t, extraTasks: nextExtras }
      }),
    )
  }, [])

  const acceptCountryTask = useCallback(
    (
      tripId: string,
      data: {
        id: string
        title: string
        category: TripTaskCategory
        state?: Partial<TripTaskState>
      },
    ): ExtraTask | null => {
      const id = data.id.trim()
      if (!id || !isCountryTaskId(id)) return null
      let created: ExtraTask | null = null
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t
          if (t.extraTasks.some((e) => e.id === id)) return t
          const extra: ExtraTask = {
            id,
            title: data.title.trim(),
            category: data.category,
            state: createExtraTaskState(data.state),
          }
          created = extra
          return {
            ...t,
            extraTasks: [...t.extraTasks, extra],
            dismissedCountryTasks: t.dismissedCountryTasks.filter((d) => d !== id),
          }
        }),
      )
      return created
    },
    [],
  )

  const dismissCountryTask = useCallback((tripId: string, taskId: string) => {
    const id = taskId.trim()
    if (!id) return
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t
        if (t.dismissedCountryTasks.includes(id)) return t
        return {
          ...t,
          dismissedCountryTasks: [...t.dismissedCountryTasks, id],
        }
      }),
    )
  }, [])

  const reevaluateCountryTasks = useCallback(
    (tripId: string, activeCountryCodes: string[]) => {
      const active = new Set(
        activeCountryCodes.map((c) => c.trim().toUpperCase()).filter(Boolean),
      )
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t
          const next = t.dismissedCountryTasks.filter((id) => {
            const code = countryCodeFromTaskId(id)
            // Conserva descartes de países ya no activos; limpia los activos.
            return code == null || !active.has(code)
          })
          if (next.length === t.dismissedCountryTasks.length) return t
          return { ...t, dismissedCountryTasks: next }
        }),
      )
    },
    [],
  )

  const updateExtraTask = useCallback(
    (
      tripId: string,
      taskId: string,
      data: { title?: string; category?: TripTaskCategory },
    ) => {
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== tripId) return t
          return {
            ...t,
            extraTasks: t.extraTasks.map((e) => {
              if (e.id !== taskId) return e
              return {
                ...e,
                title: data.title !== undefined ? data.title.trim() : e.title,
                category: data.category ?? e.category,
              }
            }),
          }
        }),
      )
    },
    [],
  )

  const value = useMemo<TripContextValue>(
    () => ({
      trips,
      sources,
      isLoading,
      flushPendingSync,
      reloadTrips,
      createTrip,
      updateTrip,
      deleteTrip,
      archiveTrip,
      unarchiveTrip,
      leaveTrip,
      applyRemoteTrip,
      ingestRemote,
      savedTrip,
      dropTrip,
      getTrip,
      getTripSources,
      startSourceExtraction,
      cancelPendingSource,
      retryPendingSource,
      dismissPendingSource,
      pendingSources,
      lastExtractionEvent,
      ackExtractionEvent,
      refetchSource,
      isRefetchingSource,
      removeSourceFromTrip,
      ensureArticleHtml,
      isArticleHtmlLoading,
      loadTripSourcesWithArticles,
      addDay,
      updateDayLabel,
      applyDaySummary,
      removeDay,
      removeSelectedDays,
      addItemToDay,
      addItemsToDay,
      addSourceRouteToTrip,
      removeItemFromDay,
      clearDayItems,
      setDayItemCoords,
      setItemSpanDays,
      updateDayItem,
      moveItemBetweenDays,
      addBasicToTrip,
      removeBasicFromTrip,
      setTaskState,
      addExtraTask,
      removeExtraTask,
      updateExtraTask,
      acceptCountryTask,
      dismissCountryTask,
      reevaluateCountryTasks,
      setNumTravelers,
      setTripCurrency,
      setTripBudget,
      setShareCard,
      upsertRouteLeg,
      upsertTransportRouteItem,
    }),
    [trips, sources, isLoading, flushPendingSync, reloadTrips, createTrip, updateTrip, deleteTrip, archiveTrip, unarchiveTrip, leaveTrip, applyRemoteTrip, ingestRemote, savedTrip, dropTrip, getTrip, getTripSources, startSourceExtraction, cancelPendingSource, retryPendingSource, dismissPendingSource, pendingSources, lastExtractionEvent, ackExtractionEvent, refetchSource, isRefetchingSource, removeSourceFromTrip, ensureArticleHtml, isArticleHtmlLoading, loadTripSourcesWithArticles, addDay, updateDayLabel, applyDaySummary, removeDay, removeSelectedDays, addItemToDay, addItemsToDay, addSourceRouteToTrip, removeItemFromDay, clearDayItems, setDayItemCoords, setItemSpanDays, updateDayItem, moveItemBetweenDays, addBasicToTrip, removeBasicFromTrip, setTaskState, addExtraTask, removeExtraTask, updateExtraTask, acceptCountryTask, dismissCountryTask, reevaluateCountryTasks, setNumTravelers, setTripCurrency, setTripBudget, setShareCard, upsertRouteLeg, upsertTransportRouteItem],
  )

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}

export function useTrips() {
  const ctx = useContext(TripContext)
  if (!ctx) throw new Error("useTrips must be used within TripProvider")
  return ctx
}
