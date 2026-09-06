/**
 * Validación de candidatos de geocoding contra un ancla de región.
 * Puro: sin I/O. La distancia filtra homónimos lejanos; el tipo del candidato
 * decide exact vs approximate (un `place` es el centro de la ciudad, no el sitio).
 * Un `address`/`street` cuyo nombre no coincide con la query no es el sitio.
 */
import { haversineMeters } from "./map-route-geometry"

export type LngLat = { lng: number; lat: number }

export type RegionAnchor = {
  coord: LngLat
  /** Tipo Mapbox: place, locality, district, region, country, … */
  featureType: string
  label: string
}

export type GeocodeCandidate = {
  coord: LngLat
  featureType: string
  placeName?: string
  /** `text` corto de Mapbox (p. ej. «Igls»), no el place_name completo. */
  text?: string
  /** ISO-2 del país que contiene la feature; distingue Granada (ES) de Grenada (GD). */
  countryCode?: string | null
}

/**
 * De dónde salió la coordenada.
 * - `local-hit`: candidato dentro del radio del ancla.
 * - `far-name-match`: nadie pasó el radio; rescatado porque el nombre cubre la query.
 * - `anchor-fallback`: ningún candidato sirvió; el pin es el centro del ancla.
 * - `no-anchor`: sin ancla, no se sitúa.
 *
 * Cruzado con `precision` distingue un POI bueno de un centro de ciudad. El
 * `anchor-fallback` es el que un `bbox` en la petición podría rescatar: hoy el
 * recorte por distancia ocurre después, sobre candidatos que ya vinieron de fuera.
 */
export type GeocodeOutcomeReason =
  | "local-hit"
  | "far-name-match"
  | "anchor-fallback"
  | "no-anchor"

export type PlaceGeocodeOutcome =
  | {
      precision: "exact"
      coord: LngLat
      reason: GeocodeOutcomeReason
      /** Tipo Mapbox del candidato elegido. */
      featureType: string
    }
  | {
      precision: "approximate"
      coord: LngLat
      anchorLabel: string
      reason: GeocodeOutcomeReason
      /** Ausente en `anchor-fallback`: ahí no hubo candidato, el pin es el ancla. */
      featureType?: string
    }
  | { precision: "unlocated"; reason: "no-anchor" }

/** Radios en metros según el tipo del ancla. `country` no usa radio. */
const RADIUS_M: Record<string, number> = {
  locality: 15_000,
  neighborhood: 15_000,
  place: 25_000,
  district: 60_000,
  region: 150_000,
}

/** Tipos con radio estrecho: un match parcial de ancla es catastrófico (Costa → Ourense). */
const TIGHT_ANCHOR_TYPES = new Set(["place", "locality", "neighborhood", "postcode"])

/** Tipos administrativos: son el centro de una zona, no el sitio con nombre propio. */
const COARSE_TYPES = new Set([
  "place",
  "locality",
  "neighborhood",
  "district",
  "region",
  "postcode",
  "country",
])

const STREET_LIKE_TYPES = new Set(["address", "street"])

/** Menor = más específico. Empates conservan el orden de Mapbox. */
const TYPE_SPECIFICITY: Record<string, number> = {
  poi: 0,
  address: 1,
  street: 1,
  neighborhood: 2,
  locality: 3,
  place: 4,
  district: 5,
  postcode: 6,
  region: 7,
  country: 8,
}

/** Barrios / puntos cardinales: no anclan solos y no cuentan para el match de tokens. */
const WEAK_GEO_TOKENS = new Set([
  "zona",
  "centro",
  "downtown",
  "casco",
  "antiguo",
  "historico",
  "barrio",
  "pueblo",
  "ciudad",
  "provincia",
  "region",
  "norte",
  "este",
  "oeste",
  "calle",
  "avenida",
  "plaza",
  "paseo",
  "ronda",
  "old",
  "town",
])

const MIN_TOKEN_LEN = 4

function typeSpecificity(featureType: string): number {
  return TYPE_SPECIFICITY[featureType] ?? 9
}

