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
  Source,
  UserDay,
  UserDayItem,
  UserBasicItem,
  TripTaskState,
  TripTaskCategory,
  ExtraTask,
} from "@/types/itinerary"
import { fetchItinerary, type ItineraryProgressStage } from "@/lib/api"
import { buildSource } from "@/lib/itinerary-utils"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { fetchArticleHtml, loadTripsState, TripsSyncer } from "@/lib/db/trips-repo"
import { useAuth } from "@/lib/auth-context"
import { coverQueriesFromSource, fetchCoverFromQueries } from "@/lib/unsplash"
import { endDateFromStartAndNumDays } from "@/lib/trip-dates"
import { createExtraTaskState, mergeTaskState, withPrunedTasks } from "@/lib/trip-tasks"

/** Alinea numDays y endDate con days.length (+ startDate inclusive). */
function syncTripSchedule(trip: Trip, days: UserDay[]): Trip {
  const numDays = days.length
  const endDate = trip.startDate
    ? endDateFromStartAndNumDays(trip.startDate, numDays)
    : null
  return { ...trip, days, numDays, endDate }
}

interface TripContextValue {
  trips: Trip[]
  sources: Source[]
  /** Viajes y fuentes aún cargándose: la UI no debe concluir que un viaje no existe. */
  isLoading: boolean
  createTrip: (data: {
    name: string
    countries: string[]
    startDate: string | null
    endDate: string | null
    numDays: number | null
    expectations: string | null
  }) => Trip
  updateTrip: (
    tripId: string,
    data: {
      name: string
      startDate: string | null
      endDate: string | null
      numDays: number | null
      expectations: string | null
    },
  ) => { ok: true } | { ok: false; error: string }
  deleteTrip: (tripId: string) => void
  archiveTrip: (tripId: string) => void
  unarchiveTrip: (tripId: string) => void

  getTrip: (tripId: string) => Trip | undefined
  getTripSources: (tripId: string) => Source[]
  addSourceToTrip: (
    tripId: string,
    url: string,
    options?: { signal?: AbortSignal },
  ) => Promise<Source>
  /** Vuelve a descargar itinerario + HTML del artículo; conserva el id de la fuente. */
  refetchSource: (sourceId: string, url: string) => Promise<void>
  removeSourceFromTrip: (tripId: string, sourceId: string) => void
  isLoadingSource: boolean
  /** Etapa SSE de la extracción en curso (null si no hay ninguna). */
  loadingSourceStage: ItineraryProgressStage | null
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
  removeItemFromDay: (tripId: string, dayId: string, itemId: string) => void
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

  /** Viajeros del viaje (T4.3: coste por persona). `null` = no configurado. */
  setNumTravelers: (tripId: string, numTravelers: number | null) => void
  /** Divisa del viaje (ISO 4217). Vacío → EUR. */
  setTripCurrency: (tripId: string, currency: string) => void
}

const TripContext = createContext<TripContextValue | null>(null)

