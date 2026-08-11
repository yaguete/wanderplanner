/** Tope de fuentes por viaje (UX; las cuotas de extraction ya cubren el coste). */
export const MAX_SOURCES_PER_TRIP = 5

/**
 * ¿Se puede iniciar otra extracción?
 * Cuentan fuentes reales + pendings en `loading` (un chip en error no ocupa cupo).
 */
export function canAddSource(opts: {
  sourceCount: number
  loadingPendingCount: number
}): boolean {
  return opts.sourceCount + opts.loadingPendingCount < MAX_SOURCES_PER_TRIP
}
