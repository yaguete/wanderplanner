import { hasWordBoundaryMatch } from "@/lib/countries"
import { normalizeName } from "@/lib/trip-tasks"

/**
 * Pictograma del rail plegado (no la portada Unsplash).
 * No es un atlas: destino concreto > país con imagen fuerte > marca estable por id.
 * Las reglas van de más específicas a más genéricas; la primera gana.
 */
const RULES: { glyph: string; keys: readonly string[] }[] = [
  { glyph: "🏔️", keys: ["alaska", "denali", "pirineos", "alpes", "andes", "himalaya", "dolomitas", "patagonia"] },
  { glyph: "🏰", keys: ["escocia", "scotland", "highland", "edimburgo", "edinburgh", "glasgow"] },
  { glyph: "🕌", keys: ["granada", "alhambra"] },
  { glyph: "🌋", keys: ["islandia", "iceland", "reikiavik", "reykjavik"] },
  { glyph: "🌸", keys: ["japon", "japan", "tokio", "tokyo", "kioto", "kyoto", "osaka"] },
  { glyph: "🗼", keys: ["paris"] },
  { glyph: "🗽", keys: ["nueva york", "new york"] },
  { glyph: "🎡", keys: ["londres", "london"] },
  { glyph: "🛶", keys: ["venecia", "venice"] },
  { glyph: "🏛️", keys: ["roma", "rome", "atenas", "athens", "grecia", "greece"] },
  { glyph: "🦙", keys: ["peru", "machu", "cusco", "cuzco"] },
  { glyph: "🐘", keys: ["tailandia", "thailand", "bangkok"] },
  { glyph: "🦘", keys: ["australia", "sydney"] },
  { glyph: "🦁", keys: ["safari", "kenia", "kenya", "tanzania"] },
  { glyph: "🌴", keys: ["bali", "caribe", "cancun"] },
  { glyph: "🏝️", keys: ["maldivas", "maldives", "ibiza", "mallorca", "menorca", "canarias", "hawaii", "hawai"] },
  { glyph: "🏜️", keys: ["marruecos", "morocco", "marrakech", "desierto", "sahara"] },
  { glyph: "🌲", keys: ["noruega", "norway", "suecia", "sweden", "finlandia", "finland", "laponia"] },
  { glyph: "☘️", keys: ["irlanda", "ireland", "dublin"] },
  { glyph: "🍋", keys: ["amalfi", "sicilia", "sicily", "capri"] },
  { glyph: "🌌", keys: ["aurora"] },
  { glyph: "🏖️", keys: ["playa"] },
  { glyph: "🎄", keys: ["navidad", "christmas"] },
]

/** Solo países con un pictograma inequívoco. ES/US/FR/IT/GB no: demasiados viajes distintos. */
const COUNTRY_GLYPHS: Record<string, string> = {
  IS: "🌋",
  JP: "🌸",
  EG: "🌅",
  TH: "🐘",
  KE: "🦁",
  TZ: "🦁",
  AU: "🦘",
  NZ: "🥝",
  PE: "🦙",
  IE: "☘️",
  GR: "🏛️",
  MA: "🏜️",
  ID: "🌴",
  MV: "🏝️",
}

const FALLBACK_GLYPHS = [
  "🗺️",
  "🧳",
  "⛺️",
  "🌄",
  "🌊",
  "🚂",
  "🚲",
  "🎒",
  "⛲️",
  "🌉",
  "🌙",
  "🌻",
] as const

function hashString(value: string): number {
  let hash = 5381
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i)
  }
  return hash >>> 0
}

function glyphFromText(text: string): string | null {
  if (!text) return null
  for (const rule of RULES) {
    for (const key of rule.keys) {
      if (hasWordBoundaryMatch(text, key)) return rule.glyph
    }
  }
  return null
}

export function tripRailGlyph(input: {
  name: string
  countries?: readonly string[]
  area?: string | null
  id?: string
}): string {
  const blob = normalizeName([input.name, input.area ?? ""].filter(Boolean).join(" "))
  const fromText = glyphFromText(blob)
  if (fromText) return fromText

  for (const code of input.countries ?? []) {
    const glyph = COUNTRY_GLYPHS[code.toUpperCase()]
    if (glyph) return glyph
  }

  const seed = input.id || blob || "viaje"
  return FALLBACK_GLYPHS[hashString(seed) % FALLBACK_GLYPHS.length]
}
