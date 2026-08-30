/**
 * Inventario de datos que las tools MCP pueden devolver. La tabla de
 * `/legal/privacidad#asistentes` se pinta desde aquí; el test comprueba que
 * cada path de los `outputSchema` reales tiene categoría. Añadir un campo al
 * schema sin mapearlo rompe CI (causa nº 3 de rechazo del directorio).
 */
import { z } from "zod"
import { getCountryTasksOutput } from "./get-country-tasks"
import { getTripOutput } from "./get-trip"
import { getTripBudgetOutput } from "./get-trip-budget"
import { listTripSourcesOutput } from "./list-trip-sources"
import { listTripsOutput } from "./list-trips"
import { reviewTripOutput } from "./review-trip"
import { searchSourcesToolOutput } from "./search-layers"

export const MCP_PRIVACY_TOOLS = [
  { name: "list_trips", schema: listTripsOutput },
  { name: "get_trip", schema: getTripOutput },
  { name: "list_trip_sources", schema: listTripSourcesOutput },
  { name: "review_trip", schema: reviewTripOutput },
  { name: "search_sources", schema: searchSourcesToolOutput },
  { name: "get_trip_budget", schema: getTripBudgetOutput },
  { name: "get_country_tasks", schema: getCountryTasksOutput },
] as const

export type McpPrivacyToolName = (typeof MCP_PRIVACY_TOOLS)[number]["name"]

export const MCP_PRIVACY_CATEGORY_IDS = [
  "tripList",
  "tripHeader",
  "tripDaysItems",
  "tripTasks",
  "tripSources",
  "searchAndSuggest",
  "reviewAudit",
  "budget",
  "countryTasks",
] as const

export type McpPrivacyCategoryId = (typeof MCP_PRIVACY_CATEGORY_IDS)[number]

export type McpPrivacyCategory = {
  id: McpPrivacyCategoryId
  label: string
  detail: string
}

/** Filas de la tabla legal: copy en español, no nombres de campo JSON. */
export const MCP_PRIVACY_CATEGORIES: readonly McpPrivacyCategory[] = [
  {
    id: "tripList",
    label: "Tus viajes (listado)",
    detail:
      "Identificador, nombre, fechas, duración, países y si está archivado.",
  },
  {
    id: "tripHeader",
    label: "Cabecera del plan",
    detail:
      "Expectativas, origen (sin coordenadas), número de viajeros, divisa, techo de presupuesto, básicos, tareas sueltas, trámites que has descartado, recuento de reservas y el enlace al viaje en WanderPlanner.",
  },
  {
    id: "tripDaysItems",
    label: "Días e ítems",
    detail:
      "Tipo, nombre, detalle, región, cuántos días cubre, tramos (origen, destino y medio, sin coordenadas), autor y artículo de la fuente, un extracto breve y, si está activo, el enlace de reserva del autor.",
  },
  {
    id: "tripTasks",
    label: "Tareas y costes",
    detail: "El estado de cada reserva y los importes que tú has puesto.",
  },
  {
    id: "tripSources",
    label: "Artículos guardados",
    detail: "Título, autor, dirección, zona y duración que declara la guía.",
  },
  {
    id: "searchAndSuggest",
    label: "Búsqueda en tus fuentes y sugerencias",
    detail:
      "Sitios de tus artículos (con cita), sugerencias de otros artículos si los tuyos no cubren la pregunta, y el perfil de viajero (tipos, notas y dominios que te gustan).",
  },
  {
    id: "reviewAudit",
    label: "Auditoría del viaje",
    detail:
      "Comprobaciones automáticas (días vacíos, huecos de alojamiento, cobertura del presupuesto, tramos de ida y vuelta) y la evidencia de las fuentes.",
  },
  {
    id: "budget",
    label: "Presupuesto",
    detail:
      "Importes que has apuntado, cobertura, veredicto respecto al techo y desglose por categoría.",
  },
  {
    id: "countryTasks",
    label: "Trámites de país",
    detail:
      "Códigos de país, sugerencias (papeles y salud), la fuente oficial y si las has aceptado o descartado.",
  },
]

/**
 * Lo que el token OAuth puede entregar. No sale de ningún `outputSchema`:
 * el cliente lo pide en los scopes y el asistente puede consultarlo en el
 * endpoint de identidad, aunque las tools de lectura no lo devuelvan.
 */
export const OAUTH_PRIVACY_ROWS = [
  {
    label: "Tu identidad de cuenta",
    detail:
      "Correo, nombre y foto de perfil. El teléfono solo si lo tienes en la cuenta; hoy no lo pedimos al registrarte y no lo usamos.",
  },
] as const

type PrefixRule = {
  tool: McpPrivacyToolName
  prefix: string
  category: McpPrivacyCategoryId
}

/**
 * Prefijo más específico primero. `prefix: ""` es el resto de esa tool.
 * `days` cubre `days[]…`; `tasks` cubre el mapa de costes del detalle.
 */
