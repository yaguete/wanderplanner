import { z } from "zod"
import { sanitizeAffiliateUrl } from "@/lib/affiliate-url"
import { stripHtml } from "@/lib/blog-wp-search"
import { chronicleSearchNeedles } from "@/lib/chronicle-search"
import { parseSpanDays, unionStayDayIndexes } from "@/lib/item-span"
import { findMatchRanges } from "@/lib/text-highlight"
import { normalizeName } from "@/lib/trip-tasks"
import type { BasicCategory, ItemType } from "@/types/itinerary"

export const MCP_SEARCH_SOURCES_TRIP_COLUMNS =
  "id, name, countries, expectations, source_ids, days, basics" as const
export const MCP_SEARCH_SOURCE_COLUMNS = "id, url, author, title, area, items, basics" as const

export const SEARCH_MAX_RESULTS = 15
export const SEARCH_QUOTE_MAX = 240
export const SEARCH_HTML_SOURCES_MAX = 3
/** Tope sobre `html.length` (unidades UTF-16), no bytes UTF-8. */
export const SEARCH_HTML_MAX_CHARS = 400 * 1024
export const SEARCH_HTML_TIMEOUT_MS = 3_000

const ITEM_TYPES = new Set<ItemType>(["stay", "activity", "food", "transport"])
const BASIC_CATEGORIES = new Set<BasicCategory>([
  "insurance",
  "sim",
  "carRental",
  "flight",
  "other",
])
const STOPWORDS = new Set([
  "de",
  "en",
  "la",
  "el",
  "the",
  "a",
  "of",
  "in",
  "un",
  "una",
  "los",
  "las",
  "del",
  "y",
  "and",
  "or",
  "para",
  "con",
  "por",
])

export const searchSourcesInput = z.object({
  tripId: z.string().uuid(),
  query: z.string().trim().min(1).max(200),
  type: z.enum(["stay", "activity", "food", "transport", "basic"]).optional(),
})

export const searchSourcesOutput = z.object({
  results: z.array(
    z.object({
      kind: z.enum(["item", "basic"]),
      name: z.string(),
      type: z.string(),
      days: z.array(z.number()),
      consolidated: z.boolean(),
      sourceId: z.string(),
      sourceAuthor: z.string(),
      sourceTitle: z.string(),
      affiliateUrl: z.string().nullable(),
      quote: z.string().nullable(),
    }),
  ),
})

export type SearchSourcesResult = z.infer<typeof searchSourcesOutput>
export type SearchHit = SearchSourcesResult["results"][number]

export type SearchSourceRow = {
  id: string
  url?: string | null
  author: string | null
  title: string | null
  area: string | null
  items: unknown
  basics: unknown
}

export type SearchTripRow = {
  id: string
  name?: string | null
  countries?: unknown
  expectations?: unknown
  source_ids: unknown
  days: unknown
  basics: unknown
}

function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function asTrimmed(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const t = raw.trim()
  return t.length > 0 ? t : null
}

function queryTokens(query: string): string[] {
  return normalizeName(query)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
}

function haystackOf(...parts: Array<string | null | undefined>): string {
  return normalizeName(parts.filter(Boolean).join(" "))
}

function scoreMatch(query: string, hay: string, name: string): number {
  const q = normalizeName(query)
  if (!q || !hay) return 0
  const n = normalizeName(name)
  if (n === q) return 100
  if (n.includes(q)) return 80
  if (hay.includes(q)) return 55
  const tokens = queryTokens(query)
  if (tokens.length === 0) return n.includes(q) || hay.includes(q) ? 40 : 0
  const hits = tokens.filter((t) => hay.includes(t) || n.includes(t))
  if (hits.length === 0) return 0
  if (hits.length === tokens.length) return 40 + hits.length
  return hits.length >= Math.ceil(tokens.length / 2) ? 20 + hits.length : 0
}

type DayItemRef = {
  sourceItemId: string
  dayIndex: number
  spanDays: number | undefined
}

function collectDayItemRefs(daysRaw: unknown): DayItemRef[] {
  if (!Array.isArray(daysRaw)) return []
  const refs: DayItemRef[] = []
  for (let i = 0; i < daysRaw.length; i++) {
    const day = asObject(daysRaw[i])
    const items = Array.isArray(day?.items) ? day.items : []
    for (const it of items) {
      const obj = asObject(it)
      if (!obj) continue
      const sourceItemId = typeof obj.sourceItemId === "string" ? obj.sourceItemId : ""
      if (!sourceItemId) continue
      refs.push({
        sourceItemId,
        dayIndex: i,
        spanDays: parseSpanDays(obj.spanDays),
      })
    }
  }
  return refs
}

