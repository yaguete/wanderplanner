/**
 * Agujas para buscar un ítem de la Ruta en la Crónica.
 * La extracción a veces antepone un clasificador («Lago Hallstätter See»)
 * que el artículo no usa («Hallstätter See»). Puro: sin I/O.
 */
import { foldForSearch } from "./text-highlight"

/** Más largos primero: «parque nacional» antes que «parque». */
const TYPE_PREFIXES = [
  "parque nacional",
  "parque natural",
  "reserva natural",
  "sitio arqueologico",
  "conjunto historico",
  "casa rural",
  "palacio real",
  "archipielago",
  "monasterio",
  "restaurante",
  "apartamentos",
  "apartamento",
  "universidad",
  "ayuntamiento",
  "teleferico",
  "funicular",
  "balneario",
  "cerveceria",
  "trattoria",
  "brasserie",
  "catedral",
  "basilica",
  "santuario",
  "fortaleza",
  "acueducto",
  "auditorio",
  "biblioteca",
  "aeropuerto",
  "peninsula",
  "desfiladero",
  "embalse",
  "cascada",
  "catarata",
  "glaciar",
  "volcan",
  "desierto",
  "albergue",
  "camping",
  "parador",
  "hostal",
  "hostel",
  "pension",
  "hotel",
  "resort",
  "termas",
  "asador",
  "taberna",
  "osteria",
  "bodega",
  "meson",
  "iglesia",
  "ermita",
  "convento",
  "abadia",
  "mezquita",
  "sinagoga",
  "pagoda",
  "castillo",
  "palacio",
  "alcazar",
  "muralla",
  "galeria",
  "museo",
  "teatro",
  "opera",
  "acuario",
  "zoologico",
  "mercado",
  "estadio",
  "estacion",
  "puerto",
  "mirador",
  "puente",
  "plaza",
  "paseo",
  "jardin",
  "jardines",
  "bosque",
  "selva",
  "parque",
  "reserva",
  "templo",
  "torre",
  "faro",
  "laguna",
  "pantano",
  "lago",
  "playa",
  "cala",
  "monte",
  "montana",
  "sierra",
  "valle",
  "canon",
  "garganta",
  "cueva",
  "cuevas",
  "gruta",
  "cenote",
  "isla",
  "islas",
  "bahia",
  "golfo",
  "fiordo",
  "pueblo",
  "ciudad",
  "villa",
  "spa",
  "riad",
  "ryokan",
  "zoo",
  "rio",
  "ria",
  "pico",
  "cabo",
  "lake",
  "river",
  "beach",
  "mountain",
  "island",
  "islands",
  "museum",
  "castle",
  "palace",
  "church",
  "cathedral",
  "bridge",
  "square",
  "garden",
  "forest",
  "temple",
  "fortress",
  "waterfall",
  "cave",
  "caves",
  "valley",
  "viewpoint",
  "restaurant",
  "park",
  "bay",
  "cape",
  "peak",
]
  .map((p) => foldForSearch(p).folded)
  .sort((a, b) => b.length - a.length || a.localeCompare(b))

const ARTICLES = ["unos", "unas", "los", "las", "una", "the", "el", "la", "un", "le", "les"].map(
  (w) => foldForSearch(w).folded,
)

const LINKERS = ["de las", "de los", "de la", "del", "von", "van", "de", "di", "du", "of"].map(
  (w) => foldForSearch(w).folded,
)

function skipWs(folded: string, i: number): number {
  while (i < folded.length && folded[i] === " ") i++
  return i
}

function isBoundaryAfter(folded: string, end: number): boolean {
  if (end >= folded.length) return true
  return /[\s.,;:!?()[\]«»"'“”‘’–—-]/.test(folded[end]!)
}

/** Match de token(es) en `i` con frontera detrás. Devuelve el índice posterior o null. */
function matchAt(folded: string, i: number, token: string): number | null {
  if (!folded.startsWith(token, i)) return null
  const end = i + token.length
  if (!isBoundaryAfter(folded, end)) return null
  return end
}

function matchFirst(folded: string, i: number, tokens: string[]): number | null {
  for (const token of tokens) {
    const end = matchAt(folded, i, token)
    if (end != null) return end
  }
  return null
}

function isGoodRemainder(text: string): boolean {
  if (text.length < 4) return false
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) return true
  return (tokens[0]?.length ?? 0) >= 6
}

/** Recorte de clasificador inicial; null si no aplica o el resto es demasiado corto. */
export function stripLeadingTypePrefix(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const hay = foldForSearch(trimmed)
  let i = skipWs(hay.folded, 0)

  const articleEnd = matchFirst(hay.folded, i, ARTICLES)
  if (articleEnd != null) i = skipWs(hay.folded, articleEnd)

  const prefixEnd = matchFirst(hay.folded, i, TYPE_PREFIXES)
  if (prefixEnd == null) return null
  i = skipWs(hay.folded, prefixEnd)

  const linkerEnd = matchFirst(hay.folded, i, LINKERS)
  if (linkerEnd != null) i = skipWs(hay.folded, linkerEnd)

  if (i >= hay.folded.length) return null
  const origStart = hay.map[i]
  if (origStart == null) return null
  const remainder = trimmed.slice(origStart).trim()
  if (!isGoodRemainder(remainder)) return null
  return remainder
}

/**
 * Agujas a probar en orden: el nombre entero y, si hay clasificador,
 * el nombre propio. El consumidor para en la primera que tenga hits.
 */
export function chronicleSearchNeedles(name: string): string[] {
  const full = name.trim().replace(/\s+/g, " ")
  if (!full) return []
  const stripped = stripLeadingTypePrefix(full)
  if (stripped && stripped !== full) return [full, stripped]
  return [full]
}
