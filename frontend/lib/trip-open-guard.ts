/**
 * Decisiones puras al abrir un viaje. Sin React: el detalle no debe concluir
 * que el viaje no existe mientras Auth o el snapshot aún no han cerrado.
 */

export function tripsQueryPending(input: {
  authLoading: boolean
  tripsLoading: boolean
  userId: string | null
  rehydrated: boolean
}): boolean {
  if (input.authLoading || input.tripsLoading) return true
  // Hueco clásico: `user` acaba de aparecer y el effect del provider aún no
  // ha puesto `isLoading=true`. Sin esto el detalle hace replace("/trips").
  if (input.userId && !input.rehydrated) return true
  return false
}

export function shouldBounceMissingTrip(input: {
  authLoading: boolean
  tripsPending: boolean
  userId: string | null
  tripFound: boolean
  openingTripId: string | null
  tripId: string
}): boolean {
  if (input.authLoading || input.tripsPending || !input.userId) return false
  if (input.tripFound) return false
  if (input.openingTripId === input.tripId) return false
  return true
}

/** Cmd/Ctrl-click y botón que no sea el primario no arrancan el overlay. */
export function shouldBeginOpenTrip(event?: {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  button?: number
}): boolean {
  if (!event) return true
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  return (event.button ?? 0) === 0
}
