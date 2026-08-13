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
    const lon = Math.atan2(y, x)
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

const MODE_COUNT_LABELS: Record<string, [string, string]> = {
  flight: ["vuelo", "vuelos"],
  train: ["tren", "trenes"],
  bus: ["bus", "buses"],
  ferry: ["ferry", "ferrys"],
  car: ["trayecto en coche", "trayectos en coche"],
  other: ["otro", "otros"],
  undecided: ["sin medio", "sin medio"],
}

const MODE_KM_LABELS: Record<string, string> = {
  flight: "en avión",
  train: "en tren",
  bus: "en bus",
  ferry: "en ferry",
  car: "en coche",
  other: "en otros",
  undecided: "sin medio",
}

export function summarizeSegmentModes(segments: ItineraryMapSegment[]): string {
  const counts: Record<string, number> = {}
  for (const s of segments) {
    const key = s.mode ?? "undecided"
    counts[key] = (counts[key] ?? 0) + 1
  }
  const parts: string[] = []
  for (const [key, n] of Object.entries(counts)) {
    const [one, many] = MODE_COUNT_LABELS[key] ?? ["tramo", "tramos"]
    parts.push(`${n} ${n === 1 ? one : many}`)
  }
  return parts.join(" · ")
}

/** Umbral de salto largo en el modo Recorrido (lugares). Distinto de MAP_LOCAL_SEGMENT_MAX_KM. */
export const PLACES_ROAD_MAX_KM = 300

/** Pares con distancia por debajo se colapsan (mismo alojamiento días seguidos). */
export const PLACES_ZERO_KM_EPSILON = 0.05

/**
 * Color de la línea del recorrido. Negro a propósito: no puede coincidir con ningún
 * color de `PIN` (el violeta anterior era el mismo `#7c3aed` de las actividades y los
 * pines se camuflaban sobre su propia línea). El estilo del mapa es siempre claro
 * (`streets-v12`), así que no depende del tema de la app.
 */
export const PLACES_ROUTE_COLOR = "#171717"

/** Saltos largos: gris, secundarios respecto a la línea del recorrido. */
export const PLACES_LONG_HOP_COLOR = "#94a3b8"

export type ItineraryPlace = {
  id: string
  name: string
  type: "stay" | "food" | "activity"
  dayNumber: number
  region?: string | null
  coords?: { lng: number; lat: number } | null
}

export type PlacesRouteLegKind = "road-candidate" | "long-hop" | "zero"

export type PlacesRouteLeg = {
  fromId: string
  toId: string
  from: { lng: number; lat: number }
  to: { lng: number; lat: number }
  km: number
  kind: PlacesRouteLegKind
}

export type PlacesRoute = {
  legs: PlacesRouteLeg[]
  skipped: ItineraryPlace[]
  routeKm: number
  longHopKm: number
}

/** Lugares del itinerario en orden de introducción (excluye transportes). */
export function collectItineraryPlaces(days: UserDay[]): ItineraryPlace[] {
  const out: ItineraryPlace[] = []
  days.forEach((day, dayIndex) => {
    for (const item of day.items) {
      if (item.type !== "stay" && item.type !== "food" && item.type !== "activity") continue
      out.push({
        id: item.id,
        name: item.name,
        type: item.type,
        dayNumber: dayIndex + 1,
        region: item.region ?? null,
        coords: item.coords ?? null,
      })
    }
  })
  return out
}

function hasFiniteCoords(
  c: { lng: number; lat: number } | null | undefined,
): c is { lng: number; lat: number } {
  return (
    !!c &&
    typeof c.lng === "number" &&
    typeof c.lat === "number" &&
    Number.isFinite(c.lng) &&
    Number.isFinite(c.lat)
  )
}

/**
 * Construye la ruta de lugares consecutivos.
 * Puntos sin coords se saltan (aparecen en `skipped`) y se unen los vecinos.
 */
