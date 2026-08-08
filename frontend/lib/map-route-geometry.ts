/**
 * Geometría local de tramos para el mapa (T4B.3 §9.12).
 * 0 llamadas a Directions por defecto; arco geodésico / línea.
 */
import type { RouteLeg, RouteMode, UserDay, UserDayItem } from "@/types/itinerary"

export type ItineraryMapSegment = {
  itemId: string
  dayNumber: number
  title: string
  from: { label: string; lng: number; lat: number }
  to: { label: string; lng: number; lat: number }
  mode: RouteMode | null
  leg?: RouteLeg
  vendor?: string | null
}

const EARTH_RADIUS_M = 6_371_000

function toRad(d: number): number {
  return (d * Math.PI) / 180
}

function toDeg(r: number): number {
  return (r * 180) / Math.PI
}

/** Interpolación geodésica (gran círculo), con n pasos. Maneja antimeridiano vía lon unwrap. */
export function geodesicLine(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
  steps = 64,
): [number, number][] {
  const lat1 = toRad(from.lat)
  const lon1 = toRad(from.lng)
  const lat2 = toRad(to.lat)
  const lon2 = toRad(to.lng)

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    )
  if (!Number.isFinite(d) || d < 1e-9) {
    return [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ]
  }

  const coords: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2)
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y))
    let lon = Math.atan2(y, x)
    coords.push([toDeg(lon), toDeg(lat)])
  }

  // Unwrap longitudes para no cruzar el mapa por el lado largo.
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1]![0]
    let cur = coords[i]![0]
    while (cur - prev > 180) cur -= 360
    while (cur - prev < -180) cur += 360
    coords[i]![0] = cur
  }
  return coords
}