function collectBasicIds(basicsRaw: unknown): Set<string> {
  const ids = new Set<string>()
  if (!Array.isArray(basicsRaw)) return ids
  for (const b of basicsRaw) {
    const obj = asObject(b)
    const id = typeof obj?.sourceBasicItemId === "string" ? obj.sourceBasicItemId : ""
    if (id) ids.add(id)
  }
  return ids
}

function daysForSourceItem(refs: DayItemRef[], sourceItemId: string, numDays: number): number[] {
  const matches = refs.filter((r) => r.sourceItemId === sourceItemId)
  if (matches.length === 0) return []
  const indexes = matches.map((r) => r.dayIndex)
  const anchor = indexes[0]!
  const span = matches[0]?.spanDays
  return unionStayDayIndexes(indexes, anchor, span, numDays).map((i) => i + 1)
}

/** Recorte a `max` alrededor del primer match, con elipsis si se corta. */
export function clipQuoteAround(text: string, start: number, end: number, max: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim()
  if (!cleaned) return ""
  if (cleaned.length <= max) return cleaned
  const orig = text.replace(/\s+/g, " ")
  const fromMatch = Math.max(0, Math.min(start, orig.length))
  const toMatch = Math.max(fromMatch, Math.min(end, orig.length))
  const matchLen = Math.max(1, toMatch - fromMatch)
  const pad = Math.max(0, Math.floor((max - Math.min(matchLen, max)) / 2))
  let from = Math.max(0, fromMatch - pad)
  let to = Math.min(orig.length, from + max)
  if (to - from < max) from = Math.max(0, to - max)
  if (from > 0) {
    const space = orig.indexOf(" ", from)
    if (space !== -1 && space < fromMatch) from = space + 1
  }
  if (to < orig.length) {
    const space = orig.lastIndexOf(" ", to)
    if (space > fromMatch) to = space
  }
  let slice = orig.slice(from, to).trim()
  if (from > 0) slice = `…${slice}`
  if (to < orig.length) slice = `${slice}…`
  if (slice.length > max) {
    slice = slice.slice(0, max - 1).trimEnd() + "…"
  }
  return slice
}

export function quoteFromArticle(html: string, name: string, max = SEARCH_QUOTE_MAX): string | null {
  if (!html || html.length > SEARCH_HTML_MAX_CHARS) return null
  const plain = stripHtml(html)
  if (!plain) return null
  for (const needle of chronicleSearchNeedles(name)) {
    const ranges = findMatchRanges(plain, needle, 1)
    const range = ranges[0]
    if (!range) continue
    const quote = clipQuoteAround(plain, range.start, range.end, max)
    return quote || null
  }
  return null
}

