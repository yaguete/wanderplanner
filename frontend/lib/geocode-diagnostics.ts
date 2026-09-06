/**
 * Recuento de cómo acaba cada ítem del mapa: pin exacto, centro de zona o sin
 * situar. Puro: sin I/O ni consola. Existe para decidir con un número si vale
 * la pena acotar la petición de geocoding con `bbox`; no cambia el mapa.
 *
 * Lo enciende `isGeocodeDebugEnabled` (`localStorage.wp-geocode-debug`, aquí y
 * en producción). Sin la clave no se calcula nada.
 */
import type { GeocodeOutcomeReason } from "./geocode-validate"

/** `saved-coords`: el ítem ya traía coordenadas en el jsonb, no se geocodifica. */
export type GeocodeDiagnosticReason = GeocodeOutcomeReason | "saved-coords"

export type GeocodeDiagnosticEntry = {
  name: string
  reason: GeocodeDiagnosticReason
  precision: "exact" | "approximate" | "unlocated"
  /** Tipo Mapbox del candidato elegido; ausente si no hubo candidato. */
  featureType?: string
  /** Etiqueta con la que se pinta un pin aproximado (candidato o ancla). */
  label?: string
  /** Ancla contra la que se validó la distancia. */
  anchor?: { label: string; featureType: string }
  /**
   * `region` cruda del ítem, tal cual la dejó la extracción. Es lo que se
   * geocodifica como ancla, así que un hint malo desplaza el pin sin que el
   * geocoder tenga culpa.
   */
  regionHint?: string | null
}

export type GeocodeCount = { key: string; count: number }

export type GeocodeApproximateDetail = {
  name: string
  featureType?: string
  label?: string
  anchor?: string
}

export type GeocodeDiagnosticSummary = {
  total: number
  /** Ya venían resueltos: no dicen nada de la calidad del geocoder. */
  saved: number
  /** Geocodificados en esta pasada (`total` − `saved`). Base de los porcentajes. */
  geocoded: number
  exact: number
  approximate: number
  unlocated: number
  byReason: Record<GeocodeDiagnosticReason, number>
  /**
   * Los que cayeron al centro del ancla porque ningún candidato pasó el radio.
   * Es la cota superior de lo que un `bbox` podría rescatar: con la zona en la
   * petición, esos cinco huecos de respuesta los ocuparían candidatos de dentro.
   */
  rescuableByBbox: number
  /** Sobre `geocoded`, 0-100 con un decimal. 0 si no se geocodificó nada. */
  rescuablePct: number
  /** Nombres de los `anchor-fallback`, para ir a mirarlos a mano. */
  rescuableNames: string[]
  /**
   * Anclas usadas, de más a menos frecuente. Un ancla `country` desactiva el
   * filtro de distancia (`candidatePassesAnchor`), así que con ella
   * `rescuableByBbox` sale 0 por construcción, no por acierto.
   */
  anchors: GeocodeCount[]
  /** Si alguna validación se hizo contra un país: el recuento es poco concluyente. */
  hasCountryAnchor: boolean
  /** `region` de los ítems, de más a menos frecuente. Entrada del ancla. */
  regionHints: GeocodeCount[]
  /** Tipos Mapbox de los aproximados, de más a menos frecuente. */
  approximateByType: GeocodeCount[]
  /** Los aproximados uno a uno, para comprobar a mano si el punto es razonable. */
  approximateDetail: GeocodeApproximateDetail[]
  /** Rescatados fuera del radio: los más sospechosos de estar mal situados. */
  farNameMatches: GeocodeApproximateDetail[]
}

