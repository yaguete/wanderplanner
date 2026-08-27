"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

/** Turnstile `auto` sigue el SO, no `wp-theme`. `null` hasta hidratar. */
export function useResolvedTurnstileTheme(): "light" | "dark" | null {
  const { forcedTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return (forcedTheme ?? resolvedTheme) === "dark" ? "dark" : "light"
}

export function usePaintTheme(): "light" | "dark" {
  const { forcedTheme, resolvedTheme } = useTheme()
  return (forcedTheme ?? resolvedTheme) === "dark" ? "dark" : "light"
}
