"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
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

mapboxgl.accessToken = MAPBOX_TOKEN

export type ItineraryMapPoint = {
  id: string
  name: string
  type: "stay" | "activity"
  dayNumber: number
  /**
   * Pista geográfica para desambiguar el geocoder (ciudad/provincia).
   * Si está vacía, se cae al `destination` global del viaje.
   */
  region?: string | null
  /** Coordenadas ya resueltas (ítems manuales); si existen, no se geocodifica. */
  coords?: { lng: number; lat: number } | null
}

const PIN: Record<ItineraryMapPoint["type"], { fill: string; border: string }> = {
  stay: { fill: "#f97316", border: "#c2410c" },
  activity: { fill: "#f59e0b", border: "#b45309" },
}

type ViewStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; resolved: { point: ItineraryMapPoint; coord: LngLat }[]; failed: { point: ItineraryMapPoint }[]; km: number | null; line: GeoJSON.LineString | null }
  | { status: "error"; message: string }

/**
 * Geocodifica y muestra ruta; orden = orden del itinerario (lista).
 */
export function ItineraryMapView({
  tripId: _tripId,
  points,
  destination,
  countryCodes = [],
}: {
  tripId: string
  points: ItineraryMapPoint[]
  /** Destino resumido (p. ej. nombres de países del viaje) para `proximity` y pistas. */
  destination: string
  /** ISO-3166 alpha-2 del viaje (p. filtro country en Mapbox, junto a lo que extraemos de `region`). */
  countryCodes?: string[]
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const [view, setView] = useState<ViewStatus>({ status: "idle" })
  const pointsKey = points.map((p) => p.id).join(",")
  const describeId = useId()
  const describeLabelId = `${describeId}-label`
  const runGeocodeAndRoute = useCallback(async (signal: AbortSignal) => {
    if (!MAPBOX_TOKEN?.trim()) {
      setView({
        status: "error",
        message:
          "Configura NEXT_PUBLIC_MAPBOX_TOKEN en frontend/.env.local (token público pk.…) y reinicia el servidor de desarrollo.",
      })
      return
    }
    if (points.length === 0) {
      setView({ status: "ready", resolved: [], failed: [], km: null, line: null })
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
          (await geocodeFreeText(dest, { countryCodes: unionForBias.length ? unionForBias : undefined })) ?? null
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
        // `region` por ítem (más concreto que el destino del viaje, e. g. "Soportújar, Granada");
        // si no la trae, se cae al `destination` global (`countries` del Trip).
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

    const coords: LngLat[] = resolved.map((r) => r.coord)
    let line: GeoJSON.LineString | null = null
    let km: number | null = null
    if (coords.length >= 2) {
      const dir = await getDirections(coords, { profile: "driving" })
      if (dir) {
        line = dir.geometry
        km = dir.distanceMeters / 1000
      }
    }

    if (signal.aborted) return
    setView({ status: "ready", resolved, failed, km, line })
  }, [countryCodes, destination, points, pointsKey])

  useEffect(() => {
    const ac = new AbortController()
    void runGeocodeAndRoute(ac.signal)
    return () => {
      ac.abort()
    }
  }, [runGeocodeAndRoute, points, pointsKey])

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

    const { resolved, line } = view
    if (resolved.length === 0) {
      mapCleanup(null)
      return
    }

    mapCleanup(null)

    const first = resolved[0]!
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [first.coord.lng, first.coord.lat],
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
      if (line && line.coordinates.length > 0) {
        if (!map.getSource("route")) {
          map.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: line,
            },
          })
        }
        if (!map.getLayer("route")) {
          map.addLayer({
            id: "route",
            type: "line",
            source: "route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#3b82f6", "line-width": 4, "line-opacity": 0.9 },
          })
        }
      }

      const bounds = new mapboxgl.LngLatBounds()
      for (const { point, coord } of resolved) {
        bounds.extend([coord.lng, coord.lat])
        const pin = document.createElement("div")
        pin.setAttribute("role", "listitem")
        const colors = PIN[point.type]
        pin.className = cn("flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold text-white shadow-md")
        pin.style.background = colors.fill
        pin.style.border = `2px solid ${colors.border}`
        const idx = points.findIndex((x) => x.id === point.id) + 1
        pin.textContent = String(idx)
        const marker = new mapboxgl.Marker({ element: pin })
          .setLngLat([coord.lng, coord.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 16 }).setHTML(
              `<div class="p-1 text-sm"><strong class="block">${escapeHtml(
                point.name,
              )}</strong><span class="text-muted-foreground">Día ${point.dayNumber}</span></div>`,
            ),
          )
          .addTo(map)
        markersRef.current.push(marker)
      }
      if (resolved.length > 0) {
        if (resolved.length > 1) {
          map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 })
        } else {
          map.flyTo({ center: [resolved[0]!.coord.lng, resolved[0]!.coord.lat], zoom: 12, duration: 0 })
        }
      }
    })

    return () => {
      mapCleanup(ro)
    }
  }, [points, pointsKey, view])

  if (!MAPBOX_TOKEN?.trim()) {
    return (
      <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
        <p>Configura <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">NEXT_PUBLIC_MAPBOX_TOKEN</code> en <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">frontend/.env.local</code> (token <code className="rounded bg-muted px-1.5">pk.…</code> desde Mapbox) y reinicia el servidor.</p>
      </div>
    )
  }

  if (points.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Añade actividades o alojamientos al itinerario para verlos en el mapa.
      </div>
    )
  }

  if (view.status === "loading" || view.status === "idle") {
    return (
      <div className="flex min-h-[280px] flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-hidden>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-card px-2.5 py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando mapa y geolocalizando paradas…
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

  const { resolved, failed, km } = view
  const kmLabel =
    km != null
      ? `${(Math.round(km * 10) / 10).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} km`
      : null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" role="region" aria-label="Itinerario en el mapa">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        {resolved.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-card px-2.5 py-1 font-medium text-foreground">
            <span aria-hidden>🚗</span>
            {kmLabel != null && (
              <span>
                Ruta aprox. <strong className="tabular-nums text-foreground">{kmLabel}</strong> por carretera
              </span>
            )}
            {kmLabel == null && resolved.length >= 2 && (
              <span>No se pudo calcular la ruta; revisa paradas poco accesibles por carretera.</span>
            )}
            {kmLabel == null && resolved.length < 2 && <span>Una sola parada geolocalizada.</span>}
            <span className="text-muted-foreground">·</span>
            <span>{resolved.length} parada{resolved.length === 1 ? "" : "s"}</span>
          </span>
        )}
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
            <ul className="mt-1 list-inside list-disc pl-0.5 text-[11px] leading-relaxed" aria-describedby={describeLabelId}>
              {failed.map((f) => (
                <li key={f.point.id}>{f.point.name}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {resolved.length > 0 ? (
        <div
          ref={mapContainerRef}
          className="min-h-0 w-full min-h-[280px] flex-1 overflow-hidden rounded-lg border border-border/80 shadow-sm"
        />
      ) : (
        <p className="text-center text-sm text-muted-foreground">No se pudo situar ningún punto. Revisa los nombres o el destino del viaje.</p>
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
