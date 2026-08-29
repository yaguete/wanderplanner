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
  sourceTitle: string | null
  quote: string | null
}

export type TripWidgetModel =
  | {
      kind: "trip"
      name: string
      startDate: string | null
      wanderplannerUrl: string | null
      mode: "summary"
      days: TripDaySummary[]
    }
  | {
      kind: "trip"
      name: string
      startDate: string | null
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

export type ReviewCheckView = {
  id: string
  severity: "ok" | "info" | "warning"
  summary: string
  days: number[]
}

export type ReviewWidgetModel = {
  kind: "review"
  name: string
  wanderplannerUrl: string | null
  checks: ReviewCheckView[]
  evidence: SourceCardModel[]
}

export type BudgetWidgetModel = {
  kind: "budget"
  name: string
  wanderplannerUrl: string | null
  currency: string
  counted: number
  cap: number | null
  verdictKind: "noCap" | "under" | "over"
  delta: number
  priced: number
  total: number
  unpricedTitles: string[]
}

export type WidgetModel =
  | TripWidgetModel
  | SearchWidgetModel
  | ReviewWidgetModel
  | BudgetWidgetModel

const CHECK_LABELS: Record<string, string> = {
  empty_days: "Días vacíos",
  unconsolidated_items: "Fuera del plan",
  stay_coverage: "Alojamiento",
  budget_coverage: "Precios",
  missing_legs: "Ida y vuelta",
}

export function reviewCheckLabel(id: string): string {
  return CHECK_LABELS[id] ?? id
}

export function formatWidgetAmount(n: number, currency: string): string {
  if (!Number.isFinite(n)) return `0 ${currency.trim().toUpperCase() || "EUR"}`
  const rounded = Math.round(n * 100) / 100
  const cur = currency.trim().toUpperCase() || "EUR"
  return `${rounded} ${cur}`
}

export function budgetVerdictLabel(
  kind: "noCap" | "under" | "over",
  delta: number,
  currency: string,
): string {
  if (kind === "noCap") return "Sin techo"
  if (kind === "over") {
    return `${formatWidgetAmount(Math.abs(delta), currency)} por encima del techo`
  }
  return `${formatWidgetAmount(delta, currency)} por debajo del techo`
}

export function coveragePercent(priced: number, total: number): number {
  if (!Number.isFinite(priced) || !Number.isFinite(total) || total <= 0) return 0
  return Math.min(100, Math.max(0, (priced / total) * 100))
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
              sourceTitle: asString(item.sourceTitle),
              quote: asString(item.quote),
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

const DAY_NAMES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
const MONTH_NAMES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
]

/**
 * «Día 4» no responde a «el último día del año»: la fecha sí. Se calcula en UTC
 * a partir de `startDate` (`YYYY-MM-DD`) para que no derive con la zona horaria
 * de quien mira el widget. Sin fechas en el viaje, `null` y solo se pinta el número.
 */
export function dayDateLabel(startDate: string | null, dayIndex: number): string | null {
  if (!startDate || !Number.isInteger(dayIndex) || dayIndex < 1) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate.trim())
  if (!m) return null
  const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(base + (dayIndex - 1) * 86_400_000)
  if (Number.isNaN(d.getTime())) return null
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`
}

export function tripWidgetFromContent(raw: unknown): TripWidgetModel | null {
  const obj = asObject(raw)
  if (!obj) return null
  const name = asString(obj.name) || "Viaje"
  const startDate = asString(obj.startDate)
  const wanderplannerUrl = asString(obj.wanderplannerUrl)
  if (obj.mode === "summary") {
    return {
      kind: "trip",
      name,
      startDate,
      wanderplannerUrl: wanderplannerUrl && isHttpUrl(wanderplannerUrl) ? wanderplannerUrl : null,
      mode: "summary",
      days: mapSummaryDays(obj.days),
    }
  }
  if (obj.mode === "detail") {
    return {
      kind: "trip",
      name,
      startDate,
      wanderplannerUrl: wanderplannerUrl && isHttpUrl(wanderplannerUrl) ? wanderplannerUrl : null,
      mode: "detail",
      days: mapDetailDays(obj.days),
    }
  }
  return null
}

function firstText(block: Record<string, unknown> | null): string | null {
  return block ? asString(block.text) : null
}

function isWidgetInner(obj: Record<string, unknown>): boolean {
  return (
    "mode" in obj ||
    "layer" in obj ||
    "checks" in obj ||
    ("verdict" in obj && "coverage" in obj)
  )
}

/**
 * ChatGPT / MCP Apps envuelven el dato. El widget trata todo como
 * entrada no confiable: solo aceptamos objetos con `layer`, `mode`,
 * `checks` o `verdict`+`coverage`. No pelear un `toolOutput: null` si al
 * lado viene `structuredContent`.
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
  if (obj.result != null && !isWidgetInner(obj)) {
    return unwrapToolPayload(obj.result)
  }

  if (!isWidgetInner(obj) && Array.isArray(obj.content)) {
    for (const item of obj.content) {
      const block = asObject(item)
      const text = firstText(block)
      if (!text) continue
      const peeled = unwrapToolPayload(text)
      const inner = asObject(peeled)
      if (inner && isWidgetInner(inner)) return peeled
    }
  }
  return raw
}

export function reviewWidgetFromContent(raw: unknown): ReviewWidgetModel | null {
  const obj = asObject(raw)
  if (!obj || !Array.isArray(obj.checks) || obj.checks.length === 0) return null
  const checks: ReviewCheckView[] = []
  for (const entry of obj.checks) {
    const c = asObject(entry)
    if (!c) continue
    const id = asString(c.id)
    const severity = c.severity
    const summary = asString(c.summary)
    if (!id || !summary) continue
    if (severity !== "ok" && severity !== "info" && severity !== "warning") continue
    const days = Array.isArray(c.days)
      ? c.days.filter((d): d is number => typeof d === "number" && Number.isInteger(d))
      : []
    checks.push({ id, severity, summary, days })
  }
  if (checks.length === 0) return null
  const name = asString(obj.name) || "Viaje"
  const wanderplannerUrl = asString(obj.wanderplannerUrl)
  const evidenceRaw = Array.isArray(obj.evidence) ? obj.evidence : []
  return {
    kind: "review",
    name,
    wanderplannerUrl: wanderplannerUrl && isHttpUrl(wanderplannerUrl) ? wanderplannerUrl : null,
    checks,
    evidence: evidenceRaw.flatMap((item) => {
      const hit = asObject(item)
      if (!hit) return []
      const place = asString(hit.name)
      if (!place) return []
      return [
        sourceCardFromHit({
          name: place,
          sourceAuthor: asString(hit.sourceAuthor),
          sourceTitle: asString(hit.sourceTitle),
          quote: asString(hit.quote),
          sourceUrl: asString(hit.sourceUrl),
          wanderplannerUrl: asString(hit.wanderplannerUrl),
        }),
      ]
    }),
  }
}

export function budgetWidgetFromContent(raw: unknown): BudgetWidgetModel | null {
  const obj = asObject(raw)
  if (!obj || Array.isArray(obj.checks)) return null
  const verdict = asObject(obj.verdict)
  const coverage = asObject(obj.coverage)
  if (!verdict || !coverage) return null
  const kind = verdict.kind
  if (kind !== "noCap" && kind !== "under" && kind !== "over") return null
  const counted = typeof obj.counted === "number" && Number.isFinite(obj.counted) ? obj.counted : 0
  const priced = typeof coverage.priced === "number" && Number.isFinite(coverage.priced) ? coverage.priced : 0
  const total = typeof coverage.total === "number" && Number.isFinite(coverage.total) ? coverage.total : 0
  const capRaw = verdict.cap
  const cap = typeof capRaw === "number" && Number.isFinite(capRaw) ? capRaw : null
  const delta = typeof verdict.delta === "number" && Number.isFinite(verdict.delta) ? verdict.delta : 0
  const currency = asString(obj.currency) || "EUR"
  const name = asString(obj.name) || "Viaje"
  const wanderplannerUrl = asString(obj.wanderplannerUrl)
  const unpricedTitles: string[] = []
  if (Array.isArray(obj.unpriced)) {
    for (const group of obj.unpriced) {
      const g = asObject(group)
      const titles = Array.isArray(g?.titles) ? g.titles : []
      for (const t of titles) {
        if (typeof t === "string" && t.trim()) unpricedTitles.push(t.trim())
        if (unpricedTitles.length >= 12) break
      }
      if (unpricedTitles.length >= 12) break
    }
  }
  return {
    kind: "budget",
    name,
    wanderplannerUrl: wanderplannerUrl && isHttpUrl(wanderplannerUrl) ? wanderplannerUrl : null,
    currency,
    counted,
    cap,
    verdictKind: kind,
    delta,
    priced,
    total,
    unpricedTitles,
  }
}

export function widgetModelFromContent(raw: unknown): WidgetModel | null {
  const data = unwrapToolPayload(raw)
  return (
    reviewWidgetFromContent(data) ??
    budgetWidgetFromContent(data) ??
    searchWidgetFromContent(data) ??
    tripWidgetFromContent(data)
  )
}
