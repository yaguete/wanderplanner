/**
 * Snippets de arranque del asistente, adaptados al destino del viaje.
 * Deterministas (sin LLM): mismas entradas → mismas sugerencias.
 */
import type { Source, Trip } from "@/types/itinerary"
import { getCountryByCode, resolveTripCountryCodes } from "@/lib/countries"

const FALLBACK = [
  "¿Necesito visado para este viaje?",
  "¿Qué me falta para completar el plan?",
  "Sugiéreme otra fuente útil",
] as const

function joinEs(names: string[]): string {
  if (names.length === 0) return ""
  if (names.length === 1) return names[0]!
  if (names.length === 2) return `${names[0]} y ${names[1]}`
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`
}

function areaHead(area: string): string | null {
  const head = area.split(",")[0]!.trim()
  if (head.length < 2 || head.length > 40) return null
  return head
}

/** «austria» → «Austria»; respeta mayúsculas ya presentes («La Alpujarra»). */
function displayDest(label: string): string {
  if (label === label.toLowerCase()) {
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  return label
}

function uniqueAreaHeads(sources: Pick<Source, "area">[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of sources) {
    const raw = s.area?.trim()
    if (!raw) continue
    const head = areaHead(raw)
    if (!head) continue
    const key = head.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(head)
  }
  return out
}

function countryNamesFor(
  trip: Pick<Trip, "name" | "countries" | "days">,
  sources: Pick<Source, "area" | "items">[],
): string[] {
  const codes = resolveTripCountryCodes(trip, sources)
  if (codes.length < 1 || codes.length > 2) return []
  return codes
    .map((c) => getCountryByCode(c)?.name)
    .filter((n): n is string => Boolean(n))
}

/**
 * Destino para copy de UI cuando hay que estar seguros (p. ej. el canvas vacío).
 * Prioriza el área de la fuente (ciudad/región) sobre el país; no usa el nombre
 * del viaje salvo que resuelva a 1–2 países. `null` si no hay pista clara.
 */
export function confidentTripDestinationLabel(
  trip: Pick<Trip, "name" | "countries" | "days">,
  sources: Pick<Source, "area" | "items">[] = [],
): string | null {
  const countryNames = countryNamesFor(trip, sources)
  const countryKeys = new Set(countryNames.map((n) => n.toLowerCase()))
  const heads = uniqueAreaHeads(sources).filter(
    (head) => !countryKeys.has(head.toLowerCase()),
  )

  if (heads.length === 1) return displayDest(heads[0]!)
  if (heads.length === 2) return joinEs(heads.map(displayDest))

  if (countryNames.length) return joinEs(countryNames)
  return null
}

/** Etiqueta corta del destino para meter en preguntas (sin emoji). */
export function tripDestinationLabel(
  trip: Pick<Trip, "name" | "countries" | "days">,
  sources: Pick<Source, "area" | "items">[] = [],
): string | null {
  const codes = resolveTripCountryCodes(trip, sources)
  if (codes.length >= 1 && codes.length <= 2) {
    const names = codes
      .map((c) => getCountryByCode(c)?.name)
      .filter((n): n is string => Boolean(n))
    if (names.length) return joinEs(names)
  }

  const area = sources.map((s) => s.area?.trim()).find(Boolean)
  if (area) {
    const head = area.split(",")[0]!.trim()
    if (head.length >= 2 && head.length <= 40) return head
  }

  const name = trip.name.trim()
  if (name && !/^viaje\b/i.test(name) && name.length <= 40) return name
  return null
}

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/** Tiempo si hay fechas; si no, packing list (con país cuando se conoce). */
function utilitySnippet(hasDates: boolean, dest: string | null): string {
  if (hasDates) return "¿Qué tiempo crees que hará en las fechas de mi viaje?"
  return dest
    ? `¿Qué no puede faltar en mi mochila de viaje a ${dest}?`
    : "¿Qué no puede faltar en mi mochila de viaje?"
}

function filterUsed(prompts: string[], usedPrompts: readonly string[]): string[] {
  const used = new Set(usedPrompts.map((s) => s.trim()).filter(Boolean))
  return prompts.filter((s) => !used.has(s))
}

export type AssistantSuggestionOptions = {
  usedPrompts?: readonly string[]
}

function genericSuggestions(trip: Trip, sources: Source[]): string[] {
  const dest = tripDestinationLabel(trip, sources)
  const codes = resolveTripCountryCodes(trip, sources)
  const onlySpain = codes.length > 0 && codes.every((c) => c === "ES")
  const hasSources = sources.length > 0
  const seed = hashSeed(dest ?? trip.name ?? trip.id)
  const utility = utilitySnippet(Boolean(trip.startDate), dest)

  const first = onlySpain
    ? dest
      ? `¿Qué zonas no me puedo perder en ${dest}?`
      : "¿Qué zonas no me puedo perder?"
    : dest
      ? `¿Necesito visado para ${dest}?`
      : "¿Necesito visado para este viaje?"

  const flavours = dest
    ? [
        `¿Cuál es la mejor época para ir a ${dest}?`,
        `¿Cómo me muevo mejor por ${dest}?`,
        `¿Qué platos típicos no me puedo perder en ${dest}?`,
        `¿Cuánto presupuesto diario necesito en ${dest}?`,
        `¿Hay vacunas o trámites de salud para ${dest}?`,
        "¿Hay algo de mi plan que cierre el día que voy?",
        "¿Mi plan va bien para ir con niños?",
        hasSources
          ? `Sugiéreme otra fuente útil sobre ${dest}`
          : `Sugiéreme una buena fuente sobre ${dest}`,
        "¿Qué me falta para completar el plan?",
      ]
    : [
        "¿Cuál es la mejor época para viajar?",
        "¿Cómo me muevo mejor por el destino?",
        "¿Qué platos típicos no me puedo perder?",
        "¿Cuánto presupuesto diario necesito?",
        "¿Hay vacunas o trámites de salud?",
        "¿Hay algo de mi plan que cierre el día que voy?",
        "¿Mi plan va bien para ir con niños?",
        hasSources ? "Sugiéreme otra fuente útil" : "Sugiéreme una buena fuente de inspiración",
        "¿Qué me falta para completar el plan?",
      ]

  const a = flavours[seed % flavours.length]!
  const third = [a, flavours[(seed + 3) % flavours.length]!, flavours[(seed + 1) % flavours.length]!]
    .find((s) => s !== first && s !== utility) ?? FALLBACK[2]

  return [first, utility, third]
}

/**
 * Hasta 3 sugerencias de arranque (chat vacío): visado / tiempo / presupuesto…
 * Las de auditoría (huecos, ritmo, clima) las propone el modelo en followups.
 */
export function buildAssistantSuggestions(
  trip: Trip | null | undefined,
  sources: Source[] = [],
  options: AssistantSuggestionOptions = {},
): string[] {
  const used = options.usedPrompts ?? []
  if (!trip) return filterUsed([...FALLBACK], used)
  return filterUsed(genericSuggestions(trip, sources), used).slice(0, 3)
}
