"use client"

import type { ComponentProps } from "react"
import { Turnstile } from "@/components/auth/turnstile"
import { useResolvedTurnstileTheme } from "@/hooks/use-resolved-theme"

/** Espera a hidratar y pinta el widget con el tema de `wp-theme`, no el del SO. */
export function ThemedTurnstile(props: Omit<ComponentProps<typeof Turnstile>, "theme">) {
  const theme = useResolvedTurnstileTheme()
  if (!theme) return null
  return <Turnstile {...props} theme={theme} />
}
