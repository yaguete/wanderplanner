/** Tema pintado en `<html>`, no el de `useTheme()` (tras SSR a veces va `undefined`). */
export function themeFromDocumentClass(
  className: string | null | undefined,
): "light" | "dark" {
  if (!className) return "light"
  return className.split(/\s+/).includes("dark") ? "dark" : "light"
}
