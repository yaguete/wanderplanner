/** `/trips/{id}` (con o sin slash final). No el listado ni `/account`. */
export function tripIdFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  const match = pathname.match(/^\/trips\/([^/]+)\/?$/)
  return match?.[1] ?? null
}

export function isTripDetailPath(pathname: string | null | undefined): boolean {
  return tripIdFromPath(pathname) !== null
}