function candidateAnchorLabel(candidate: GeocodeCandidate, fallback?: string): string {
  const text = candidate.text?.trim()
  if (text) return text
  const placeName = candidate.placeName?.trim()
  if (placeName) {
    const first = placeName.split(",")[0]?.trim()
    if (first) return first
  }
  return fallback?.trim() ?? ""
}

function normalizeGeoText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Tokens ≥4 letras que no son barrio/calle genéricos. */
export function significantTokens(text: string): string[] {
  if (!text.trim()) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of normalizeGeoText(text).split(" ")) {
    if (t.length < MIN_TOKEN_LEN || WEAK_GEO_TOKENS.has(t) || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/**
 * True si el resultado comparte algún token significativo con la query.
 * «Cuenca, Zona Centro» vs «Centro, Málaga» → false (solo comparten «centro», débil).
 * «Cuenca» vs «Cuenca, provincia de Cuenca» → true.
 */
export function sharesSignificantToken(query: string, result: string): boolean {
  const tokens = significantTokens(query)
  if (tokens.length === 0) return false
  const blob = normalizeGeoText(result)
  if (!blob) return false
  return tokens.some((t) => blob.includes(t))
}

/** Barrio suelto: no se geocodifica como ancla independiente. */
export function isWeakRegionHint(region: string | null | undefined): boolean {
  const t = region?.trim()
  if (!t) return true
  return significantTokens(t).length === 0
}

/**
 * Queries a probar, de más específica a más corta, omitiendo hints débiles.
 * «Cuenca, Zona Centro» → «Cuenca, Zona Centro», «Cuenca».
 */
export function regionAnchorQueryLadder(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const out: string[] = []
  const add = (q: string) => {
    const s = q.trim()
    if (!s || isWeakRegionHint(s)) return
    const key = normalizeGeoText(s)
    if (!key || out.some((x) => normalizeGeoText(x) === key)) return
    out.push(s)
  }
  add(trimmed)
  const first = trimmed.split(",")[0]?.trim()
  if (first) add(first)
  const tokens = significantTokens(trimmed)
  if (tokens.length) add(tokens.join(" "))
  return out
}

function candidateNameBlob(candidate: GeocodeCandidate): string {
  return normalizeGeoText(`${candidate.text ?? ""} ${candidate.placeName ?? ""}`)
}

/**
 * Un `address`/`street` solo es el sitio si todos los tokens significativos
 * de la query aparecen en su nombre. «El Gallo Gastrobar» vs «Calle Cuenca» → false;
 * «Casas Colgadas» vs «Calle Casas Colgadas» → true.
 */
export function candidateNameMatchesQuery(
  candidate: GeocodeCandidate,
  query: string,
): boolean {
  const q = query.trim()
  if (!q) return false
  const blob = candidateNameBlob(candidate)
  if (!blob) return false
  const tokens = significantTokens(q)
  if (tokens.length === 0) return blob.includes(normalizeGeoText(q))
  return tokens.every((t) => blob.includes(t))
}

/**
 * Núcleo de una consulta de ancla: lo que va antes de la primera coma.
 * «Isla de Flores, Guatemala» → «Isla de Flores». El resto es contexto y lo
 * comparte cualquier subdivisión del país, así que no distingue zonas.
 * Si el núcleo es un hint débil («Zona Centro, Madrid»), vale la consulta entera.
 *
 * Solo es el respaldo de `anchorQueryScope` cuando no se sabe el país: cortar por
 * la primera coma también tira las subdivisiones intermedias, que sí distinguen.
 */
export function anchorQueryCore(query: string): string {
  const first = query.split(",")[0]?.trim() ?? ""
  return significantTokens(first).length > 0 ? first : query.trim()
}

/**
 * El hint sin el sufijo de país: «Tikal, Petén, Guatemala» → «Tikal, Petén».
 *
 * Es el ámbito contra el que se juzga un hit amplio. El país es el único
 * componente que **todo** el viaje comparte, y por eso era el que colaba
 * `Departamento de Guatemala` en cualquier hint. Lo intermedio (`Petén`) sí
 * distingue: es la zona que el propio artículo declara, y para Tikal o Yaxhá
 * —que Mapbox no conoce por nombre— es la mejor ancla disponible.
 */
export function anchorQueryScope(query: string, countryName: string | null): string {
  const q = query.trim()
  if (!countryName) return anchorQueryCore(q)
  const parts = q
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 2) return q
  const last = parts[parts.length - 1]!
  if (normalizeGeoText(last) !== normalizeGeoText(countryName)) return q
  return parts.slice(0, -1).join(", ")
}

/**
 * ¿Sirve este hit como ancla de región? En tipos de radio estrecho exige
 * todos los tokens (`Costa Vasca` no puede anclarse en la aldea `Costa`).
 * `region`/`district`/`country` son sesgo amplio y no necesitan cubrir la
 * consulta entera, pero sí tienen que ser **de la zona pedida**: se comparan
 * contra el núcleo, no contra la consulta completa.
 *
 * Sin esa comparación, cualquier tipo amplio pasaba por el solo hecho de no ser
 * estrecho, y Mapbox rellena lo que no entiende con la subdivisión más genérica
 * del país: «Isla de Flores, Guatemala» → `Departamento de Guatemala`, a 400 km.
 * Como el ancla fija el radio (150 km en `region`), eso descartaba los
 * candidatos buenos de Petén y de Izabal. Contra la consulta completa no sirve:
 * el sufijo «, Guatemala» lo comparte también el departamento equivocado.
 * No sustituye a `sharesSignificantToken` (otros callers).
 */
export function anchorHitAcceptable(
  query: string,
  hit: GeocodeCandidate,
  /**
   * Ámbito del hint **original** ya sin país (`anchorQueryScope`). Hay que
   * pasarlo desde la escalera: su último peldaño concatena los tokens y se lleva
   * por delante las comas, así que «Isla de Flores, Guatemala» llega como «isla
   * flores guatemala» y cualquier ámbito derivado de ahí vuelve a incluir el
   * país. Con eso, `Departamento de Guatemala` pasaba otra vez el filtro.
   */
  scope?: string,
): boolean {
  const tokens = significantTokens(query)
  if (tokens.length === 0) return false
  if (candidateNameMatchesQuery(hit, query)) return true
  if (TIGHT_ANCHOR_TYPES.has(hit.featureType)) return false
  return sharesSignificantToken(scope?.trim() || anchorQueryCore(query), candidateNameBlob(hit))
}

/**
 * El país al que Mapbox atribuye estos hits, para poder descontarlo del hint.
 * Sale de los propios candidatos: la respuesta a «X, Guatemala» casi siempre
 * trae el país entre ellos, y así no hace falta una tabla de nombres.
 */
function countryNameFromHits(hits: GeocodeCandidate[]): string | null {
  const hit = hits.find((h) => h.featureType === "country")
  if (!hit) return null
  const name = hit.text?.trim() || hit.placeName?.split(",")[0]?.trim()
  return name || null
}

/**
 * Nombre corto del candidato, sin el contexto de `place_name`.
 * «Guatemala» a partir de «Guatemala» o de «Departamento de Guatemala, Guatemala».
 */
function candidateShortName(candidate: GeocodeCandidate): string {
  const text = candidate.text?.trim()
  if (text) return normalizeGeoText(text)
  const first = candidate.placeName?.split(",")[0]?.trim()
  return first ? normalizeGeoText(first) : ""
}

/**
 * Un país con una subdivisión homónima (Guatemala, México, Panamá) degradaba el
 * ancla del viaje a esa subdivisión, y con ella el radio de validación: `country`
 * no recorta, `region` recorta a 150 km. En un viaje a Guatemala eso dejaba fuera
 * Petén (~400 km) e Izabal (~200 km), que solo se salvaban por `pickFarNameMatch`.
 *
 * Dos guardias, los dos necesarios:
 * - El nombre del país tiene que **ser** la consulta, no contenerla: los tokens
 *   significativos de «Ciudad de México» se reducen a «mexico» (`ciudad` es débil),
 *   así que comparar por tokens mandaría ese viaje al centroide del país y perdería
 *   la proximidad de la capital.
 * - El candidato específico tiene que caer dentro de ese mismo país: «Granada» (ES)
 *   frente a Grenada (GD) son sitios distintos y ahí sigue ganando la ciudad.
 */
function homonymousCountryHit(
  hits: GeocodeCandidate[],
  best: GeocodeCandidate,
  query: string,
): GeocodeCandidate | null {
  if (best.featureType === "country") return null
  if (!best.countryCode) return null
  const q = normalizeGeoText(query)
  if (!q) return null
  const country = hits.find(
    (h) =>
      h.featureType === "country" &&
      candidateShortName(h) === q &&
      h.countryCode &&
      h.countryCode === best.countryCode,
  )
  return country ?? null
}

/**
 * Entre los hits aceptables, el más específico (place > region > country).
 * «Granada» en español es también el país GD: sin esto gana la isla.
 * Excepción: la subdivisión homónima de su propio país (ver `homonymousCountryHit`).
 */
export function pickBestAnchorHit(
  hits: GeocodeCandidate[],
  query: string,
  /** `hint`: el texto original del que salió `query`; ver `anchorHitAcceptable`. */
  options?: { hint?: string },
): GeocodeCandidate | null {
  const scope = anchorQueryScope(options?.hint?.trim() || query, countryNameFromHits(hits))
  const ok = hits.filter((h) => anchorHitAcceptable(query, h, scope))
  if (ok.length === 0) return null
  let best = ok[0]!
  let bestRank = typeSpecificity(best.featureType)
  for (let i = 1; i < ok.length; i++) {
    const h = ok[i]!
    const rank = typeSpecificity(h.featureType)
    if (rank < bestRank) {
      best = h
      bestRank = rank
    }
  }
  return homonymousCountryHit(ok, best, query) ?? best
}

function isStreetLike(featureType: string): boolean {
  return STREET_LIKE_TYPES.has(featureType)
}

export function maxDistanceMetersForAnchorType(featureType: string): number | null {
  if (featureType === "country") return null
  return RADIUS_M[featureType] ?? RADIUS_M.place!
}

export function featureTypeFromMapboxId(id: string | undefined | null): string {
  if (!id) return "unknown"
  const dot = id.indexOf(".")
  return dot > 0 ? id.slice(0, dot) : id
}

export function candidatePassesAnchor(
  candidate: GeocodeCandidate,
  anchor: RegionAnchor,
): boolean {
  if (anchor.featureType === "country") {
    // Sin tope de distancia: Search Box trae `poi`/`address`, no solo tipos v5.
    return true
  }
  const maxM = maxDistanceMetersForAnchorType(anchor.featureType)
  if (maxM == null) return true
  return haversineMeters(candidate.coord, anchor.coord) <= maxM
}

/**
 * Radios para pines GPS del artículo. Más holgados que Search Box: un viaje
 * de 20 días en Alaska (`region`) no cabe en 150 km. Bali sigue fuera.
 */
const MAPS_PIN_RADIUS_M: Record<string, number> = {
  locality: 80_000,
  neighborhood: 80_000,
  place: 250_000,
  district: 800_000,
  region: 2_500_000,
  country: 8_000_000,
}

export function mapsPinPassesAnchor(coord: LngLat, anchor: RegionAnchor): boolean {
  const maxM = MAPS_PIN_RADIUS_M[anchor.featureType] ?? MAPS_PIN_RADIUS_M.place!
  return haversineMeters(coord, anchor.coord) <= maxM
}

/**
 * Entre los que pasan el filtro, el más específico (poi > address > … > country).
 * Empates conservan el orden de Mapbox.
 * Un `address`/`street` sin coincidencia de nombre con `query` no cuenta.
 */
export function pickFirstValidCandidate(
  candidates: GeocodeCandidate[],
  anchor: RegionAnchor | null,
  query?: string | null,
): GeocodeCandidate | null {
  const passing = (anchor
    ? candidates.filter((c) => candidatePassesAnchor(c, anchor))
    : candidates
  ).filter((c) => {
    if (!isStreetLike(c.featureType)) return true
    return query ? candidateNameMatchesQuery(c, query) : false
  })
  if (passing.length === 0) return null
  let best = passing[0]!
  let bestRank = typeSpecificity(best.featureType)
  for (let i = 1; i < passing.length; i++) {
    const c = passing[i]!
    const rank = typeSpecificity(c.featureType)
    if (rank < bestRank) {
      best = c
      bestRank = rank
    }
  }
  return best
}

/**
 * Si nadie pasa el radio del ancla, el candidato cuyo nombre cubre la query
 * (todos los tokens) más cercano al ancla. Homónimos lejanos (Gernika CC en
 * Barcelona) pierden frente al Gernika real. No aplica a `address`/`street`.
 */
function pickFarNameMatch(
  candidates: GeocodeCandidate[],
  anchor: RegionAnchor,
  query: string,
): GeocodeCandidate | null {
  const matching = candidates.filter((c) => {
    if (isStreetLike(c.featureType)) return false
    return candidateNameMatchesQuery(c, query)
  })
  if (matching.length === 0) return null
  let best = matching[0]!
  let bestD = haversineMeters(best.coord, anchor.coord)
  for (let i = 1; i < matching.length; i++) {
    const c = matching[i]!
    const d = haversineMeters(c.coord, anchor.coord)
    if (d < bestD) {
      best = c
      bestD = d
    }
  }
  return best
}

function outcomeFromHit(
  hit: GeocodeCandidate,
  anchor: RegionAnchor,
  reason: GeocodeOutcomeReason,
): PlaceGeocodeOutcome {
  if (COARSE_TYPES.has(hit.featureType)) {
    return {
      precision: "approximate",
      coord: hit.coord,
      anchorLabel: candidateAnchorLabel(hit, anchor.label),
      reason,
      featureType: hit.featureType,
    }
  }
  return { precision: "exact", coord: hit.coord, reason, featureType: hit.featureType }
}

export function pickGeocodeOutcome(
  candidates: GeocodeCandidate[],
  anchor: RegionAnchor | null,
  query?: string | null,
): PlaceGeocodeOutcome {
  if (!anchor) return { precision: "unlocated", reason: "no-anchor" }
  const local = pickFirstValidCandidate(candidates, anchor, query)
  if (local) return outcomeFromHit(local, anchor, "local-hit")
  const q = query?.trim()
  if (q) {
    const far = pickFarNameMatch(candidates, anchor, q)
    if (far) return outcomeFromHit(far, anchor, "far-name-match")
  }
  return {
    precision: "approximate",
    coord: anchor.coord,
    anchorLabel: anchor.label,
    reason: "anchor-fallback",
  }
}

/** Radio de reparto visual: ~30 m · n (n = tamaño del grupo). */
const SPREAD_METERS_PER_PIN = 30
const EARTH_M = 6_371_000

function coordKey(c: LngLat): string {
  return `${c.lng.toFixed(5)},${c.lat.toFixed(5)}`
}

function offsetAround(center: LngLat, index: number, count: number): LngLat {
  const radiusM = SPREAD_METERS_PER_PIN * count
  const angle = (2 * Math.PI * index) / count
  const dLat = ((radiusM * Math.cos(angle)) / EARTH_M) * (180 / Math.PI)
  const cosLat = Math.cos((center.lat * Math.PI) / 180)
  const dLng =
    ((radiusM * Math.sin(angle)) / (EARTH_M * Math.max(0.2, Math.abs(cosLat)))) *
    (180 / Math.PI)
  return { lng: center.lng + dLng, lat: center.lat + dLat }
}

/**
 * Reparte pines aproximados que caen en la misma coordenada para el display.
 * El radio crece con el grupo (~30 m · n). No usar el resultado en la geometría
 * de la ruta: solo marcadores y fitBounds (`displayCoord`).
 */
export function offsetStackedApproximate<
  T extends { id: string; coord: LngLat; precision?: string },
>(items: T[]): Map<string, LngLat> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    if (item.precision !== "approximate") continue
    const key = coordKey(item.coord)
    const g = groups.get(key)
    if (g) g.push(item)
    else groups.set(key, [item])
  }
  const out = new Map<string, LngLat>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.forEach((item, i) => {
      out.set(item.id, offsetAround(item.coord, i, group.length))
    })
  }
  return out
}
