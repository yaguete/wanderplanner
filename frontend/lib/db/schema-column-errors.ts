/** Errores de PostgREST/Postgres por columna ausente o caché de esquema. */

export type PostgrestLikeError = {
  code?: string
  message?: string
  details?: string
  hint?: string
} | null | undefined

export function errorBlob(error: PostgrestLikeError): string {
  if (!error) return ""
  return `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase()
}

function isMissingColumnError(error: PostgrestLikeError, column: string): boolean {
  const blob = errorBlob(error)
  if (!blob.includes(column)) return false
  return /pgrst204|42703|does not exist|could not find|schema cache/.test(blob)
}

/** PostgREST a veces solo manda PGRST204, sin el nombre de columna en `message`. */
export function isSchemaCacheError(error: PostgrestLikeError): boolean {
  return /pgrst204|42703|does not exist|could not find|schema cache/.test(errorBlob(error))
}

export function isMissingBudgetColumnError(error: PostgrestLikeError): boolean {
  return isMissingColumnError(error, "budget")
}

export function isMissingShareCardColumnError(error: PostgrestLikeError): boolean {
  return isMissingColumnError(error, "share_card")
}

/** `budget` y `share_card` comparten pestillo de esquema (columnas jsonb opcionales). */
export function isMissingOptionalColumnError(error: PostgrestLikeError): boolean {
  return isMissingBudgetColumnError(error) || isMissingShareCardColumnError(error)
}

export function isMissingVersionColumnError(error: PostgrestLikeError): boolean {
  return isMissingColumnError(error, "version")
}
