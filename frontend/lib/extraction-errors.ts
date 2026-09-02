/**
 * Copy público de un fallo de extracción. Espejo de
 * `backend/extraction_errors.py`: el dict de Anthropic (`overloaded_error`,
 * `request_id`) no debe pintar en Fuentes.
 */
export const EXTRACTION_PROVIDER_BUSY =
  "Para extraer el artículo usamos proveedores de IA que justo ahora están funcionando regular."

export const EXTRACTION_GENERIC_FAILURE =
  "No hemos podido destilar esta fuente. Prueba otra vez en unos segundos."

const DUMP_RE =
  /overloaded_error|rate_limit_error|request_id|['"]type['"]\s*:\s*['"]error['"]/i

export function looksLikeProviderDump(text: string): boolean {
  const s = text.trim()
  if (!s) return false
  if (s === EXTRACTION_PROVIDER_BUSY || s === EXTRACTION_GENERIC_FAILURE) return false
  if (s.includes("req_") && s.includes("request_id")) return true
  return DUMP_RE.test(s)
}

/** Sustituye basura del proveedor; deja el resto de mensajes intactos. */
export function friendlyExtractionMessage(raw: string | null | undefined): string {
  const text = (raw ?? "").trim()
  if (!text) return EXTRACTION_GENERIC_FAILURE
  if (looksLikeProviderDump(text)) return EXTRACTION_PROVIDER_BUSY
  return text
}
