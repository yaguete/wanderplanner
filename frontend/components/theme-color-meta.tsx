"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

const LIGHT = "hsl(40 8% 96%)"
const DARK = "hsl(28 7% 7%)"

/** Barra de direcciones / status bar: sigue `wp-theme`, no el SO. */
export function ThemeColorMeta() {
  const { forcedTheme, resolvedTheme } = useTheme()
  const theme = forcedTheme ?? resolvedTheme

  useEffect(() => {
    const color = theme === "dark" ? DARK : LIGHT
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement("meta")
      meta.setAttribute("name", "theme-color")
      document.head.appendChild(meta)
    }
    meta.setAttribute("content", color)
  }, [theme])

  return null
}
