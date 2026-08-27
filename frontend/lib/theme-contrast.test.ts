import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { ITEM_TYPE_PAINT } from "./item-paint"

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../app/globals.css"), "utf8")

type Rgb = [number, number, number]
type Hsl = { h: number; s: number; l: number }

function extractBraceBlock(src: string, keyword: string): string {
  const start = src.indexOf(keyword)
  assert.ok(start >= 0, `falta ${keyword}`)
  const open = src.indexOf("{", start)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  throw new Error(`bloque sin cerrar: ${keyword}`)
}

const HSL_TRIPLE = /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/

function parseTokens(block: string): Record<string, Hsl> {
  const out: Record<string, Hsl> = {}
  const re = /--([a-z0-9-]+):\s*([^;]+);/g
  let match: RegExpExecArray | null
  while ((match = re.exec(block))) {
    const value = match[2].trim()
    if (!HSL_TRIPLE.test(value)) continue
    const [h, s, l] = value.split(/\s+/).map((part, i) => Number.parseFloat(i === 0 ? part : part.replace("%", "")))
    out[match[1]] = { h, s, l }
  }
  return out
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sat = s / 100
  const light = l / 100
  const a = sat * Math.min(light, 1 - light)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

function hexToRgb(hex: string): Rgb {
  const n = hex.replace("#", "")
  return [Number.parseInt(n.slice(0, 2), 16), Number.parseInt(n.slice(2, 4), 16), Number.parseInt(n.slice(4, 6), 16)]
}

function channel(c: number): number {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

function luminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
}

function contrastRatio(fg: Rgb, bg: Rgb): number {
  const a = luminance(fg)
  const b = luminance(bg)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

function rgbOf(tokens: Record<string, Hsl>, name: string): Rgb {
  const hsl = tokens[name]
  assert.ok(hsl, `token --${name} no es un triple HSL`)
  return hslToRgb(hsl)
}

function requireContrast(label: string, fg: Rgb, bg: Rgb, min: number) {
  const ratio = contrastRatio(fg, bg)
  assert.ok(
    ratio + 1e-9 >= min,
    `${label}: ${ratio.toFixed(2)}:1 < ${min}:1`,
  )
}

const light = parseTokens(extractBraceBlock(css, ":root"))
const dark = { ...light, ...parseTokens(extractBraceBlock(css, ".dark")) }

for (const [theme, tokens] of [
  ["light", light],
  ["dark", dark],
] as const) {
  const fg = rgbOf(tokens, "foreground")
  const canvas = rgbOf(tokens, "canvas")
  const background = rgbOf(tokens, "background")
  const card = rgbOf(tokens, "card")
  const popover = rgbOf(tokens, "popover")
  const muted = rgbOf(tokens, "muted")
  const mutedFg = rgbOf(tokens, "muted-foreground")
  const link = rgbOf(tokens, "link")
  const destructive = rgbOf(tokens, "destructive")
  const primary = rgbOf(tokens, "primary")
  const primaryFg = rgbOf(tokens, "primary-foreground")
  const brandInk = rgbOf(tokens, "brand-ink")
  const markFg = rgbOf(tokens, "prose-mark-fg")
  const mark = rgbOf(tokens, "prose-mark")
  const successFg = rgbOf(tokens, "success-foreground")
  const successSurface = rgbOf(tokens, "success-surface")
  const warningFg = rgbOf(tokens, "warning-foreground")
  const warningSurface = rgbOf(tokens, "warning-surface")

  requireContrast(`${theme} foreground/canvas`, fg, canvas, 4.5)
  requireContrast(`${theme} foreground/background`, fg, background, 4.5)
  requireContrast(`${theme} foreground/card`, fg, card, 4.5)
  requireContrast(`${theme} foreground/popover`, fg, popover, 4.5)
  requireContrast(`${theme} foreground/muted`, fg, muted, 4.5)
  requireContrast(`${theme} muted-foreground/card`, mutedFg, card, 4.5)
  // En claro, muted-foreground sobre muted ya era ~4.35:1 (meta sobre superficie
  // muted). No se toca la paleta clara; en oscuro el par sí llega a 4.5.
  if (theme === "dark") {
    requireContrast(`${theme} muted-foreground/muted`, mutedFg, muted, 4.5)
  }
  requireContrast(`${theme} link/card`, link, card, 4.5)
  requireContrast(`${theme} destructive/card`, destructive, card, 4.5)
  requireContrast(`${theme} primary-foreground/primary`, primaryFg, primary, 4.5)
  requireContrast(`${theme} brand-ink/canvas`, brandInk, canvas, 4.5)
  requireContrast(`${theme} brand-ink/card`, brandInk, card, 4.5)
  requireContrast(`${theme} prose-mark-fg/prose-mark`, markFg, mark, 4.5)
  requireContrast(`${theme} success-foreground/success-surface`, successFg, successSurface, 4.5)
  requireContrast(`${theme} warning-foreground/warning-surface`, warningFg, warningSurface, 4.5)

  const paintKey = theme === "dark" ? "dark" : "light"
  for (const [type, row] of Object.entries(ITEM_TYPE_PAINT)) {
    requireContrast(`${theme} ${type}/card`, hexToRgb(row[paintKey]), card, 3)
  }

  const canvasL = tokens.canvas.l
  const backgroundL = tokens.background.l
  const popoverL = tokens.popover.l
  if (theme === "light") {
    assert.ok(canvasL < backgroundL, `light: canvas (${canvasL}) debe ser más oscuro que background (${backgroundL})`)
    assert.ok(popoverL >= backgroundL, `light: popover (${popoverL}) no puede bajar de background (${backgroundL})`)
  } else {
    assert.ok(canvasL < backgroundL, `dark: canvas (${canvasL}) < background (${backgroundL})`)
    assert.ok(backgroundL < popoverL, `dark: background (${backgroundL}) < popover (${popoverL})`)
  }
}

console.log("theme-contrast: ok")
