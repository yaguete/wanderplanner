"use client"

/**
 * Estado global de viajes y fuentes: en cliente se rehidrata y persiste en `localStorage`
 * (`lib/trip-persistence.ts`); el primer arranque o si no hay datos guardados usa mocks. Sin backend de persistencia.
 * Expone `TripProvider` / `useTrips()`. Al tocar `removeSourceFromTrip`, `refetchSource` o
 * añadir ítems, respeta la semántica de `sourceId` / `sourceItemId` / `sourceBasicItemId` en `types/itinerary`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { Trip, Source, UserDay, UserDayItem, UserBasicItem } from "@/types/itinerary"
import { MOCK_TRIPS, MOCK_SOURCES } from "@/lib/mock-data"
import { fetchItinerary } from "@/lib/api"
import { buildSource } from "@/lib/itinerary-utils"
import { loadTripsState, saveTripsState } from "@/lib/trip-persistence"
import { coverQueriesFromSource, fetchCoverFromQueries } from "@/lib/unsplash"
import { clearAssistantState } from "@/lib/assistant-persistence"

interface TripContextValue {
  trips: Trip[]
  sources: Source[]
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
  addSourceToTrip: (tripId: string, url: string) => Promise<Source>
  /** Vuelve a descargar itinerario + HTML del artículo; conserva el id de la fuente. */
  refetchSource: (sourceId: string, url: string) => Promise<void>
  removeSourceFromTrip: (tripId: string, sourceId: string) => void
  isLoadingSource: boolean

  addDay: (tripId: string) => void
  updateDayLabel: (tripId: string, dayId: string, label: string) => void
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
}

const TripContext = createContext<TripContextValue | null>(null)

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [trips, setTrips] = useState<Trip[]>(MOCK_TRIPS)
  const [sources, setSources] = useState<Source[]>(MOCK_SOURCES)
  const [rehydrated, setRehydrated] = useState(false)
  const [isLoadingSource, setIsLoadingSource] = useState(false)
  const tripsRef = useRef(trips)
  const sourcesRef = useRef(sources)
  const coverBackfillAttempted = useRef(new Set<string>())

  useEffect(() => {
    tripsRef.current = trips
  }, [trips])

  useEffect(() => {
    sourcesRef.current = sources
  }, [sources])

  useLayoutEffect(() => {
    const saved = loadTripsState()
    if (saved) {
      setTrips(saved.trips)
      setSources(saved.sources)
    }
    setRehydrated(true)
  }, [])

  useEffect(() => {
    if (!rehydrated) return
    saveTripsState(trips, sources)
  }, [trips, sources, rehydrated])

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

    const trip: Trip = {
      id: crypto.randomUUID(),
      name: data.name,
      countries: data.countries,
      startDate: data.startDate,
      endDate: data.endDate,
      numDays: data.numDays,
      expectations: data.expectations?.trim() ? data.expectations.trim() : null,
      cover: "✈️",
      coverUrl: null,
      sourceIds: [],
      days,
      basics: [],
      archived: false,
    }
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
          }
          return {
            ...t,
            name: data.name,
            startDate: data.startDate,
            endDate: data.endDate,
            numDays: data.numDays,
            expectations: data.expectations?.trim() ? data.expectations.trim() : null,
            days,
          }
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

  const deleteTrip = useCallback((tripId: string) => {
    setTrips((prev) => {
      const next = prev.filter((t) => t.id !== tripId)
      setSources((sPrev) => {
        const used = new Set(next.flatMap((t) => t.sourceIds))
        return sPrev.filter((s) => used.has(s.id))
      })
      return next
    })
    clearAssistantState(tripId)
  }, [])

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
        return {
          ...t,
          sourceIds: t.sourceIds.filter((id) => id !== sourceId),
          days: t.days.map((d) => ({
            ...d,
            items: d.items.filter((i) => i.sourceId !== sourceId),
          })),
          basics: t.basics.filter((b) => b.sourceId !== sourceId),
          ...(wasFirst ? { coverUrl: null } : {}),
        }
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
    async (tripId: string, url: string): Promise<Source> => {
      setIsLoadingSource(true)
      try {
        const itinerary = await fetchItinerary(url)
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
      }
    },
    [applyCoverFromSource],
  )

  const refetchSource = useCallback(
    async (sourceId: string, url: string) => {
      setIsLoadingSource(true)
      try {
        const itinerary = await fetchItinerary(url)
        const rebuilt = buildSource(url, itinerary)
        const newSource: Source = { ...rebuilt, id: sourceId }
        // `rebuild` genera nuevos ids de ítems; solo conservamos entradas del viaje cuyo `sourceItemId` / `sourceBasicItemId` siga existiendo en la fuente refrescada.
        const newItemIds = new Set(newSource.items.map((i) => i.id))
        const newBasicIds = new Set(newSource.basics.map((b) => b.id))

        const isFirstOfSomeTrip = tripsRef.current.some(
          (t) => t.sourceIds[0] === sourceId,
        )

        setTrips((prev) =>
          prev.map((t) => ({
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
          })),
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
      }
    },
    [applyCoverFromSource],
  )

  const addDay = useCallback((tripId: string) => {
    setTrips((prev) =>
      prev.map((t) => {
        if (t.id !== tripId) return t
        const newDay: UserDay = { id: crypto.randomUUID(), label: "", items: [] }
        return { ...t, days: [...t.days, newDay] }
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

  const removeDay = useCallback((tripId: string, dayId: string) => {
    setTrips((prev) =>
      prev.map((t) =>
        t.id !== tripId ? t : { ...t, days: t.days.filter((d) => d.id !== dayId) },
      ),
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
        return { ...t, days }
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
      prev.map((t) =>
        t.id !== tripId
          ? t
          : {
              ...t,
              days: t.days.map((d) =>
                d.id === dayId ? { ...d, items: d.items.filter((i) => i.id !== itemId) } : d,
              ),
            },
      ),
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
      prev.map((t) =>
        t.id !== tripId ? t : { ...t, basics: t.basics.filter((b) => b.id !== basicId) },
      ),
    )
  }, [])

  const value = useMemo<TripContextValue>(
    () => ({
      trips,
      sources,
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
      addDay,
      updateDayLabel,
      removeDay,
      removeSelectedDays,
      addItemToDay,
      removeItemFromDay,
      moveItemBetweenDays,
      addBasicToTrip,
      removeBasicFromTrip,
    }),
    [trips, sources, createTrip, updateTrip, deleteTrip, archiveTrip, unarchiveTrip, getTrip, getTripSources, addSourceToTrip, refetchSource, removeSourceFromTrip, isLoadingSource, addDay, updateDayLabel, removeDay, removeSelectedDays, addItemToDay, removeItemFromDay, moveItemBetweenDays, addBasicToTrip, removeBasicFromTrip],
  )

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}

export function useTrips() {
  const ctx = useContext(TripContext)
  if (!ctx) throw new Error("useTrips must be used within TripProvider")
  return ctx
}
