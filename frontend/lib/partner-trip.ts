/**
 * Helpers del CTA de blogs partners (`/start?source=&ref=&days=`).
 * Compartidos entre `app/start/page.tsx` (borrador) y `trip-context` (adopción al añadir fuente).
 */

export const MAX_AUTO_DAYS = 60

/**
 * Nombre del borrador que crea `/start`; `trip-context` lo usa para saber si el usuario ya renombró.
 * Hace `.trim()` internamente: el intento automático de `/trips/[tripId]` pasa la URL de la query
 * tal cual (sin trim), mientras que un reintento manual desde `AddSourceDialog` sí la trimea: si no
 * se normaliza aquí, una URL con espacios sobrantes rompería la comparación de igualdad de nombres.
 */
export function draftTripNameFor(sourceUrl: string): string {
  const raw = sourceUrl.trim()
  if (!raw) return "Mi viaje"
  try {
    const host = new URL(raw).hostname.replace(/^www\./i, "")
    return host ? `Viaje desde ${host}` : "Mi viaje"
  } catch {
    return "Mi viaje"
  }
}

/**
 * `&days=N` del CTA: entero 1..MAX_AUTO_DAYS; cualquier otra cosa se descarta en silencio.
 */
export function parseDaysParam(raw: string | null): number | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n < 1 || n > MAX_AUTO_DAYS) return null
  return n
}
