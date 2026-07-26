"use client"

/**
 * Estado global de viajes y fuentes: en cliente se rehidrata y persiste en `localStorage`
 * (`lib/trip-persistence.ts`); el primer arranque o si no hay datos guardados usa mocks. Sin backend de persistencia.
 * Expone `TripProvider` / `useTrips()`. Al tocar `removeSourceFromTrip`, `refetchSource` o
 * añadir ítems, respeta la semántica de `sourceId` / `sourceItemId` / `sourceBasicItemId` en `types/itinerary`.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react"
import type { Trip, Source, UserDay, UserDayItem, UserBasicItem } from "@/types/itinerary"
import { MOCK_TRIPS, MOCK_SOURCES } from "@/lib/mock-data"
import { fetchItinerary } from "@/lib/api"
import { buildSource } from "@/lib/itinerary-utils"
import { getCountryByCode } from "@/lib/countries"
import { loadTripsState, saveTripsState } from "@/lib/trip-persistence"
import { fetchDestinationCover } from "@/lib/unsplash"

interface TripContextValue {
  trips: Trip[]
  sources: Source[]
  createTrip: (data: {
    name: string
    countries: string[]
    startDate: string | null
    endDate: string | null
    numDays: number | null
  }) => Trip
  deleteTrip: (tripId: string) => void

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

  const createTrip = useCallback(
    (data: {
      name: string
      countries: string[]
      startDate: string | null
      endDate: string | null
      numDays: number | null
    }): Trip => {
    const dayCount = data.numDays && data.numDays > 0 ? data.numDays : 1
    const days: UserDay[] = Array.from({ length: dayCount }, () => ({
      id: crypto.randomUUID(),
      label: "",
      items: [],
    }))

    const firstCode = data.countries[0]
    const coverQuery = firstCode
      ? (getCountryByCode(firstCode)?.name ?? firstCode)
      : data.name
    const trip: Trip = {
      id: crypto.randomUUID(),
      name: data.name,
      countries: data.countries,
      startDate: data.startDate,
      endDate: data.endDate,
      numDays: data.numDays,
      cover: "✈️",
      coverUrl: null,
      sourceIds: [],
      days,
      basics: [],
    }
    setTrips((prev) => [...prev, trip])

    // Fetch cover image in the background (non-blocking)
    fetchDestinationCover(coverQuery).then((url) => {
      if (url) {
        setTrips((prev) =>
          prev.map((t) => (t.id === trip.id ? { ...t, coverUrl: url } : t)),
        )
      }
    })

    return trip
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
  }, [])

  const getTrip = useCallback((tripId: string) => {
    return trips.find((t) => t.id === tripId)
  }, [trips])

  const getTripSources = useCallback((tripId: string) => {
    const trip = trips.find((t) => t.id === tripId)
    if (!trip) return []
    return sources.filter((s) => trip.sourceIds.includes(s.id))
  }, [trips, sources])

  const removeSourceFromTrip = useCallback((tripId: string, sourceId: string) => {
    let nextTrips: Trip[] | null = null
    setTrips((current) => {
      nextTrips = current.map((t) => {
        if (t.id !== tripId) return t
        return {
          ...t,
          sourceIds: t.sourceIds.filter((id) => id !== sourceId),
          days: t.days.map((d) => ({
            ...d,
            items: d.items.filter((i) => i.sourceId !== sourceId),
          })),
          basics: t.basics.filter((b) => b.sourceId !== sourceId),
        }
      })
      return nextTrips
    })
    if (nextTrips) {
      setSources((prev) => {
        // No guardar `Source` que ya ningún `Trip` referencia (evita fuentes huérfanas en el array global).
        const used = new Set(nextTrips!.flatMap((t) => t.sourceIds))
        return prev.filter((s) => used.has(s.id))
      })
    }
  }, [])

  const addSourceToTrip = useCallback(async (tripId: string, url: string): Promise<Source> => {
    setIsLoadingSource(true)
    try {
      const itinerary = await fetchItinerary(url)
      const source = buildSource(url, itinerary)

      setSources((prev) => [...prev, source])
      setTrips((prev) =>
        prev.map((t) =>
          t.id === tripId ? { ...t, sourceIds: [...t.sourceIds, source.id] } : t,
        ),
      )
      return source
    } finally {
      setIsLoadingSource(false)
    }
  }, [])

  const refetchSource = useCallback(async (sourceId: string, url: string) => {
    setIsLoadingSource(true)
    try {
      const itinerary = await fetchItinerary(url)
      const rebuilt = buildSource(url, itinerary)
      const newSource: Source = { ...rebuilt, id: sourceId }
      // `rebuild` genera nuevos ids de ítems; solo conservamos entradas del viaje cuyo `sourceItemId` / `sourceBasicItemId` siga existiendo en la fuente refrescada.
      const newItemIds = new Set(newSource.items.map((i) => i.id))
      const newBasicIds = new Set(newSource.basics.map((b) => b.id))

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
    } finally {
      setIsLoadingSource(false)
    }
  }, [])

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
      deleteTrip,
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
    [trips, sources, createTrip, deleteTrip, getTrip, getTripSources, addSourceToTrip, refetchSource, removeSourceFromTrip, isLoadingSource, addDay, updateDayLabel, removeDay, removeSelectedDays, addItemToDay, removeItemFromDay, moveItemBetweenDays, addBasicToTrip, removeBasicFromTrip],
  )

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}

export function useTrips() {
  const ctx = useContext(TripContext)
  if (!ctx) throw new Error("useTrips must be used within TripProvider")
  return ctx
}
