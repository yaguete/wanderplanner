"use client"

/**
 * Mapa del itinerario: puntos stay/activity/hubs + segmentos locales (T4B.3 §9.12).
 * Ida/vuelta en avión/tren/ferry no se trazan: anclan llegada/salida.
 * Geometría local por defecto — 0 Directions salvo coche/bus lazy.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { collectCountryCodesFromHint } from "@/lib/countries"
import {
  geocodeName,
  geocodeFreeText,
  getDirections,
  MAPBOX_TOKEN,
  type LngLat,
} from "@/lib/mapbox"
import {
  modeAllowsRoadDirections,
  segmentsToFeatureCollection,
  summarizeSegmentModes,
  type ItineraryMapSegment,
} from "@/lib/map-route-geometry"
import { routeModeLabel } from "@/lib/route-legs"

mapboxgl.accessToken = MAPBOX_TOKEN

export type ItineraryMapPoint = {
  id: string
  name: string
  type: "stay" | "activity" | "hub"
  dayNumber: number
  region?: string | null
  coords?: { lng: number; lat: number } | null
  /** Solo hubs: llegada (fin de ida) o salida (inicio de vuelta). */
  hubRole?: "arrival" | "departure"
}

export type { ItineraryMapSegment }

const PIN: Record<ItineraryMapPoint["type"], { fill: string; border: string }> = {
  stay: { fill: "#f97316", border: "#c2410c" },
  activity: { fill: "#f59e0b", border: "#b45309" },
  hub: { fill: "#0ea5e9", border: "#0369a1" },
}

type ViewStatus =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready"
      resolved: { point: ItineraryMapPoint; coord: LngLat }[]
      failed: { point: ItineraryMapPoint }[]
    }
  | { status: "error"; message: string }