export function pickQuoteSourceIds(hits: readonly SearchHit[], max = SEARCH_HTML_SOURCES_MAX): string[] {
  const counts = new Map<string, number>()
  for (const hit of hits) {
    counts.set(hit.sourceId, (counts.get(hit.sourceId) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([id]) => id)
}

export async function attachSearchQuotes(
  hits: SearchHit[],
  fetchHtml: (sourceId: string, signal?: AbortSignal) => Promise<string>,
  options?: { timeoutMs?: number; maxChars?: number },
): Promise<SearchHit[]> {
  if (hits.length === 0) return hits
  const timeoutMs = options?.timeoutMs ?? SEARCH_HTML_TIMEOUT_MS
  const maxChars = options?.maxChars ?? SEARCH_HTML_MAX_CHARS
  const sourceIds = pickQuoteSourceIds(hits)
  const htmlBySource = new Map<string, string>()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const work = Promise.allSettled(
      sourceIds.map(async (id) => {
        try {
          const html = await fetchHtml(id, controller.signal)
          if (controller.signal.aborted) return
          if (html && html.length <= maxChars) htmlBySource.set(id, html)
        } catch {
          // Fail-open: sin cita si el fetch aborta o revienta.
        }
      }),
    )
    await Promise.race([
      work,
      new Promise<void>((resolve) => {
        if (controller.signal.aborted) {
          resolve()
          return
        }
        controller.signal.addEventListener("abort", () => resolve(), { once: true })
      }),
    ])
  } finally {
    clearTimeout(timer)
    controller.abort()
  }

  return hits.map((hit) => {
    if (!htmlBySource.has(hit.sourceId)) return { ...hit, quote: null }
    const html = htmlBySource.get(hit.sourceId) ?? ""
    return { ...hit, quote: quoteFromArticle(html, hit.name) }
  })
}

export function searchSources(
  query: string,
  sources: readonly SearchSourceRow[],
  trip: SearchTripRow,
  type?: "stay" | "activity" | "food" | "transport" | "basic",
): SearchHit[] {
  const dayRows = Array.isArray(trip.days) ? trip.days : []
  const numDays = dayRows.length
  const refs = collectDayItemRefs(trip.days)
  const basicIds = collectBasicIds(trip.basics)
  const q = query.trim()
  const scored: Array<{ score: number; hit: SearchHit }> = []

  for (const source of sources) {
    const author = (source.author ?? "").trim()
    const title = (source.title ?? "").trim() || "Artículo sin título"
    const area = asTrimmed(source.area)

    if (type !== "basic") {
      const items = Array.isArray(source.items) ? source.items : []
      for (const raw of items) {
        const obj = asObject(raw)
        if (!obj) continue
        const itemType = obj.type
        if (typeof itemType !== "string" || !ITEM_TYPES.has(itemType as ItemType)) continue
        if (type && itemType !== type) continue
        const name = asTrimmed(obj.name)
        if (!name) continue
        const hay = haystackOf(name, itemType, area, asTrimmed(obj.region))
        const score = scoreMatch(q, hay, name)
        if (score <= 0) continue
        const id = typeof obj.id === "string" ? obj.id : ""
        const days = id ? daysForSourceItem(refs, id, numDays) : []
        scored.push({
          score,
          hit: {
            kind: "item",
            name,
            type: itemType,
            days,
            consolidated: days.length > 0,
            sourceId: source.id,
            sourceAuthor: author,
            sourceTitle: title,
            affiliateUrl: sanitizeAffiliateUrl(
              typeof obj.affiliateUrl === "string" ? obj.affiliateUrl : null,
            ),
            quote: null,
          },
        })
      }
    }

    if (!type || type === "basic") {
      const basics = Array.isArray(source.basics) ? source.basics : []
      for (const raw of basics) {
        const obj = asObject(raw)
        if (!obj) continue
        const category =
          typeof obj.category === "string" && BASIC_CATEGORIES.has(obj.category as BasicCategory)
            ? obj.category
            : "other"
        const name = asTrimmed(obj.name)
        if (!name) continue
        const hay = haystackOf(name, category, "basic", area)
        const score = scoreMatch(q, hay, name)
        if (score <= 0) continue
        const id = typeof obj.id === "string" ? obj.id : ""
        const consolidated = id ? basicIds.has(id) : false
        scored.push({
          score,
          hit: {
            kind: "basic",
            name,
            type: category,
            days: [],
            consolidated,
            sourceId: source.id,
            sourceAuthor: author,
            sourceTitle: title,
            affiliateUrl: sanitizeAffiliateUrl(
              typeof obj.affiliateUrl === "string" ? obj.affiliateUrl : null,
            ),
            quote: null,
          },
        })
      }
    }
  }

  scored.sort((a, b) => b.score - a.score || a.hit.name.localeCompare(b.hit.name, "es"))
  return scored.slice(0, SEARCH_MAX_RESULTS).map((s) => s.hit)
}

export function searchSourcesText(query: string, hits: SearchHit[], sourceCount: number): string {
  if (sourceCount === 0) {
    return "Este viaje no tiene fuentes. Añade un artículo en WanderPlanner para poder buscar recomendaciones."
  }
  if (hits.length === 0) {
    return `No hay recomendaciones en las fuentes de este viaje para «${query}». No inventes sitios: ofrece añadir una fuente.`
  }
  const lines = hits.slice(0, 8).map((h) => {
    const via = h.sourceAuthor ? `vía ${h.sourceAuthor}` : h.sourceTitle
    const day =
      h.days.length === 0
        ? h.consolidated
          ? "en el viaje"
          : "sin consolidar"
        : h.days.length === 1
          ? `día ${h.days[0]}`
          : `días ${h.days[0]}–${h.days[h.days.length - 1]}`
    return `- ${h.name} (${h.type}, ${day}) · ${via}`
  })
  return `Lo que recomiendan las fuentes para «${query}»:\n${lines.join("\n")}`
}
