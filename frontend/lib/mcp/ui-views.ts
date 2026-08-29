/**
 * Modelos de presentación del widget MCP. Sin React: el iframe y los tests
 * los comparten. Nunca incluye precios, badge de afiliado ni enlaces de vuelos.
 */

export type SourceCardCta =
  | { kind: "trip"; href: string; label: string }
  | { kind: "article"; href: string; label: string }
  | { kind: "none" }

export type SourceHitView = {
  name: string
  sourceAuthor?: string | null
  sourceTitle?: string | null
  quote?: string | null
  sourceUrl?: string | null
  wanderplannerUrl?: string | null
}

export type SourceCardModel = {
  author: string
  articleTitle: string
  place: string
  quote: string | null
  cta: SourceCardCta
}

export type SuggestionView = {
  url: string
  title: string
  host: string
}

export type TripDaySummary = {
  index: number
  label: string
  itemCount: number
  itemNames: string[]
}

export type TripDayItemView = {
  name: string
  type: string
  sourceAuthor: string | null
}

export type TripWidgetModel =
  | {
      kind: "trip"
      name: string
      wanderplannerUrl: string | null
      mode: "summary"
      days: TripDaySummary[]
    }
  | {
      kind: "trip"
      name: string
      wanderplannerUrl: string | null
      mode: "detail"
      days: Array<{ index: number; label: string; items: TripDayItemView[] }>
    }

export type SearchWidgetModel = {
  kind: "search"
  layer: "trip" | "curated" | "web" | "none"
  cards: SourceCardModel[]
  suggestions: SuggestionView[]
}

const AUTHOR_FALLBACK = "la guía"

function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function asString(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const t = raw.trim()
  return t.length > 0 ? t : null
}

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

export function sourceCardFromHit(hit: SourceHitView): SourceCardModel {
  const author = asString(hit.sourceAuthor) || AUTHOR_FALLBACK
  const articleTitle = asString(hit.sourceTitle) || "Artículo"
  const place = asString(hit.name) || "Sin nombre"
  const quote = asString(hit.quote)
  const tripHref = asString(hit.wanderplannerUrl)
  if (tripHref && isHttpUrl(tripHref)) {
    return {
      author,
      articleTitle,
      place,
      quote,
      cta: { kind: "trip", href: tripHref, label: "Verlo en tu viaje" },
    }
  }
  const articleHref = asString(hit.sourceUrl)
  if (articleHref && isHttpUrl(articleHref)) {
    return {
      author,
      articleTitle,
      place,
      quote,
      cta: {
        kind: "article",
        href: articleHref,
        label: `Leer el artículo de ${author}`,
      },
    }
  }
  return { author, articleTitle, place, quote, cta: { kind: "none" } }
}

export function searchWidgetFromContent(raw: unknown): SearchWidgetModel | null {
  const obj = asObject(raw)
  if (!obj) return null
  const layer = obj.layer
  if (layer !== "trip" && layer !== "curated" && layer !== "web" && layer !== "none") {
    return null
  }
  const results = Array.isArray(obj.results) ? obj.results : []
  const suggestions = Array.isArray(obj.suggestions) ? obj.suggestions : []
  return {
    kind: "search",
    layer,
    cards: results.flatMap((item) => {
      const hit = asObject(item)
      if (!hit) return []
      const name = asString(hit.name)
      if (!name) return []
      return [
        sourceCardFromHit({
          name,
          sourceAuthor: asString(hit.sourceAuthor),
          sourceTitle: asString(hit.sourceTitle),
          quote: asString(hit.quote),
          sourceUrl: asString(hit.sourceUrl),
          wanderplannerUrl: asString(hit.wanderplannerUrl),
        }),
      ]
    }),
    suggestions: suggestions.flatMap((item) => {
      const s = asObject(item)
      if (!s) return []
      const url = asString(s.url)
      const title = asString(s.title)
      const host = asString(s.host)
      if (!url || !title || !host || !isHttpUrl(url)) return []
      return [{ url, title, host }]
    }),
  }
}

function mapSummaryDays(raw: unknown): TripDaySummary[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((day, i) => {
    const obj = asObject(day)
    if (!obj) return []
    const names = Array.isArray(obj.itemNames)
      ? obj.itemNames.filter((n): n is string => typeof n === "string")
      : []
    return [
      {
        index: typeof obj.index === "number" ? obj.index : i + 1,
        label: asString(obj.label) ?? "",
        itemCount: typeof obj.itemCount === "number" ? obj.itemCount : names.length,
        itemNames: names,
      },
    ]
  })
}

function mapDetailDays(
  raw: unknown,
): Array<{ index: number; label: string; items: TripDayItemView[] }> {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((day, i) => {
    const obj = asObject(day)
    if (!obj) return []
    const items = Array.isArray(obj.items)
      ? obj.items.flatMap((it) => {
          const item = asObject(it)
          if (!item) return []
          const name = asString(item.name)
          if (!name) return []
          return [
            {
              name,
              type: asString(item.type) ?? "activity",
              sourceAuthor: asString(item.sourceAuthor),
            },
          ]
        })
      : []
    return [
      {
        index: typeof obj.index === "number" ? obj.index : i + 1,
        label: asString(obj.label) ?? "",
        items,
      },
    ]
  })
}

export function tripWidgetFromContent(raw: unknown): TripWidgetModel | null {
  const obj = asObject(raw)
  if (!obj) return null
  const name = asString(obj.name) || "Viaje"
  const wanderplannerUrl = asString(obj.wanderplannerUrl)
  if (obj.mode === "summary") {
    return {
      kind: "trip",
      name,
      wanderplannerUrl: wanderplannerUrl && isHttpUrl(wanderplannerUrl) ? wanderplannerUrl : null,
      mode: "summary",
      days: mapSummaryDays(obj.days),
    }
  }
  if (obj.mode === "detail") {
    return {
      kind: "trip",
      name,
      wanderplannerUrl: wanderplannerUrl && isHttpUrl(wanderplannerUrl) ? wanderplannerUrl : null,
      mode: "detail",
      days: mapDetailDays(obj.days),
    }
  }
  return null
}

/**
 * ChatGPT / MCP Apps envuelven el dato. El widget trata todo como
 * entrada no confiable: solo aceptamos objetos con `layer` o `mode`.
 * No pelear un `toolOutput: null` si al lado viene `structuredContent`.
 */
export function unwrapToolPayload(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return unwrapToolPayload(JSON.parse(raw))
    } catch {
      return raw
    }
  }
  const obj = asObject(raw)
  if (!obj) return raw

  if (obj.toolOutput != null) return unwrapToolPayload(obj.toolOutput)
  if (obj.structuredContent != null) return unwrapToolPayload(obj.structuredContent)
  if (obj.globals != null) return unwrapToolPayload(obj.globals)
  if (obj.result != null && !("mode" in obj) && !("layer" in obj)) {
    return unwrapToolPayload(obj.result)
  }

  if (!("mode" in obj) && !("layer" in obj) && Array.isArray(obj.content)) {
    for (const item of obj.content) {
      const block = asObject(item)
      const text = firstText(block)
      if (!text) continue
      const peeled = unwrapToolPayload(text)
      const inner = asObject(peeled)
      if (inner && ("mode" in inner || "layer" in inner)) return peeled
    }
  }
  return raw
}

function firstText(block: Record<string, unknown> | null): string | null {
  return block ? asString(block.text) : null
}

export function widgetModelFromContent(raw: unknown): TripWidgetModel | SearchWidgetModel | null {
  const data = unwrapToolPayload(raw)
  return searchWidgetFromContent(data) ?? tripWidgetFromContent(data)
}