export function ItineraryMapView({
  tripId: _tripId,
  points,
  segments = [],
  destination,
  countryCodes = [],
}: {
  tripId: string
  points: ItineraryMapPoint[]
  segments?: ItineraryMapSegment[]
  destination: string
  countryCodes?: string[]
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const [view, setView] = useState<ViewStatus>({ status: "idle" })
  const [roadOverride, setRoadOverride] = useState<Record<string, GeoJSON.LineString>>({})
  const [roadLoadingId, setRoadLoadingId] = useState<string | null>(null)
  const pointsKey = points.map((p) => p.id).join(",")
  const segmentsKey = segments
    .map((s) => `${s.itemId}:${s.mode}:${s.from.lng},${s.from.lat}:${s.to.lng},${s.to.lat}`)
    .join("|")
  const describeId = useId()
  const describeLabelId = `${describeId}-label`

  const modeSummary = useMemo(() => summarizeSegmentModes(segments), [segments, segmentsKey])

  const runGeocode = useCallback(
    async (signal: AbortSignal) => {
      if (!MAPBOX_TOKEN?.trim()) {
        setView({
          status: "error",
          message:
            "Configura NEXT_PUBLIC_MAPBOX_TOKEN en frontend/.env.local (token público pk.…) y reinicia el servidor de desarrollo.",
        })
        return
      }
      if (points.length === 0 && segments.length === 0) {
        setView({ status: "ready", resolved: [], failed: [] })
        return
      }

      setView({ status: "loading" })

      const fromTrip = new Set<string>(
        (countryCodes ?? [])
          .map((c) => c.trim().toLowerCase())
          .filter((c) => c.length === 2),
      )
      const dest = destination?.trim()
      if (dest) {
        for (const c of collectCountryCodesFromHint(dest)) fromTrip.add(c)
      }
      for (const p of points) {
        for (const c of collectCountryCodesFromHint(p.region)) fromTrip.add(c)
      }
      const unionForBias = Array.from(fromTrip)

      let proximity: [number, number] | null = null
      if (dest) {
        try {
          proximity =
            (await geocodeFreeText(dest, {
              countryCodes: unionForBias.length ? unionForBias : undefined,
            })) ?? null
        } catch {
          proximity = null
        }
      }
      if (signal.aborted) return

      const resolved: { point: ItineraryMapPoint; coord: LngLat }[] = []
      const failed: { point: ItineraryMapPoint }[] = []

      const results = await Promise.allSettled(
        points.map(async (p): Promise<LngLat | null> => {
          const saved = p.coords
          if (
            saved &&
            typeof saved.lng === "number" &&
            typeof saved.lat === "number" &&
            Number.isFinite(saved.lng) &&
            Number.isFinite(saved.lat)
          ) {
            return { lng: saved.lng, lat: saved.lat }
          }
          const tripDestination = p.region?.trim() ? p.region.trim() : dest || null
          const forPoint = new Set<string>([
            ...countryCodes.map((c) => c.trim().toLowerCase()).filter((c) => c.length === 2),
          ])
          for (const c of collectCountryCodesFromHint(tripDestination)) forPoint.add(c)
          for (const c of collectCountryCodesFromHint(p.region)) forPoint.add(c)
          const codes = forPoint.size > 0 ? Array.from(forPoint) : unionForBias
          return geocodeName(p.name, {
            proximity,
            tripDestination,
            countryCodes: codes.length > 0 ? codes : undefined,
          })
        }),
      )

      for (let i = 0; i < points.length; i++) {
        if (signal.aborted) return
        const p = points[i]!
        const r = results[i]!
        if (r.status === "fulfilled" && r.value) {
          resolved.push({ point: p, coord: r.value })
        } else {
          failed.push({ point: p })
        }
      }

      if (signal.aborted) return
      setView({ status: "ready", resolved, failed })
    },
    [countryCodes, destination, points, pointsKey, segments.length],
  )

  useEffect(() => {
    const ac = new AbortController()
    void runGeocode(ac.signal)
    return () => {
      ac.abort()
    }
  }, [runGeocode])

  const followRoad = useCallback(async (segment: ItineraryMapSegment) => {
    if (!modeAllowsRoadDirections(segment.mode)) return
    if (roadOverride[segment.itemId]) return
    setRoadLoadingId(segment.itemId)
    try {
      const dir = await getDirections(
        [
          { lng: segment.from.lng, lat: segment.from.lat },
          { lng: segment.to.lng, lat: segment.to.lat },
        ],
        { profile: "driving" },
      )
      if (dir?.geometry) {
        setRoadOverride((prev) => ({ ...prev, [segment.itemId]: dir.geometry }))
      }
    } finally {
      setRoadLoadingId(null)
    }
  }, [roadOverride])

  useLayoutEffect(() => {
    const mapCleanup = (ro: ResizeObserver | null) => {
      if (ro && mapContainerRef.current) {
        ro.unobserve(mapContainerRef.current)
      }
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }

    if (view.status !== "ready" || !MAPBOX_TOKEN?.trim()) {
      mapCleanup(null)
      return
    }
    if (!mapContainerRef.current) {
      mapCleanup(null)
      return
    }

    const { resolved } = view
    const hasAnything = resolved.length > 0 || segments.length > 0
    if (!hasAnything) {
      mapCleanup(null)
      return
    }

    mapCleanup(null)

    const start =
      resolved[0]?.coord ??
      (segments[0]
        ? { lng: segments[0].from.lng, lat: segments[0].from.lat }
        : { lng: 0, lat: 0 })

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [start.lng, start.lat],
      zoom: 10,
    })
    mapInstanceRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right")

    const onResize = () => {
      try {
        map.resize()
      } catch {
        // ignore
      }
    }
    const ro: ResizeObserver | null =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null
    if (ro && mapContainerRef.current) ro.observe(mapContainerRef.current)

    map.on("load", () => {
      onResize()

      const collection = segmentsToFeatureCollection(segments)
      // Sustituir geometría local por Directions lazy cuando exista override.
      for (const f of collection.features) {
        const id = String(f.properties?.itemId ?? "")
        const override = roadOverride[id]
        if (override) f.geometry = override
      }

      if (collection.features.length > 0) {
        map.addSource("transport-segments", { type: "geojson", data: collection })
        map.addLayer({
          id: "transport-segments-line",
          type: "line",
          source: "transport-segments",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["get", "width"],
            "line-opacity": 0.9,
            "line-dasharray": [
              "case",
              ["==", ["get", "dash"], ""],
              ["literal", [1, 0]],
              [
                "case",
                ["==", ["get", "mode"], "flight"],
                ["literal", [2, 2]],
                ["==", ["get", "mode"], "train"],
                ["literal", [4, 2]],
                ["==", ["get", "mode"], "bus"],
                ["literal", [1.5, 1.5]],
                ["==", ["get", "mode"], "ferry"],
                ["literal", [3, 2]],
                ["literal", [1, 2]],
              ],
            ],
          },
        })

        map.on("click", "transport-segments-line", (e) => {
          const f = e.features?.[0]
          if (!f?.properties) return
          const p = f.properties
          const title = escapeHtml(String(p.title ?? ""))
          const mode = routeModeLabel(
            p.mode === "undecided" ? null : (p.mode as import("@/types/itinerary").RouteMode),
          )
          const leg =
            p.leg === "outbound" ? "Ida" : p.leg === "return" ? "Vuelta" : null
          const vendor = p.vendor ? escapeHtml(String(p.vendor)) : null
          const meta = [mode, leg, vendor].filter(Boolean).join(" · ")
          new mapboxgl.Popup({ offset: 8 })
            .setLngLat(e.lngLat)
            .setHTML(
              `<div class="p-1 text-sm"><strong class="block">${title}</strong><span class="text-muted-foreground">Día ${p.dayNumber} · ${escapeHtml(meta)}</span></div>`,
            )
            .addTo(map)
        })
        map.on("mouseenter", "transport-segments-line", () => {
          map.getCanvas().style.cursor = "pointer"
        })
        map.on("mouseleave", "transport-segments-line", () => {
          map.getCanvas().style.cursor = ""
        })
      }

      const bounds = new mapboxgl.LngLatBounds()
      let hasBounds = false

      for (const { point, coord } of resolved) {
        bounds.extend([coord.lng, coord.lat])
        hasBounds = true
        const pin = document.createElement("div")
        pin.setAttribute("role", "listitem")
        const colors = PIN[point.type]
        pin.className = cn(
          "flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold text-white shadow-md",
        )
        pin.style.background = colors.fill
        pin.style.border = `2px solid ${colors.border}`
        const stopNumber =
          point.type === "hub"
            ? null
            : points.filter((p) => p.type !== "hub").findIndex((x) => x.id === point.id) + 1
        pin.textContent =
          point.type === "hub"
            ? point.hubRole === "arrival"
              ? "↓"
              : "↑"
            : String(stopNumber)
        const hubMeta =
          point.type === "hub"
            ? point.hubRole === "arrival"
              ? "Llegada · inicio del itinerario"
              : "Salida · fin del itinerario"
            : `Día ${point.dayNumber}`
        const marker = new mapboxgl.Marker({ element: pin })
          .setLngLat([coord.lng, coord.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 16 }).setHTML(
              `<div class="p-1 text-sm"><strong class="block">${escapeHtml(
                point.name,
              )}</strong><span class="text-muted-foreground">${escapeHtml(hubMeta)}</span></div>`,
            ),
          )
          .addTo(map)
        markersRef.current.push(marker)
      }

      for (const s of segments) {
        bounds.extend([s.from.lng, s.from.lat])
        bounds.extend([s.to.lng, s.to.lat])
        hasBounds = true
      }

      if (hasBounds) {
        map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 })
      }
    })

    return () => {
      mapCleanup(ro)
    }
  }, [points, pointsKey, segments, segmentsKey, view, roadOverride])

  if (!MAPBOX_TOKEN?.trim()) {
    return (
      <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
        <p>
          Configura{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
          en{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">frontend/.env.local</code>{" "}
          (token <code className="rounded bg-muted px-1.5">pk.…</code> desde Mapbox) y reinicia el
          servidor.
        </p>
      </div>
    )
  }

  if (points.length === 0 && segments.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Añade actividades, alojamientos o traslados al itinerario para verlos en el mapa.
      </div>
    )
  }

  if (view.status === "loading" || view.status === "idle") {
    return (
      <div className="flex min-h-[280px] flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-hidden>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-card px-2.5 py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando mapa…
          </span>
        </div>
        <div className="min-h-0 flex-1 rounded-lg border border-border/80 bg-muted/20" style={{ minHeight: 240 }} />
      </div>
    )
  }

  if (view.status === "error") {
    return (
      <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
        {view.message}
      </div>
    )
  }

  const { resolved, failed } = view
  const roadable = segments.filter((s) => modeAllowsRoadDirections(s.mode))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" role="region" aria-label="Itinerario en el mapa">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        {segments.length > 0 && modeSummary ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-card px-2.5 py-1 font-medium text-foreground">
            {modeSummary}
          </span>
        ) : null}
        {resolved.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-card px-2.5 py-1">
            {resolved.length} parada{resolved.length === 1 ? "" : "s"}
          </span>
        ) : null}
        {roadable.map((s) => (
          <button
            key={s.itemId}
            type="button"
            className="rounded-md border border-border/80 bg-card px-2.5 py-1 font-medium text-foreground hover:bg-muted"
            disabled={roadLoadingId === s.itemId || Boolean(roadOverride[s.itemId])}
            onClick={() => void followRoad(s)}
          >
            {roadOverride[s.itemId]
              ? `Carretera · ${s.from.label.split(",")[0]}`
              : roadLoadingId === s.itemId
                ? "Calculando…"
                : `Seguir carretera · ${routeModeLabel(s.mode)}`}
          </button>
        ))}
        {failed.length > 0 && (
          <details
            className="rounded-md border border-amber-200/80 bg-amber-50/90 px-2.5 py-1.5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100/90"
            id={describeId}
          >
            <summary
              className="cursor-pointer list-inside text-left font-medium outline-none"
              id={describeLabelId}
            >
              No se pudo localizar {failed.length} {failed.length === 1 ? "lugar" : "lugares"}
            </summary>
            <ul
              className="mt-1 list-inside list-disc pl-0.5 text-[11px] leading-relaxed"
              aria-describedby={describeLabelId}
            >
              {failed.map((f) => (
                <li key={f.point.id}>{f.point.name}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {resolved.length > 0 || segments.length > 0 ? (
        <div
          ref={mapContainerRef}
          className="min-h-0 w-full min-h-[280px] flex-1 overflow-hidden rounded-lg border border-border/80 shadow-sm"
        />
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          No se pudo situar ningún punto. Revisa los nombres o el destino del viaje.
        </p>
      )}
    </div>
  )
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}