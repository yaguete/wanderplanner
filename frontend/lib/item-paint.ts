export type PaintTheme = "light" | "dark"

type ItemPaint = {
  light: string
  dark: string
  borderLight: string
  borderDark: string
  textClass: string
  dotClass: string
}

/**
 * Única tabla de color de categoría. Tailwind usa las clases; Mapbox/SVG los hex.
 * `-600` en claro, `-400` en oscuro (contraste 6.4–9.1 sobre tarjeta oscura).
 */
export const ITEM_TYPE_PAINT: Record<"transport" | "stay" | "food" | "activity", ItemPaint> = {
  transport: {
    light: "#0284c7",
    dark: "#38bdf8",
    borderLight: "#0369a1",
    borderDark: "#0284c7",
    textClass: "text-sky-600 dark:text-sky-400",
    dotClass: "bg-sky-600 dark:bg-sky-400",
  },
  stay: {
    light: "#ea580c",
    dark: "#fb923c",
    borderLight: "#c2410c",
    borderDark: "#ea580c",
    textClass: "text-orange-600 dark:text-orange-400",
    dotClass: "bg-orange-600 dark:bg-orange-400",
  },
  food: {
    light: "#059669",
    dark: "#34d399",
    borderLight: "#047857",
    borderDark: "#059669",
    textClass: "text-emerald-600 dark:text-emerald-400",
    dotClass: "bg-emerald-600 dark:bg-emerald-400",
  },
  activity: {
    light: "#7c3aed",
    dark: "#a78bfa",
    borderLight: "#5b21b6",
    borderDark: "#7c3aed",
    textClass: "text-violet-600 dark:text-violet-400",
    dotClass: "bg-violet-600 dark:bg-violet-400",
  },
}

const ENDPOINT_PAINT = {
  light: "#64748b",
  dark: "#94a3b8",
  borderLight: "#334155",
  borderDark: "#64748b",
} as const

export function resolveItemFill(
  type: keyof typeof ITEM_TYPE_PAINT,
  theme: PaintTheme,
): string {
  return ITEM_TYPE_PAINT[type][theme]
}

export function pinPaint(
  type: "stay" | "activity" | "food" | "hub" | "endpoint",
  theme: PaintTheme,
): { fill: string; border: string } {
  if (type === "endpoint") {
    return {
      fill: ENDPOINT_PAINT[theme],
      border: theme === "dark" ? ENDPOINT_PAINT.borderDark : ENDPOINT_PAINT.borderLight,
    }
  }
  const key = type === "hub" ? "transport" : type
  const row = ITEM_TYPE_PAINT[key]
  return {
    fill: row[theme],
    border: theme === "dark" ? row.borderDark : row.borderLight,
  }
}

export const PLACES_ROUTE_PAINT = {
  light: "#171717",
  dark: "#e7e5e4",
} as const

export const PLACES_LONG_HOP_PAINT = {
  light: "#94a3b8",
  dark: "#64748b",
} as const

/** Conservado: tests y callers que no pasan tema (equivale a claro). */
export const PLACES_ROUTE_COLOR = PLACES_ROUTE_PAINT.light
export const PLACES_LONG_HOP_COLOR = PLACES_LONG_HOP_PAINT.light

export function placesRouteColor(theme: PaintTheme): string {
  return PLACES_ROUTE_PAINT[theme]
}

export function placesLongHopColor(theme: PaintTheme): string {
  return PLACES_LONG_HOP_PAINT[theme]
}

const MODE_LINE: Record<
  string,
  { light: string; dark: string; dashArray: number[] | null; width: number }
> = {
  flight: { light: "#0ea5e9", dark: "#38bdf8", dashArray: [2, 2], width: 2.5 },
  train: { light: "#7c3aed", dark: "#a78bfa", dashArray: [4, 2], width: 2.5 },
  bus: { light: "#ea580c", dark: "#fb923c", dashArray: [1.5, 1.5], width: 2 },
  ferry: { light: "#2563eb", dark: "#60a5fa", dashArray: [3, 2], width: 2.5 },
  car: { light: "#475569", dark: "#94a3b8", dashArray: null, width: 2.5 },
  other: { light: "#a16207", dark: "#fbbf24", dashArray: [2, 3], width: 2 },
  undecided: { light: "#94a3b8", dark: "#cbd5e1", dashArray: [1, 2], width: 2 },
}

export function modeLineColor(mode: string | null | undefined, theme: PaintTheme): string {
  const row = MODE_LINE[mode ?? "undecided"] ?? MODE_LINE.undecided
  return row[theme]
}

export function modeLineStyle(
  mode: string | null | undefined,
  theme: PaintTheme = "light",
): { color: string; dashArray: number[] | null; width: number } {
  const row = MODE_LINE[mode ?? "undecided"] ?? MODE_LINE.undecided
  return { color: row[theme], dashArray: row.dashArray, width: row.width }
}

export const MAP_STYLE_URL = {
  light: "mapbox://styles/mapbox/streets-v12",
  dark: "mapbox://styles/mapbox/navigation-night-v1",
} as const