function countsToSorted(map: Map<string, number>): GeocodeCount[] {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

const EMPTY_BY_REASON: Record<GeocodeDiagnosticReason, number> = {
  "local-hit": 0,
  "far-name-match": 0,
  "anchor-fallback": 0,
  "no-anchor": 0,
  "saved-coords": 0,
}

export function summarizeGeocodeOutcomes(
  entries: readonly GeocodeDiagnosticEntry[],
): GeocodeDiagnosticSummary {
  const byReason = { ...EMPTY_BY_REASON }
  let saved = 0
  let exact = 0
  let approximate = 0
  let unlocated = 0
  const rescuableNames: string[] = []
  const anchorCounts = new Map<string, number>()
  const hintCounts = new Map<string, number>()
  const approximateTypes = new Map<string, number>()
  const approximateDetail: GeocodeApproximateDetail[] = []
  const farNameMatches: GeocodeApproximateDetail[] = []
  let hasCountryAnchor = false

  for (const e of entries) {
    byReason[e.reason] += 1
    if (e.reason === "saved-coords") {
      saved += 1
      continue
    }
    if (e.anchor) {
      const key = `${e.anchor.label} (${e.anchor.featureType})`
      anchorCounts.set(key, (anchorCounts.get(key) ?? 0) + 1)
      if (e.anchor.featureType === "country") hasCountryAnchor = true
    }
    const hint = e.regionHint?.trim() || "(sin región)"
    hintCounts.set(hint, (hintCounts.get(hint) ?? 0) + 1)
    const detail: GeocodeApproximateDetail = {
      name: e.name,
      featureType: e.featureType,
      label: e.label,
      anchor: e.anchor ? `${e.anchor.label} (${e.anchor.featureType})` : undefined,
    }
    if (e.precision === "exact") exact += 1
    else if (e.precision === "approximate") {
      approximate += 1
      const t = e.featureType ?? "sin candidato"
      approximateTypes.set(t, (approximateTypes.get(t) ?? 0) + 1)
      approximateDetail.push(detail)
    } else unlocated += 1
    if (e.reason === "anchor-fallback") rescuableNames.push(e.name)
    if (e.reason === "far-name-match") farNameMatches.push(detail)
  }

  const geocoded = entries.length - saved
  const rescuableByBbox = byReason["anchor-fallback"]
  const rescuablePct =
    geocoded > 0 ? Math.round((rescuableByBbox / geocoded) * 1000) / 10 : 0

  return {
    total: entries.length,
    saved,
    geocoded,
    exact,
    approximate,
    unlocated,
    byReason,
    rescuableByBbox,
    rescuablePct,
    rescuableNames,
    anchors: countsToSorted(anchorCounts),
    hasCountryAnchor,
    regionHints: countsToSorted(hintCounts),
    approximateByType: countsToSorted(approximateTypes),
    approximateDetail,
    farNameMatches,
  }
}

const REASON_LABEL: Record<GeocodeDiagnosticReason, string> = {
  "local-hit": "candidato dentro del radio",
  "far-name-match": "rescatado por nombre (fuera del radio)",
  "anchor-fallback": "centro del ancla (nadie pasó el radio)",
  "no-anchor": "sin ancla",
  "saved-coords": "coords guardadas",
}

/** Texto para la consola del navegador. Sin colores ni tablas: se copia y se pega. */
export function formatGeocodeSummary(summary: GeocodeDiagnosticSummary): string {
  const lines = [
    `Geocoding del mapa: ${summary.total} ítems (${summary.saved} con coords guardadas, ${summary.geocoded} geocodificados)`,
  ]
  if (summary.geocoded > 0) {
    lines.push(
      `  exactos ${summary.exact} · aproximados ${summary.approximate} · sin situar ${summary.unlocated}`,
    )
  }
  for (const reason of Object.keys(REASON_LABEL) as GeocodeDiagnosticReason[]) {
    const n = summary.byReason[reason]
    if (n > 0) lines.push(`  ${n} — ${REASON_LABEL[reason]}`)
  }
  lines.push(
    `  Rescatables acotando la petición con bbox: ${summary.rescuableByBbox} (${summary.rescuablePct}% de los geocodificados)`,
  )
  if (summary.rescuableNames.length > 0) {
    lines.push(`  → ${summary.rescuableNames.join(" · ")}`)
  }
  if (summary.regionHints.length > 0) {
    lines.push(
      `  Región de los ítems: ${summary.regionHints.map((h) => `${h.key} ×${h.count}`).join(" · ")}`,
    )
  }
  if (summary.anchors.length > 0) {
    lines.push(
      `  Anclas: ${summary.anchors.map((a) => `${a.key} ×${a.count}`).join(" · ")}`,
    )
  }
  if (summary.hasCountryAnchor) {
    lines.push(
      "  ⚠ Ancla de país: el filtro de distancia no descarta nada, así que el 0 de rescatables no prueba que los pines estén bien.",
    )
  }
  if (summary.approximateByType.length > 0) {
    lines.push(
      `  Aproximados por tipo: ${summary.approximateByType.map((t) => `${t.key} ${t.count}`).join(" · ")}`,
    )
    for (const d of summary.approximateDetail) {
      lines.push(`    ${describeDetail(d)}`)
    }
  }
  if (summary.farNameMatches.length > 0) {
    lines.push("  Rescatados fuera del radio (revisar):")
    for (const d of summary.farNameMatches) {
      lines.push(`    ${describeDetail(d)}`)
    }
  }
  return lines.join("\n")
}

function describeDetail(d: GeocodeApproximateDetail): string {
  const parts = [d.name]
  const type = d.featureType ?? "sin candidato"
  // La etiqueta solo aporta cuando difiere del nombre buscado (p. ej. «Panajachel»).
  parts.push(d.label && d.label !== d.name ? `→ ${type} «${d.label}»` : `→ ${type}`)
  if (d.anchor) parts.push(`· ancla ${d.anchor}`)
  return parts.join(" ")
}

const DEBUG_KEY = "wp-geocode-debug"

/**
 * Solo con `localStorage.wp-geocode-debug`, también en desarrollo: un viaje son
 * decenas de líneas por carga y el resumen tapaba el resto de la consola.
 * Así se mide en viajes reales, aquí o en producción, sin redeploy.
 */
export function isGeocodeDebugEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return Boolean(window.localStorage.getItem(DEBUG_KEY))
  } catch {
    // Safari en privado: sin almacenamiento, sin diagnóstico.
    return false
  }
}
