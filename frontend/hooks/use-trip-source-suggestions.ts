"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { isSourceSuggestEnabled, type SourceSuggestHit } from "@/lib/source-suggest"
import {
  fetchTripSourceSuggestions,
  filterUnusedHits,
  tripSuggestQuery,
  tripSuggestSignature,
} from "@/lib/trip-source-suggestions"
import type { Source, Trip } from "@/types/itinerary"

export function useTripSourceSuggestions({
  trip,
  sources,
  pendingUrls,
  enabled,
}: {
  trip: Trip | null | undefined
  sources: Pick<Source, "area" | "items" | "url">[]
  pendingUrls: string[]
  enabled: boolean
}): {
  query: string | null
  hits: SourceSuggestHit[]
  fetched: boolean
  loading: boolean
  refresh: () => void
} {
  const signature = trip ? tripSuggestSignature(trip, sources) : ""
  const dest = useMemo(() => {
    if (!trip) return null
    return tripSuggestQuery(trip, sources)
    // Firma primitiva: no recalcular resolveTripCountryCodes en cada mutación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const usedUrls = useMemo(
    () => [...sources.map((s) => s.url), ...pendingUrls],
    [sources, pendingUrls],
  )

  const [rawHits, setRawHits] = useState<SourceSuggestHit[] | null>(null)
  const [loading, setLoading] = useState(() => Boolean(enabled && dest))

  useEffect(() => {
    if (!enabled || !dest || !isSourceSuggestEnabled()) {
      return
    }
    const { query, fingerprint } = dest
    const ac = new AbortController()
    let cancelled = false
    setLoading(true)
    void fetchTripSourceSuggestions(query, fingerprint, { signal: ac.signal })
      .then((results) => {
        if (cancelled || ac.signal.aborted) return
        if (results) setRawHits(results)
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return
      })
      .finally(() => {
        if (!cancelled && !ac.signal.aborted) setLoading(false)
      })
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [enabled, dest])

  const refresh = useCallback(() => {
    if (!dest || !isSourceSuggestEnabled()) return
    const { query, fingerprint } = dest
    const ac = new AbortController()
    setLoading(true)
    void fetchTripSourceSuggestions(query, fingerprint, { bypassCache: true, signal: ac.signal })
      .then((results) => {
        if (ac.signal.aborted) return
        if (results) setRawHits(results)
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })
  }, [dest])

  const hits = useMemo(
    () => filterUnusedHits(rawHits ?? [], usedUrls),
    [rawHits, usedUrls],
  )

  return {
    query: dest?.query ?? null,
    hits,
    fetched: rawHits != null,
    loading,
    refresh,
  }
}
