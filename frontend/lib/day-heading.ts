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