export function buildPlacesRoute(
  places: ItineraryPlace[],
  options?: { maxRoadKm?: number },
): PlacesRoute {
  const maxRoadKm = options?.maxRoadKm ?? PLACES_ROAD_MAX_KM
  const skipped: ItineraryPlace[] = []
  const resolved: { place: ItineraryPlace; coord: { lng: number; lat: number } }[] = []

  for (const p of places) {
    if (hasFiniteCoords(p.coords)) {
      resolved.push({ place: p, coord: { lng: p.coords.lng, lat: p.coords.lat } })
    } else {
      skipped.push(p)
    }
  }

  const legs: PlacesRouteLeg[] = []
  let routeKm = 0
  let longHopKm = 0

  for (let i = 0; i < resolved.length - 1; i++) {
    const a = resolved[i]!
    const b = resolved[i + 1]!
    const km = haversineKm(a.coord, b.coord)
    let kind: PlacesRouteLegKind
    if (km <= PLACES_ZERO_KM_EPSILON) {
      kind = "zero"
    } else if (km > maxRoadKm) {
      kind = "long-hop"
      longHopKm += km
    } else {
      kind = "road-candidate"
      routeKm += km
    }
    legs.push({
      fromId: a.place.id,
      toId: b.place.id,
      from: a.coord,
      to: b.coord,
      km,
      kind,
    })
  }

  return { legs, skipped, routeKm, longHopKm }
}

/** Agrupa tramos `road-candidate` contiguos en subsecuencias de coordenadas para Directions. */
export function groupRoadCandidateSubsequences(
  legs: PlacesRouteLeg[],
): { coords: { lng: number; lat: number }[]; legIndices: number[] }[] {
  const out: { coords: { lng: number; lat: number }[]; legIndices: number[] }[] = []
  let current: { coords: { lng: number; lat: number }[]; legIndices: number[] } | null = null

  legs.forEach((leg, index) => {
    if (leg.kind !== "road-candidate") {
      current = null
      return
    }
    if (!current) {
      current = {
        coords: [
          { lng: leg.from.lng, lat: leg.from.lat },
          { lng: leg.to.lng, lat: leg.to.lat },
        ],
        legIndices: [index],
      }
      out.push(current)
      return
    }
    current.coords.push({ lng: leg.to.lng, lat: leg.to.lat })
    current.legIndices.push(index)
  })

  return out
}

export function placesRouteToFeatureCollections(
  legs: PlacesRouteLeg[],
): {
  road: GeoJSON.FeatureCollection<GeoJSON.LineString>
  longHop: GeoJSON.FeatureCollection<GeoJSON.LineString>
} {
  const roadFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = []
  const longFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = []

  for (const leg of legs) {
    if (leg.kind === "zero") continue
    const coords = geodesicLine(leg.from, leg.to, leg.kind === "long-hop" ? 48 : 24)
    const feature: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {
        fromId: leg.fromId,
        toId: leg.toId,
        kind: leg.kind,
        km: leg.km,
        color: leg.kind === "long-hop" ? PLACES_LONG_HOP_COLOR : PLACES_ROUTE_COLOR,
        width: leg.kind === "long-hop" ? 2 : 2.5,
      },
      geometry: { type: "LineString", coordinates: coords },
    }
    if (leg.kind === "long-hop") longFeatures.push(feature)
    else roadFeatures.push(feature)
  }

  return {
    road: { type: "FeatureCollection", features: roadFeatures },
    longHop: { type: "FeatureCollection", features: longFeatures },
  }
}

export type TransportDistanceBucket = {
  km: number
  count: number
}

export type UndrawnTransport = {
  itemId: string
  title: string
  mode: RouteMode | null
  leg?: RouteLeg
  km: number
  reason: "gateway-leg" | "too-long"
}

export type TransportDistances = {
  byMode: Partial<Record<RouteMode | "undecided", TransportDistanceBucket>>
  drawnKm: number
  undrawn: UndrawnTransport[]
  undrawnKm: number
  totalKm: number
}

/**
 * Distancias de *todos* los transportes con coordenadas (dibujar ≠ contar).
 * Incluye ida/vuelta y tramos > MAP_LOCAL_SEGMENT_MAX_KM.
 */