const PATH_RULES: readonly PrefixRule[] = [
  { tool: "list_trips", prefix: "", category: "tripList" },
  { tool: "get_trip", prefix: "days", category: "tripDaysItems" },
  { tool: "get_trip", prefix: "tasks", category: "tripTasks" },
  { tool: "get_trip", prefix: "", category: "tripHeader" },
  { tool: "list_trip_sources", prefix: "", category: "tripSources" },
  { tool: "review_trip", prefix: "checks", category: "reviewAudit" },
  { tool: "review_trip", prefix: "evidence", category: "searchAndSuggest" },
  { tool: "review_trip", prefix: "", category: "tripHeader" },
  { tool: "search_sources", prefix: "", category: "searchAndSuggest" },
  { tool: "get_trip_budget", prefix: "", category: "budget" },
  { tool: "get_country_tasks", prefix: "", category: "countryTasks" },
]

type JsonSchema = {
  type?: unknown
  properties?: Record<string, JsonSchema>
  items?: JsonSchema | JsonSchema[]
  additionalProperties?: JsonSchema | boolean
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  allOf?: JsonSchema[]
  $ref?: string
  $defs?: Record<string, JsonSchema>
  definitions?: Record<string, JsonSchema>
}

function asSchema(raw: unknown): JsonSchema | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  return raw as JsonSchema
}

function isNullOnly(schema: JsonSchema): boolean {
  return schema.type === "null"
}

function defKey(ref: string): string | null {
  const m = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/)
  return m ? m[1] : null
}

function matchesPrefix(path: string, prefix: string): boolean {
  if (prefix === "") return true
  return path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)
}

function walk(
  schema: JsonSchema,
  prefix: string,
  defs: Record<string, JsonSchema>,
  out: Set<string>,
  stack: Set<string>,
): void {
  if (schema.$ref) {
    const key = defKey(schema.$ref)
    const marker = `${schema.$ref}@${prefix}`
    if (!key || stack.has(marker)) return
    const target = defs[key]
    if (!target) return
    stack.add(marker)
    walk(target, prefix, defs, out, stack)
    stack.delete(marker)
    return
  }

  const alts = schema.anyOf ?? schema.oneOf
  if (alts && alts.length > 0) {
    for (const branch of alts) {
      if (isNullOnly(branch)) continue
      walk(branch, prefix, defs, out, stack)
    }
    return
  }

  if (schema.allOf && schema.allOf.length > 0) {
    for (const branch of schema.allOf) walk(branch, prefix, defs, out, stack)
    return
  }

  let branched = false
  if (schema.properties) {
    branched = true
    for (const [key, child] of Object.entries(schema.properties)) {
      const next = prefix ? `${prefix}.${key}` : key
      walk(child, next, defs, out, stack)
    }
  }

  if (schema.items && !Array.isArray(schema.items)) {
    branched = true
    walk(schema.items, `${prefix}[]`, defs, out, stack)
  }

  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    branched = true
    const next = prefix ? `${prefix}.*` : "*"
    walk(schema.additionalProperties, next, defs, out, stack)
  }

  if (!branched && prefix) out.add(prefix)
}

export function flattenJsonSchema(root: unknown): string[] {
  const schema = asSchema(root)
  if (!schema) return []
  const defs = { ...(schema.$defs ?? {}), ...(schema.definitions ?? {}) }
  const out = new Set<string>()
  walk(schema, "", defs, out, new Set())
  return [...out].sort()
}

export function jsonSchemaOf(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema, { reused: "inline" })
}

export type McpSchemaPath = {
  tool: McpPrivacyToolName
  path: string
}

export function collectMcpSchemaPaths(): McpSchemaPath[] {
  const rows: McpSchemaPath[] = []
  for (const tool of MCP_PRIVACY_TOOLS) {
    for (const path of flattenJsonSchema(jsonSchemaOf(tool.schema))) {
      rows.push({ tool: tool.name, path })
    }
  }
  return rows
}

export function collectJsonSchemaPropertyKeys(root: unknown): string[] {
  const schema = asSchema(root)
  if (!schema) return []
  const defs = { ...(schema.$defs ?? {}), ...(schema.definitions ?? {}) }
  const keys = new Set<string>()
  const stack = new Set<string>()

  function visit(node: JsonSchema): void {
    if (node.$ref) {
      const key = defKey(node.$ref)
      if (!key || stack.has(node.$ref)) return
      const target = defs[key]
      if (!target) return
      stack.add(node.$ref)
      visit(target)
      stack.delete(node.$ref)
      return
    }
    if (node.properties) {
      for (const [key, child] of Object.entries(node.properties)) {
        keys.add(key)
        visit(child)
      }
    }
    for (const branch of [...(node.anyOf ?? []), ...(node.oneOf ?? []), ...(node.allOf ?? [])]) {
      visit(branch)
    }
    if (node.items && !Array.isArray(node.items)) visit(node.items)
    if (node.additionalProperties && typeof node.additionalProperties === "object") {
      visit(node.additionalProperties)
    }
  }

  visit(schema)
  return [...keys].sort()
}

export function categoryForPath(tool: McpPrivacyToolName, path: string): McpPrivacyCategoryId {
  const match = PATH_RULES.find((rule) => rule.tool === tool && matchesPrefix(path, rule.prefix))
  if (!match) {
    throw new Error(`Sin categoría de privacidad para ${tool}.${path}`)
  }
  return match.category
}

export function mcpPrivacyTableRows(): readonly (readonly [string, string])[] {
  return [
    ...OAUTH_PRIVACY_ROWS.map((row) => [row.label, row.detail] as const),
    ...MCP_PRIVACY_CATEGORIES.map((row) => [row.label, row.detail] as const),
  ]
}
