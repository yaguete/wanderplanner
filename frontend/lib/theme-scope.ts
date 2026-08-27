/**
 * Rutas donde el `<html>` no puede llevar `.dark`.
 * `/partners` está pintado a mano contra tokens claros (`.landing-negative`).
 */
export function isForcedLightPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const path = stripQuery(pathname)
  return path === "/partners" || path.startsWith("/partners/")
}

export function isAppShellPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const path = stripQuery(pathname)
  return (
    path === "/trips" ||
    path.startsWith("/trips/") ||
    path === "/account" ||
    path.startsWith("/account/")
  )
}

/** El toggle de apariencia no sale en el footer negativo de `/partners`. */
export function showsThemeToggle(
  pathname: string | null | undefined,
  tone?: "light" | "negative",
): boolean {
  if (tone === "negative") return false
  if (isForcedLightPath(pathname)) return false
  return true
}

function stripQuery(pathname: string): string {
  const path = pathname.split("?")[0] ?? pathname
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1)
  return path
}
