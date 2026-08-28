"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { themeFromDocumentClass } from "@/lib/document-theme"

/**
 * Tema del widget Turnstile: lee la clase de `<html>` (la pone el script de
 * next-themes **antes** de hidratar). `useTheme().resolvedTheme` tras SSR suele
 * ir `undefined` y luego “light”; si montamos el widget con eso y después
 * pasa a dark, `remove()` invalida el token y Cloudflare pide un segundo reto.
 * `null` hasta el primer efecto para no pintar un iframe en SSR.
 */
export function useResolvedTurnstileTheme(): "light" | "dark" | null {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null)
  useEffect(() => {
    const root = document.documentElement
    const read = () => themeFromDocumentClass(root.className)
    setTheme(read())
    const obs = new MutationObserver(() => {
      const next = read()
      setTheme((prev) => (prev === next ? prev : next))
    })
    obs.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])
  return theme
}

export function usePaintTheme(): "light" | "dark" {
  const { forcedTheme, resolvedTheme } = useTheme()
  return (forcedTheme ?? resolvedTheme) === "dark" ? "dark" : "light"
}