export function collectTransportDistances(days: UserDay[]): TransportDistances {
  const byMode: TransportDistances["byMode"] = {}
  const undrawn: UndrawnTransport[] = []
  let drawnKm = 0
  let undrawnKm = 0
  let totalKm = 0

  for (const day of days) {
    for (const item of day.items) {
      if (item.type !== "transport") continue
      const route = item.route
      if (!route?.from?.coords || !route.to?.coords) continue
      if (
        !Number.isFinite(route.from.coords.lng) ||
        !Number.isFinite(route.from.coords.lat) ||
        !Number.isFinite(route.to.coords.lng) ||
        !Number.isFinite(route.to.coords.lat)
      ) {
        continue
      }
      const km = segmentDistanceKm({
        from: route.from.coords,
        to: route.to.coords,
      })
      const modeKey: RouteMode | "undecided" = route.mode ?? "undecided"
      const bucket = byMode[modeKey] ?? { km: 0, count: 0 }
      bucket.km += km
      bucket.count += 1
      byMode[modeKey] = bucket
      totalKm += km

      if (shouldDrawTransportOnMap(item)) {
        drawnKm += km
      } else {
        const reason: UndrawnTransport["reason"] =
          route.leg === "outbound" || route.leg === "return"
            ? "gateway-leg"
            : "too-long"
        undrawn.push({
          itemId: item.id,
          title: item.name,
          mode: route.mode ?? null,
          leg: route.leg,
          km,
          reason,
        })
        undrawnKm += km
      }
    }
  }

  return { byMode, drawnKm, undrawn, undrawnKm, totalKm }
}

export function formatKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "0 km"
  if (km < 10) {
    const n = new Intl.NumberFormat("es-ES", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    }).format(km)
    return `${n} km`
  }
  const n = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(Math.round(km))
  return `${n} km`
}

/** Chips de km por medio: «≈ 120 km en tren · ≈ 45 km en coche». */
export function summarizeTransportKm(
  byMode: TransportDistances["byMode"],
): string {
  const order: (RouteMode | "undecided")[] = [
    "flight",
    "train",
    "bus",
    "ferry",
    "car",
    "other",
    "undecided",
  ]
  const parts: string[] = []
  for (const key of order) {
    const bucket = byMode[key]
    if (!bucket || bucket.count === 0) continue
    const label = MODE_KM_LABELS[key] ?? ""
    parts.push(`≈ ${formatKm(bucket.km)} ${label}`.trim())
  }
  return parts.join(" · ")
}

/** Resumen de tramos contabilizados pero no trazados. */
export function summarizeUndrawnTransports(undrawn: UndrawnTransport[]): string {
  if (undrawn.length === 0) return ""
  const gateway = undrawn.filter((u) => u.reason === "gateway-leg")
  const tooLong = undrawn.filter((u) => u.reason === "too-long")
  const parts: string[] = []
  const totalKm = undrawn.reduce((s, u) => s + u.km, 0)

  if (gateway.length > 0) {
    const flights = gateway.filter((u) => u.mode === "flight").length
    const trains = gateway.filter((u) => u.mode === "train").length
    const ferries = gateway.filter((u) => u.mode === "ferry").length
    const other = gateway.length - flights - trains - ferries
    const bits: string[] = []
    if (flights > 0) bits.push(`${flights} ${flights === 1 ? "vuelo" : "vuelos"}`)
    if (trains > 0) bits.push(`${trains} ${trains === 1 ? "tren" : "trenes"}`)
    if (ferries > 0) bits.push(`${ferries} ${ferries === 1 ? "ferry" : "ferrys"}`)
    if (other > 0) bits.push(`${other} ${other === 1 ? "trayecto" : "trayectos"}`)
    const allGatewayLegs = gateway.every(
      (u) => u.leg === "outbound" || u.leg === "return",
    )
    const suffix = allGatewayLegs ? " de ida y vuelta" : ""
    parts.push(`${bits.join(", ")}${suffix}`)
  }
  if (tooLong.length > 0) {
    parts.push(
      `${tooLong.length} ${tooLong.length === 1 ? "tramo largo" : "tramos largos"}`,
    )
  }
  return `+ ${parts.join(" · ")} · ≈ ${formatKm(totalKm)}`
}