export function TripProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const [trips, setTrips] = useState<Trip[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [rehydrated, setRehydrated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingSource, setIsLoadingSource] = useState(false)
  const [loadingSourceStage, setLoadingSourceStage] = useState<ItineraryProgressStage | null>(
    null,
  )
  const [loadingArticleIds, setLoadingArticleIds] = useState<string[]>([])
  const tripsRef = useRef(trips)
  const sourcesRef = useRef(sources)
  const coverBackfillAttempted = useRef(new Set<string>())
  const syncerRef = useRef<TripsSyncer | null>(null)
  const hydratedFor = useRef<string | null>(null)

  useEffect(() => {
    tripsRef.current = trips
  }, [trips])

  useEffect(() => {
    sourcesRef.current = sources
  }, [sources])

  // Hidratación por usuario: al cerrar sesión se vacía el estado y se descarta el sincronizador.
  useEffect(() => {
    if (authLoading) return
    const userId = user?.id ?? null

    if (!userId || !isSupabaseConfigured()) {
      syncerRef.current?.dispose()
      syncerRef.current = null
      hydratedFor.current = null
      coverBackfillAttempted.current.clear()
      setTrips([])
      setSources([])
      setRehydrated(false)
      setIsLoading(false)
      return
    }

    // Ya hidratado con éxito para este usuario (evita recargas en refrescos de sesión).
    if (hydratedFor.current === userId) return

    setIsLoading(true)
    setRehydrated(false)

    const supabase = createClient()
    const syncer = new TripsSyncer(supabase, userId, () => {
      toast.error("No hemos podido guardar los últimos cambios. Reintentando…")
    })
    syncerRef.current?.dispose()
    syncerRef.current = syncer

    let active = true
    let completed = false
    void (async () => {
      try {
        const snapshot = await loadTripsState(supabase, userId)
        if (!active) return
        syncer.reset(snapshot)
        setTrips(snapshot.trips)
        setSources(snapshot.sources)
        setRehydrated(true)
        hydratedFor.current = userId
        completed = true
      } catch {
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

  const applyCoverFromSource = useCallback(async (tripId: string, source: Source) => {
    const queries = coverQueriesFromSource(source)
    // Unsplash (destino/país) → og:image del artículo → emoji (coverUrl null)
    const unsplashUrl = await fetchCoverFromQueries(queries)
    const url = unsplashUrl ?? (source.ogImage?.trim() || null)
    setTrips((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, coverUrl: url } : t)),
    )
  }, [])

  // Backfill: viajes con fuentes y sin coverUrl (mocks / datos previos al cambio).
  useEffect(() => {
    if (!rehydrated) return
    for (const trip of tripsRef.current) {
      if (trip.sourceIds.length === 0 || trip.coverUrl) continue
      if (coverBackfillAttempted.current.has(trip.id)) continue
      const firstId = trip.sourceIds[0]
      const source = sourcesRef.current.find((s) => s.id === firstId)
      if (!source) continue
      coverBackfillAttempted.current.add(trip.id)
      void applyCoverFromSource(trip.id, source)
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
    }): Trip => {
    const dayCount = data.numDays && data.numDays > 0 ? data.numDays : 1
    const days: UserDay[] = Array.from({ length: dayCount }, () => ({
      id: crypto.randomUUID(),
      label: "",
      items: [],
    }))

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
        numTravelers: null,
        currency: "EUR",
        archived: false,
      },
      days,
    )
    setTrips((prev) => [...prev, trip])
    return trip
  }, [])

  const updateTrip = useCallback(
    (
      tripId: string,
      data: {
        name: string
        startDate: string | null
        endDate: string | null
        numDays: number | null
        expectations: string | null
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
      const next: Source = { ...current, articleHtml: html }
      // Ya está persistido: evita que el diffing lo reescriba en el siguiente upsert.
      syncerRef.current?.acknowledgeSource(next)
      setSources((prev) => prev.map((s) => (s.id === sourceId ? next : s)))
    } catch {
      /* la Crónica muestra su propio estado vacío */
    } finally {
      setLoadingArticleIds((prev) => prev.filter((id) => id !== sourceId))
    }
  }, [])

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
      if (missing.length === 0 || !isSupabaseConfigured()) return tripSources

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
      // El estado se actualiza para no repetir la descarga; el retorno no espera al re-render.
      setSources((prev) =>
        prev.map((s) => {
          const html = htmlById.get(s.id)
          if (!html) return s
          const next: Source = { ...s, articleHtml: html }
          syncerRef.current?.acknowledgeSource(next)
          return next
        }),
      )
      return tripSources.map((s) => {
        const html = htmlById.get(s.id)
        return html ? { ...s, articleHtml: html } : s
      })
    },
    [],
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

      const nextTrips: Trip[] = tripsRef.current.map((t) => {
        if (t.id !== tripId) return t
        return withPrunedTasks({
          ...t,
          sourceIds: t.sourceIds.filter((id) => id !== sourceId),
          days: t.days.map((d) => ({
            ...d,
            items: d.items.filter((i) => i.sourceId !== sourceId),
          })),
          basics: t.basics.filter((b) => b.sourceId !== sourceId),
          ...(wasFirst ? { coverUrl: null } : {}),
        })
      })
      setTrips(nextTrips)
      setSources((prev) => {
        // No guardar `Source` que ya ningún `Trip` referencia (evita fuentes huérfanas en el array global).
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
    },
    [applyCoverFromSource],
  )

  const addSourceToTrip = useCallback(
    async (
      tripId: string,
      url: string,
      options?: { signal?: AbortSignal },
    ): Promise<Source> => {
      setIsLoadingSource(true)
      setLoadingSourceStage("fetching")
      try {
        const itinerary = await fetchItinerary(
          url,
          (stage) => setLoadingSourceStage(stage),
          { signal: options?.signal },
        )
        const source = buildSource(url, itinerary)
        const wasEmpty =
          (tripsRef.current.find((t) => t.id === tripId)?.sourceIds.length ?? 0) === 0

        setSources((prev) => [...prev, source])
        setTrips((prev) =>
          prev.map((t) =>
            t.id === tripId ? { ...t, sourceIds: [...t.sourceIds, source.id] } : t,
          ),
        )

        if (wasEmpty) {
          void applyCoverFromSource(tripId, source)
        }
        return source
      } finally {
        setIsLoadingSource(false)
        setLoadingSourceStage(null)
      }
    },
    [applyCoverFromSource],
  )

  const refetchSource = useCallback(
    async (sourceId: string, url: string) => {
      setIsLoadingSource(true)
      setLoadingSourceStage("fetching")
      try {
        const itinerary = await fetchItinerary(
          url,
          (stage) => setLoadingSourceStage(stage),
          { refresh: true },
        )
        const rebuilt = buildSource(url, itinerary)
        const newSource: Source = { ...rebuilt, id: sourceId }
        // `rebuild` genera nuevos ids de ítems; solo conservamos entradas del viaje cuyo `sourceItemId` / `sourceBasicItemId` siga existiendo en la fuente refrescada.
        const newItemIds = new Set(newSource.items.map((i) => i.id))
        const newBasicIds = new Set(newSource.basics.map((b) => b.id))

        const isFirstOfSomeTrip = tripsRef.current.some(
          (t) => t.sourceIds[0] === sourceId,
        )

        setTrips((prev) =>
          prev.map((t) =>
            withPrunedTasks({
              ...t,
              days: t.days.map((d) => ({
                ...d,
                items: d.items.filter(
                  (i) => i.sourceId !== sourceId || newItemIds.has(i.sourceItemId),
                ),
              })),
              basics: t.basics.filter(
                (b) => b.sourceId !== sourceId || newBasicIds.has(b.sourceBasicItemId),
              ),
            }),
          ),
        )
        setSources((prev) => prev.map((s) => (s.id === sourceId ? newSource : s)))

        if (isFirstOfSomeTrip) {
          for (const trip of tripsRef.current) {
            if (trip.sourceIds[0] === sourceId) {
              void applyCoverFromSource(trip.id, newSource)
            }
          }
        }
      } finally {
        setIsLoadingSource(false)
        setLoadingSourceStage(null)
      }
    },
    [applyCoverFromSource],
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
        const days = t.days.filter((d) => d.id !== dayId)
        if (days.length === 0) return t
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
        let days = [...t.days]
        for (const { d } of marked) {
          if (days.length <= 1) break
          days = days.filter((x) => x.id !== d.id)
        }
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

  const moveItemBetweenDays = useCallback((
    tripId: string,
    params: { fromDayId: string; toDayId: string; itemId: string; toIndex: number },
  ) => {
    const { fromDayId, toDayId, itemId, toIndex } = params
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
        const targetItems = [...targetBase]
        targetItems.splice(safeIndex, 0, movingItem)

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
          return {
            ...t,
            tasks: {
              ...t.tasks,
              [taskKey]: mergeTaskState(t.tasks[taskKey], patch, now),
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
      prev.map((t) =>
        t.id !== tripId
          ? t
          : { ...t, extraTasks: t.extraTasks.filter((e) => e.id !== taskId) },
      ),
    )
  }, [])

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
      createTrip,
      updateTrip,
      deleteTrip,
      archiveTrip,
      unarchiveTrip,
      getTrip,
      getTripSources,
      addSourceToTrip,
      refetchSource,
      removeSourceFromTrip,
      isLoadingSource,
      loadingSourceStage,
      ensureArticleHtml,
      isArticleHtmlLoading,
      loadTripSourcesWithArticles,
      addDay,
      updateDayLabel,
      applyDaySummary,
      removeDay,
      removeSelectedDays,
      addItemToDay,
      removeItemFromDay,
      moveItemBetweenDays,
      addBasicToTrip,
      removeBasicFromTrip,
      setTaskState,
      addExtraTask,
      removeExtraTask,
      updateExtraTask,
      setNumTravelers,
      setTripCurrency,
    }),
    [trips, sources, isLoading, createTrip, updateTrip, deleteTrip, archiveTrip, unarchiveTrip, getTrip, getTripSources, addSourceToTrip, refetchSource, removeSourceFromTrip, isLoadingSource, loadingSourceStage, ensureArticleHtml, isArticleHtmlLoading, loadTripSourcesWithArticles, addDay, updateDayLabel, applyDaySummary, removeDay, removeSelectedDays, addItemToDay, removeItemFromDay, moveItemBetweenDays, addBasicToTrip, removeBasicFromTrip, setTaskState, addExtraTask, removeExtraTask, updateExtraTask, setNumTravelers, setTripCurrency],
  )

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}

export function useTrips() {
  const ctx = useContext(TripContext)
  if (!ctx) throw new Error("useTrips must be used within TripProvider")
  return ctx
}
