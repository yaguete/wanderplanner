import { collectCountryCodesFromHint, hasWordBoundaryMatch } from "@/lib/countries"
import { normalizeName } from "@/lib/trip-tasks"

/**
 * Destinos que no son un país ISO (o que el catálogo rechaza a propósito).
 * CCAA españolas: solo las que `circle-flags` dibuja; el resto de España → `es`.
 * Escocia → saltire (`gb-sct`). Granada no es GD (Grenada).
 */
const FLAG_OVERRIDES: { code: string; keys: readonly string[] }[] = [
  {
    code: "es-ct",
    keys: [
      "catalunya",
      "cataluna",
      "catalonia",
      "barcelona",
      "girona",
      "gerona",
      "tarragona",
      "lleida",
      "lerida",
      "costa brava",
    ],
  },
  {
    code: "es-ga",
    keys: [
      "galicia",
      "compostela",
      "santiago de compostela",
      "a coruna",
      "coruna",
      "vigo",
      "pontevedra",
      "ourense",
      "orense",
      "lugo",
    ],
  },
  {
    code: "es-pv",
    keys: [
      "euskadi",
      "pais vasco",
      "bilbao",
      "donostia",
      "san sebastian",
      "vitoria",
      "gasteiz",
      "vizcaya",
      "bizkaia",
      "guipuzcoa",
      "gipuzkoa",
      "alava",
      "araba",
    ],
  },
  {
    code: "es-vc",
    keys: [
      "valencia",
      "comunitat valenciana",
      "comunidad valenciana",
      "alicante",
      "castellon",
      "castello",
      "benidorm",
    ],
  },
  {
    code: "es-ib",
    keys: [
      "baleares",
      "balears",
      "mallorca",
      "menorca",
      "ibiza",
      "eivissa",
      "formentera",
      "palma de mallorca",
    ],
  },
  {
    code: "es-cn",
    keys: [
      "canarias",
      "tenerife",
      "gran canaria",
      "lanzarote",
      "fuerteventura",
      "las palmas",
      "la palma",
      "la gomera",
    ],
  },
  { code: "es-ar", keys: ["aragon", "zaragoza", "huesca", "teruel"] },
  { code: "us", keys: ["alaska", "denali"] },
  {
    code: "gb-sct",
    keys: ["escocia", "scotland", "highland", "edimburgo", "edinburgh", "glasgow"],
  },
  {
    code: "es",
    keys: [
      "andalucia",
      "sevilla",
      "malaga",
      "cordoba",
      "cadiz",
      "granada",
      "alhambra",
      "jaen",
      "huelva",
      "almeria",
      "madrid",
      "asturias",
      "oviedo",
      "gijon",
      "cantabria",
      "santander",
      "castilla y leon",
      "castilla la mancha",
      "toledo",
      "valladolid",
      "salamanca",
      "extremadura",
      "caceres",
      "badajoz",
      "murcia",
      "navarra",
      "pamplona",
      "rioja",
      "logrono",
    ],
  },
]

/** Código de `circle-flags` (`np`, `gb-sct`, `es-ct`). Nada de path traversal en el src. */
const FLAG_CODE_RE = /^[a-z]{2}(?:-[a-z]{2,4})?$/

function blobOf(name: string, area?: string | null): string {
  return normalizeName([name, area ?? ""].filter(Boolean).join(" "))
}

function overrideFlag(blob: string): string | null {
  if (!blob) return null
  for (const rule of FLAG_OVERRIDES) {
    for (const key of rule.keys) {
      if (hasWordBoundaryMatch(blob, key)) return rule.code
    }
  }
  return null
}

function firstIsoFromHint(hint: string | null | undefined): string | null {
  const code = collectCountryCodesFromHint(hint)[0]
  return code ? code.toLowerCase() : null
}

/**
 * Bandera del rail plegado. No usa `resolveTripCountryCodes`: esa función
 * escanea ítems/días y en el sidebar se pagaría en cada mutación.
 */
export function tripRailFlagCode(input: {
  name: string
  countries?: readonly string[]
  area?: string | null
}): string | null {
  const blob = blobOf(input.name, input.area)
  const overridden = overrideFlag(blob)
  if (overridden) return overridden

  for (const raw of input.countries ?? []) {
    const code = raw.trim().toLowerCase()
    if (FLAG_CODE_RE.test(code)) return code
  }

  return firstIsoFromHint(input.name) ?? firstIsoFromHint(input.area)
}

export function isTripRailFlagCode(code: string): boolean {
  return FLAG_CODE_RE.test(code)
}

export function tripRailFlagSrc(code: string): string | null {
  const normalized = code.trim().toLowerCase()
  if (!FLAG_CODE_RE.test(normalized)) return null
  return `/circle-flags/${normalized}.svg`
}

export function tripRailLetter(name: string): string {
  const ch = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .match(/[a-zA-Z0-9]/)
  return (ch?.[0] ?? "?").toUpperCase()
}
