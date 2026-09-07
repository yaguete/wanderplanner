/**
 * El campo `UserDay.label` guarda solo la descripción (sin "Día n ·").
 * Datos antiguos con "Día 1 — …" se normalizan al leer.
 */
export function getDayUserDescription(stored: string): string {
  const t = stored.trim()
  if (!t) return ""
  const prefix = t.match(/^\s*D[ií]a\s+\d+\s*/i)
  if (prefix) {
    if (/^\s*D[ií]a\s+\d+\s*$/i.test(t)) return ""
    const rest = t.slice(prefix[0].length)
    return rest
      .replace(/^\s*[—–·]\s*/, "")
      .replace(/^\s*[-–—]\s*/, "")
      .replace(/^\s*\.\s*/, "")
      .trim()
  }
  return t
}

function capitalizeFirstEs(value: string): string {
  const t = value.trim()
  if (!t) return t
  return t.charAt(0).toLocaleUpperCase("es") + t.slice(1)
}

/**
 * Título legible:
 * - "Día 1 · lun 14 sept · Llegada" (con fecha y descripción)
 * - "Día 1 · lun 14 sept" (solo fecha)
 * - "Día 1 · Llegada" / "Día 1" (sin fecha, como antes)
 *
 * dayIndex0: índice 0-based; en UI el número es dayIndex0 + 1.
 * dateLabel: p.ej. resultado de formatDayDate; opcional.
 */
export function formatDayHeadingLine(
  dayIndex0: number,
  description: string,
  dateLabel?: string | null,
): string {
  const d = getDayUserDescription(description).trim()
  const n = dayIndex0 + 1
  const date = dateLabel?.trim() || null
  if (date && d) return `Día ${n} · ${date} · ${d}`
  if (date) return `Día ${n} · ${date}`
  if (!d) return `Día ${n}`
  return `Día ${n} · ${d}`
}

/**
 * Opción del filtro de día de la Ruta: fecha (weekday con mayúscula) y
 * descripción, sin «Día n». «Lun 28 dic · Vuelo a Edimburgo».
 * Sin fecha, la descripción tal cual; si no hay nada, «Día n».
 */
export function formatDayFilterOption(
  dayIndex0: number,
  description: string,
  dateLabel?: string | null,
): string {
  const d = getDayUserDescription(description).trim()
  const rawDate = dateLabel?.trim() || null
  const date = rawDate ? capitalizeFirstEs(rawDate) : null
  if (date && d) return `${date} · ${d}`
  if (date) return date
  if (d) return d
  return `Día ${dayIndex0 + 1}`
}

/**
 * Opción de un selector de día (alta/edición): "Día 1 (29 ago)",
 * o "Día 1" si el viaje no tiene fechas. Sin descripción del día.
 *
 * `dateLabel` es el compacto (`formatDayDateShort`), no el de cabecera.
 */
export function formatDayPickerLabel(
  dayIndex0: number,
  dateLabel?: string | null,
): string {
  const n = dayIndex0 + 1
  const date = dateLabel?.trim() || null
  return date ? `Día ${n} (${date})` : `Día ${n}`
}

/**
 * Segunda línea de una opción del selector de día: descripción del día,
 * o recuento / vacío. «ya añadido» va aparte (fuera de `ItemText`: si
 * viajara ahí, Radix lo clonaría en el trigger).
 */
export function formatDayPickerHint(params: {
  description: string
  itemCount: number
}): string {
  const desc = params.description.trim()
  if (desc) return desc
  if (params.itemCount <= 0) return "Sin planes todavía"
  return params.itemCount === 1 ? "1 ítem" : `${params.itemCount} ítems`
}

export function dayHasSourceItem(
  day: { items: readonly { sourceItemId?: string | null }[] },
  sourceItemId: string,
): boolean {
  return day.items.some((it) => it.sourceItemId === sourceItemId)
}

/** Primer día del viaje que aún no tiene ese `sourceItemId`. `null` si está en todos. */
export function firstDayIdWithoutSourceItem(
  days: readonly { id: string; items: readonly { sourceItemId?: string | null }[] }[],
  sourceItemId: string | null | undefined,
): string | null {
  if (!sourceItemId) return days[0]?.id ?? null
  for (const day of days) {
    if (!dayHasSourceItem(day, sourceItemId)) return day.id
  }
  return null
}