export function haversineMeters(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

function haversineKm(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  return haversineMeters(a, b) / 1000
}

export type SegmentLineStyle = {
  color: string
  dashArray: number[] | null
  width: number
}

export function segmentStyleForMode(mode: RouteMode | null | undefined): SegmentLineStyle {
  switch (mode) {
    case "flight":
      return { color: "#0ea5e9", dashArray: [2, 2], width: 2.5 }
    case "train":
      return { color: "#7c3aed", dashArray: [4, 2], width: 2.5 }
    case "bus":
      return { color: "#ea580c", dashArray: [1.5, 1.5], width: 2 }
    case "ferry":
      return { color: "#2563eb", dashArray: [3, 2], width: 2.5 }
    case "car":
      return { color: "#475569", dashArray: null, width: 2.5 }
    case "other":
      return { color: "#a16207", dashArray: [2, 3], width: 2 }
    default:
      return { color: "#94a3b8", dashArray: [1, 2], width: 2 }
  }
}

/** ¿Directions por carretera tiene sentido? Solo coche (bus opcional lazy). */
export function modeAllowsRoadDirections(mode: RouteMode | null | undefined): boolean {
  return mode === "car" || mode === "bus"
}

/**
 * Ida/vuelta en avión/tren/ferry (u otro / sin decidir) no se trazan.
 * Coche/autobús sí, pero solo si el trayecto es «local» (no intercontinental).
 */
export function legIncludedInMapItinerary(mode: RouteMode | null | undefined): boolean {
  return modeAllowsRoadDirections(mode)
}

/**
 * Por encima de esto un segmento no forma parte del itinerario local del mapa
 * (p. ej. España→Japón). Domésticos tipo Tokio→Sapporo siguen entrando.
 */
export const MAP_LOCAL_SEGMENT_MAX_KM = 3000

export function segmentDistanceKm(seg: {
  from: { lng: number; lat: number }
  to: { lng: number; lat: number }
}): number {
  return haversineKm(
    { lng: seg.from.lng, lat: seg.from.lat },
    { lng: seg.to.lng, lat: seg.to.lat },
  )
}

export function isLocalMapSegment(seg: {
  from: { lng: number; lat: number }
  to: { lng: number; lat: number }
}): boolean {
  return segmentDistanceKm(seg) <= MAP_LOCAL_SEGMENT_MAX_KM
}

/**
 * ¿Dibujar este transporte en el mapa?
 * - Ida/vuelta no-carretera: nunca.
 * - Ida/vuelta coche/bus intercontinental: nunca (anclas en hubs).
 * - Cualquier tramo > MAP_LOCAL_SEGMENT_MAX_KM: nunca.
 */
export function shouldDrawTransportOnMap(
  item: Pick<UserDayItem, "type" | "route">,
): boolean {
  if (item.type !== "transport") return false
  const route = item.route
  if (!route?.from?.coords || !route.to?.coords) return false
  const endpoints = {
    from: route.from.coords,
    to: route.to.coords,
  }
  if (!isLocalMapSegment(endpoints)) return false
  const leg = route.leg
  if (leg === "outbound" || leg === "return") {
    return legIncludedInMapItinerary(route.mode)
  }
  return true
}

export type MapGatewayAnchor = {
  itemId: string
  role: "arrival" | "departure"
  label: string
  lng: number
  lat: number
  dayNumber: number
  mode: RouteMode | null
}

/**
 * Anclas del itinerario local cuando la ida/vuelta no se dibuja:
 * - llegada = `outbound.to`
 * - salida = `return.from`
 */
export function collectMapGatewayAnchors(days: UserDay[]): MapGatewayAnchor[] {
  const out: MapGatewayAnchor[] = []
  days.forEach((day, dayIndex) => {
    for (const item of day.items) {
      if (item.type !== "transport") continue
      const route = item.route
      const leg = route?.leg
      if (leg !== "outbound" && leg !== "return") continue
      if (!route?.from?.coords || !route.to?.coords) continue
      // Si el leg sí se dibuja (coche/bus local), no hace falta ancla suelta.
      if (shouldDrawTransportOnMap(item)) continue

      if (leg === "outbound") {
        const p = route.to
        if (!Number.isFinite(p.coords.lng) || !Number.isFinite(p.coords.lat)) continue
        out.push({
          itemId: item.id,
          role: "arrival",
          label: p.label,
          lng: p.coords.lng,
          lat: p.coords.lat,
          dayNumber: dayIndex + 1,
          mode: route.mode ?? null,
        })
      } else {
        const p = route.from
        if (!Number.isFinite(p.coords.lng) || !Number.isFinite(p.coords.lat)) continue
        out.push({
          itemId: item.id,
          role: "departure",
          label: p.label,
          lng: p.coords.lng,
          lat: p.coords.lat,
          dayNumber: dayIndex + 1,
          mode: route.mode ?? null,
        })
      }
    }
  })
  return out
}

export function collectMapSegments(days: UserDay[]): ItineraryMapSegment[] {
  const out: ItineraryMapSegment[] = []
  days.forEach((day, dayIndex) => {
    for (const item of day.items) {
      const seg = segmentFromItem(item, dayIndex + 1)
      if (seg) out.push(seg)
    }
  })
  return out
}

export function segmentFromItem(
  item: Pick<UserDayItem, "id" | "type" | "name" | "route" | "vendor">,
  dayNumber: number,
): ItineraryMapSegment | null {
  if (item.type !== "transport") return null
  const route = item.route
  if (!route?.from?.coords || !route.to?.coords) return null
  if (!shouldDrawTransportOnMap(item)) return null
  const { from, to } = route
  if (
    !Number.isFinite(from.coords.lng) ||
    !Number.isFinite(from.coords.lat) ||
    !Number.isFinite(to.coords.lng) ||
    !Number.isFinite(to.coords.lat)
  ) {
    return null
  }
  return {
    itemId: item.id,
    dayNumber,
    title: item.name,
    from: { label: from.label, lng: from.coords.lng, lat: from.coords.lat },
    to: { label: to.label, lng: to.coords.lng, lat: to.coords.lat },
    mode: route.mode ?? null,
    leg: route.leg,
    vendor: item.vendor ?? null,
  }
}

export function segmentToGeoJsonFeature(
  segment: ItineraryMapSegment,
): GeoJSON.Feature<GeoJSON.LineString> {
  const coords = geodesicLine(
    { lng: segment.from.lng, lat: segment.from.lat },
    { lng: segment.to.lng, lat: segment.to.lat },
    segment.mode === "flight" ? 80 : 32,
  )
  const style = segmentStyleForMode(segment.mode)
  return {
    type: "Feature",
    properties: {
      itemId: segment.itemId,
      dayNumber: segment.dayNumber,
      title: segment.title,
      mode: segment.mode ?? "undecided",
      leg: segment.leg ?? null,
      vendor: segment.vendor ?? null,
      fromLabel: segment.from.label,
      toLabel: segment.to.label,
      color: style.color,
      dash: style.dashArray ? style.dashArray.join(",") : "",
      width: style.width,
    },
    geometry: { type: "LineString", coordinates: coords },
  }
}

export function segmentsToFeatureCollection(
  segments: ItineraryMapSegment[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: "FeatureCollection",
    features: segments.map(segmentToGeoJsonFeature),
  }
}

export function summarizeSegmentModes(segments: ItineraryMapSegment[]): string {
  const counts: Record<string, number> = {}
  for (const s of segments) {
    const key = s.mode ?? "undecided"
    counts[key] = (counts[key] ?? 0) + 1
  }
  const labels: Record<string, [string, string]> = {
    flight: ["vuelo", "vuelos"],
    train: ["tren", "trenes"],
    bus: ["bus", "buses"],
    ferry: ["ferry", "ferrys"],
    car: ["trayecto en coche", "trayectos en coche"],
    other: ["otro", "otros"],
    undecided: ["sin medio", "sin medio"],
  }
  const parts: string[] = []
  for (const [key, n] of Object.entries(counts)) {
    const [one, many] = labels[key] ?? ["tramo", "tramos"]
    parts.push(`${n} ${n === 1 ? one : many}`)
  }
  return parts.join(" · ")
}
