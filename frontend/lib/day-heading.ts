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
 * Título legible: "Día 1 · Llegada" (1-based day index in UI = dayIndex0 + 1)
 */
export function formatDayHeadingLine(dayIndex0: number, description: string): string {
  const d = getDayUserDescription(description).trim()
  const n = dayIndex0 + 1
  if (!d) return `Día ${n}`
  return `Día ${n} · ${d}`
}
