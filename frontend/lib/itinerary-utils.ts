/**
 * Convierte la respuesta `Itinerary` del `POST /itinerary` en un `Source` (ítems aplanados y básicos).
 * Aquí vive el mapeo de `affiliate_url` (backend) a `affiliateUrl` (front) y `mapBasicCategory` (snake → camel).
 * No cambies `dayHint` sin entender `source_structured_by_days` y el panel de inspiración.
 */
import type { BasicCategory, Itinerary, Source, SourceBasicItem, SourceItem, Trip } from "@/types/itinerary"
import { sourceRouteHintFromTransport } from "@/lib/transport-routes"
import { normalizeName } from "@/lib/trip-tasks"

let _counter = 0
function uid(): string {
  return `si-${Date.now()}-${++_counter}`
}

function uidBasic(): string {
  return `sb-${Date.now()}-${++_counter}`
}

// Heurística de marca para mostrar en UI; no afecta al enlace de afiliado.
function vendorFromUrl(href: string | null | undefined): string | null {
  if (!href?.trim()) return null
  try {
    const host = new URL(href).hostname.replace(/^www\./, "")
    const part = host.split(".")[0]
    if (!part) return null
    return part.charAt(0).toUpperCase() + part.slice(1)
  } catch {
    return null
  }
}

function sourceAffiliate(href: string | null | undefined): {
  affiliateUrl: string | null
  vendor: string | null
} {
  const url = href?.trim() ? href.trim() : null
  return { affiliateUrl: url, vendor: url ? vendorFromUrl(url) : null }
}

/**
 * Compara afiliados para dedupe: trim, host en minúsculas, sin barra final.
 * No toca querystring (los parámetros de afiliado viven ahí).
 */
export function normalizeAffiliateUrl(href: string | null | undefined): string | null {
  const raw = href?.trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase()
    const path = u.pathname.replace(/\/+$/, "")
    return `${u.protocol}//${host}${path}${u.search}`
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase()
  }
}

/** Marketplaces de experiencias: el enlace es un tour, no un básico. */
const EXPERIENCE_BRANDS = new Set([
  "civitatis",
  "getyourguide",
  "viator",
  "guruwalk",
  "freetour",
  "freetours",
  "klook",
  "musement",
  "tiqets",
  "headout",
  "withlocals",
])

/** Buscadores / taquillas: se quedan en Descuentos (como Skyscanner u ÖBB). */
const TRIP_TOOL_BRANDS = new Set([
  "omio",
  "goeuro",
  "skyscanner",
  "kayak",
  "trainline",
  "thetrainline",
  "rome2rio",
  "kiwi",
  "momondo",
  "cheapflights",
])

function hostnameLabels(href: string | null | undefined): string[] {
  if (!href?.trim()) return []
  try {
    return new URL(href.trim()).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .split(".")
      .filter((part) => part.length > 1)
  } catch {
    return []
  }
}

function brandInLabels(labels: string[], brands: Set<string>): boolean {
  return labels.some((label) => brands.has(label))
}

export function isExperienceAffiliateUrl(href: string | null | undefined): boolean {
  return brandInLabels(hostnameLabels(href), EXPERIENCE_BRANDS)
}

export function isTripEssentialsTool(input: {
  name?: string | null
  vendor?: string | null
  affiliateUrl?: string | null
}): boolean {
  if (brandInLabels(hostnameLabels(input.affiliateUrl), TRIP_TOOL_BRANDS)) return true
  const blob = normalizeName(`${input.name ?? ""} ${input.vendor ?? ""}`)
  if (/\b(omio|goeuro|skyscanner|kayak|trainline|rome2rio|kiwi|momondo)\b/.test(blob)) {
    return true
  }
  const looksLikeSearch = /\b(busqueda|buscador|comparador)\b/.test(blob)
  const looksLikeTransport = /\b(transporte|tren|trenes|vuelo|vuelos|billete|billetes|horario|horarios)\b/.test(
    blob,
  )
  return looksLikeSearch && looksLikeTransport
}

function looksLikeBookableExperienceName(name: string): boolean {
  const n = normalizeName(name)
  return /\b(excursion|crucero|avistamiento|flightseeing|freetour|free tour|tour guiado|visita guiada)\b/.test(
    n,
  )
}

function shouldLiftOtherBasic(basic: SourceBasicItem): boolean {
  const href = basic.affiliateUrl?.trim()
  if (basic.category !== "other" || !href) return false
  if (isTripEssentialsTool(basic)) return false
  if (isExperienceAffiliateUrl(href)) return true
  return looksLikeBookableExperienceName(basic.name)
}

/**
 * Si un básico `other` comparte URL con un ítem de ruta, es un tour duplicado:
 * se queda en el ítem (card clicable) y cae de Descuentos.
 * insurance / sim / car_rental / flight nunca se tocan; si el modelo no
 * casó el link con la activity, el básico sobrevive.
 */
export function dropDuplicateOtherBasics(
  items: Pick<SourceItem, "affiliateUrl">[],
  basics: SourceBasicItem[],
): SourceBasicItem[] {
  const itemUrls = new Set<string>()
  for (const item of items) {
    const url = normalizeAffiliateUrl(item.affiliateUrl)
    if (url) itemUrls.add(url)
  }
  if (itemUrls.size === 0) return basics
  return basics.filter((basic) => {
    if (basic.category !== "other") return true
    const url = normalizeAffiliateUrl(basic.affiliateUrl)
    if (!url) return true
    return !itemUrls.has(url)
  })
}

const ARTICLE_PREFIX = /^(la|el|los|las|un|una) /
/** Visitar / caminar / trekking en un sitio: no es un producto distinto. */
const VISIT_WRAPPER =
  /^(trekking|senderismo|hiking|hike|caminata|paseo|visita|exploracion|recorrido|ascenso|ascension|walk)( de| del| por| al| a| en| to)? /
/** Producto comercial (crucero, tour…): sí es otra cosa que el POI. */
const PRODUCT_WRAPPER =
  /^(excursion|crucero|tour|paseo|visita|exploracion|recorrido)( de| del| por| al| a| en)? /

function stripLeadingArticles(name: string): string {
  return normalizeName(name).replace(ARTICLE_PREFIX, "").trim()
}

/** Quita el envoltorio comercial («excursión», «crucero por»…) para casar con el POI. */
export function foldActivityName(name: string): string {
  return stripLeadingArticles(name).replace(PRODUCT_WRAPPER, "").trim()
}

/** Quita «trekking al», «visita a»… para ver si dos lugares son el mismo sitio. */
function foldVisitWrapper(name: string): string {
  return stripLeadingArticles(name).replace(VISIT_WRAPPER, "").trim()
}

function isBareToponym(name: string): boolean {
  return foldVisitWrapper(name) === stripLeadingArticles(name)
}

function namesLooselyMatch(a: string, b: string): boolean {
  const fa = foldActivityName(a)
  const fb = foldActivityName(b)
  if (!fa || !fb) return false
  if (fa === fb) return true
  const shorter = fa.length <= fb.length ? fa : fb
  const longer = fa.length <= fb.length ? fb : fa
  return shorter.length >= 8 && longer.includes(shorter)
}

function findMatchingActivity(items: SourceItem[], name: string): SourceItem | null {
  const matches = items.filter((item) => item.type === "activity" && namesLooselyMatch(item.name, name))
  if (matches.length === 0) return null
  const withoutUrl = matches.find((item) => !item.affiliateUrl?.trim())
  return withoutUrl ?? matches[0] ?? null
}

/**
 * Un básico `other` que es un tour (Civitatis, GetYourGuide, crucero…) sube a Ruta.
 * Buscadores y taquillas (Omio, Skyscanner, ÖBB…) se quedan en Descuentos.
 * 1. Devuelve a básicos las activities que son herramientas de viaje (payload viejo).
 * 2. Si un ítem ya lleva esa URL → solo cae el básico.
 * 3. Si hay una activity homónima sin enlace → le copia el href.
 * 4. Si no hay pareja → crea la activity (id estable `si-from-{basic.id}`).
 */
export function liftOtherBasicsToActivities(
  items: SourceItem[],
  basics: SourceBasicItem[],
): { items: SourceItem[]; basics: SourceBasicItem[] } {
  const nextItems: SourceItem[] = []
  const kept: SourceBasicItem[] = [...basics]

  for (const item of items) {
    if (item.type === "activity" && isTripEssentialsTool(item)) {
      const existing = kept.some(
        (basic) =>
          normalizeAffiliateUrl(basic.affiliateUrl) &&
          normalizeAffiliateUrl(basic.affiliateUrl) === normalizeAffiliateUrl(item.affiliateUrl),
      )
      if (!existing) {
        const restoredId = item.id.startsWith("si-from-")
          ? item.id.slice("si-from-".length)
          : `sb-from-${item.id}`
        kept.push({
          id: restoredId,
          category: "other",
          name: item.name,
          detail: item.detail,
          vendor: item.vendor ?? null,
          affiliateUrl: item.affiliateUrl ?? null,
          thumbUrl: item.thumbUrl ?? null,
        })
      }
      continue
    }
    nextItems.push({ ...item })
  }

  const itemUrls = new Set<string>()
  for (const item of nextItems) {
    const url = normalizeAffiliateUrl(item.affiliateUrl)
    if (url) itemUrls.add(url)
  }

  const remaining: SourceBasicItem[] = []
  for (const basic of kept) {
    const href = basic.affiliateUrl?.trim() || null
    if (!shouldLiftOtherBasic(basic) || !href) {
      remaining.push(basic)
      continue
    }

    const urlKey = normalizeAffiliateUrl(href)
    if (urlKey && itemUrls.has(urlKey)) continue

    const match = findMatchingActivity(nextItems, basic.name)
    const aff = sourceAffiliate(href)
    if (match) {
      if (!match.affiliateUrl?.trim()) {
        match.affiliateUrl = aff.affiliateUrl
        match.vendor = match.vendor || aff.vendor
        if (!match.detail?.trim() && basic.detail) match.detail = basic.detail
      }
      if (urlKey) itemUrls.add(urlKey)
      continue
    }

    nextItems.push({
      id: `si-from-${basic.id}`,
      type: "activity",
      name: basic.name,
      detail: basic.detail,
      dayHint: null,
      region: null,
      thumbUrl: basic.thumbUrl ?? null,
      affiliateUrl: aff.affiliateUrl,
      vendor: basic.vendor?.trim() || aff.vendor,
    })
    if (urlKey) itemUrls.add(urlKey)
  }

  return { items: nextItems, basics: remaining }
}

function isPlaceItem(item: SourceItem): boolean {
  return item.type === "activity" && !item.affiliateUrl?.trim()
}

function preferPlace(a: SourceItem, b: SourceItem): SourceItem {
  const aBare = isBareToponym(a.name)
  const bBare = isBareToponym(b.name)
  if (aBare !== bBare) return aBare ? a : b
  if (a.name.length !== b.name.length) return a.name.length < b.name.length ? a : b
  return a
}

function mergePlaceFields(keeper: SourceItem, dropped: SourceItem[]): SourceItem {
  const next = { ...keeper }
  for (const other of dropped) {
    if ((other.detail?.trim().length ?? 0) > (next.detail?.trim().length ?? 0)) {
      next.detail = other.detail
    }
    if (!next.thumbUrl && other.thumbUrl) next.thumbUrl = other.thumbUrl
    if (!next.region && other.region) next.region = other.region
  }
  return next
}

function visitNamesMatch(a: string, b: string): boolean {
  const fa = foldVisitWrapper(a)
  const fb = foldVisitWrapper(b)
  if (!fa || !fb || fa !== fb) return false
  return fa.length >= 8
}

/**
 * Colapsa «Exit Glacier» + «Trekking al Exit Glacier» en un solo lugar
 * (mismo día, ambos sin enlace). No toca tours con `affiliateUrl` ni
 * productos tipo crucero/tour: esos sí son otra cosa que el POI.
 */
export function dedupeRedundantPlaces(items: SourceItem[]): SourceItem[] {
  const places: { item: SourceItem; index: number }[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item && isPlaceItem(item)) places.push({ item, index: i })
  }
  if (places.length < 2) return items

  const byDay = new Map<string, typeof places>()
  for (const place of places) {
    const key = place.item.dayHint == null ? "null" : String(place.item.dayHint)
    const group = byDay.get(key)
    if (group) group.push(place)
    else byDay.set(key, [place])
  }

  const drop = new Set<number>()
  const replace = new Map<number, SourceItem>()

  for (const group of byDay.values()) {
    const n = group.length
    if (n < 2) continue
    const parent = group.map((_, i) => i)
    const find = (i: number): number => {
      let r = i
      while (parent[r] !== r) r = parent[r]!
      let c = i
      while (c !== r) {
        const next = parent[c]!
        parent[c] = r
        c = next
      }
      return r
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!visitNamesMatch(group[i]!.item.name, group[j]!.item.name)) continue
        const pa = find(i)
        const pb = find(j)
        if (pa !== pb) parent[pa] = pb
      }
    }
    const clusters = new Map<number, number[]>()
    for (let i = 0; i < n; i++) {
      const root = find(i)
      const members = clusters.get(root)
      if (members) members.push(i)
      else clusters.set(root, [i])
    }
    for (const members of clusters.values()) {
      if (members.length < 2) continue
      const cluster = members.map((i) => group[i]!)
      let keeper = cluster[0]!.item
      for (const { item } of cluster.slice(1)) keeper = preferPlace(keeper, item)
      const dropped = cluster.map((c) => c.item).filter((item) => item !== keeper)
      const merged = mergePlaceFields(keeper, dropped)
      const firstSlot = Math.min(...cluster.map((c) => c.index))
      replace.set(firstSlot, merged)
      for (const { index } of cluster) {
        if (index !== firstSlot) drop.add(index)
      }
    }
  }

  if (drop.size === 0) return items
  return items.flatMap((item, i) => {
    if (drop.has(i)) return []
    return [replace.get(i) ?? item]
  })
}

const GENERIC_LINK_LABEL =
  /^(este enlace|este link|aqui|pincha aqui|haz clic|reserva|reservar|mas info|ver mas|click|enlace)$/i

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function compactName(name: string): string {
  return stripLeadingArticles(name)
    .replace(PRODUCT_WRAPPER, "")
    .replace(VISIT_WRAPPER, "")
    .replace(/\b(el|la|los|las|de|del|por|al|a|en|y|un|una)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function experienceLabelMatches(a: string, b: string): boolean {
  if (namesLooselyMatch(a, b)) return true
  const ca = compactName(a)
  const cb = compactName(b)
  if (!ca || !cb) return false
  if (ca === cb) return true
  const shorter = ca.length <= cb.length ? ca : cb
  const longer = ca.length <= cb.length ? cb : ca
  return shorter.length >= 12 && longer.includes(shorter)
}

/** Enlaces Civitatis / GetYourGuide / … en HTML o markdown del artículo. */
export function extractExperienceLinks(
  content: string,
): { label: string; href: string }[] {
  const found: { label: string; href: string }[] = []
  const seen = new Set<string>()
  const push = (label: string, href: string) => {
    if (!isExperienceAffiliateUrl(href)) return
    const url = normalizeAffiliateUrl(href) ?? href.trim()
    if (!url || seen.has(url)) return
    seen.add(url)
    found.push({ label: stripTags(label) || "enlace", href: href.trim() })
  }
  const htmlRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of content.matchAll(htmlRe)) {
    push(match[2] ?? "", match[1] ?? "")
  }
  const mdRe = /\[([^\]]+)\]\((https?:[^)\s]+)\)/g
  for (const match of content.matchAll(mdRe)) {
    push(match[1] ?? "", match[2] ?? "")
  }
  return found
}

/**
 * Pega `affiliateUrl` de tours del artículo en el ítem homónimo, o crea el
 * ítem si Claude lo dejó como lugar / no lo emitió. No hace falta redestilar.
 */
export function attachExperienceLinksFromHtml(
  html: string,
  items: SourceItem[],
): SourceItem[] {
  const links = extractExperienceLinks(html)
  if (links.length === 0) return items

  const next = items.map((item) => ({ ...item }))
  const itemUrls = new Set<string>()
  for (const item of next) {
    const url = normalizeAffiliateUrl(item.affiliateUrl)
    if (url) itemUrls.add(url)
  }

  let changed = false
  for (const link of links) {
    const urlKey = normalizeAffiliateUrl(link.href)
    if (urlKey && itemUrls.has(urlKey)) continue

    const aff = sourceAffiliate(link.href)
    const match = next.find(
      (item) => item.type === "activity" && experienceLabelMatches(item.name, link.label),
    )
    if (match) {
      if (!match.affiliateUrl?.trim()) {
        match.affiliateUrl = aff.affiliateUrl
        match.vendor = match.vendor || aff.vendor
        changed = true
      }
      if (urlKey) itemUrls.add(urlKey)
      continue
    }

    if (GENERIC_LINK_LABEL.test(normalizeName(link.label))) continue

    next.push({
      id: uid(),
      type: "activity",
      name: link.label,
      detail: null,
      dayHint: null,
      region: null,
      thumbUrl: null,
      affiliateUrl: aff.affiliateUrl,
      vendor: aff.vendor,
    })
    if (urlKey) itemUrls.add(urlKey)
    changed = true
  }
  return changed ? next : items
}

export function reconcileExtractedSource(
  items: SourceItem[],
  basics: SourceBasicItem[],
  html?: string | null,
): { items: SourceItem[]; basics: SourceBasicItem[] } {
  const lifted = liftOtherBasicsToActivities(items, basics)
  const linked = html?.trim()
    ? attachExperienceLinksFromHtml(html, lifted.items)
    : lifted.items
  return {
    items: dedupeRedundantPlaces(linked),
    basics: dropDuplicateOtherBasics(linked, lifted.basics),
  }
}

export function applyArticleHtmlToSource(source: Source, html: string): Source {
  if (!html.trim()) return source.articleHtml === html ? source : { ...source, articleHtml: html }
  const reconciled = reconcileExtractedSource(source.items, source.basics, html)
  const itemsSame = reconciled.items === source.items
  const basicsSame = reconciled.basics === source.basics
  if (itemsSame && basicsSame && source.articleHtml === html) return source
  return {
    ...source,
    articleHtml: html,
    items: reconciled.items,
    basics: reconciled.basics,
  }
}

/**
 * Copia `affiliateUrl` de la fuente (ya lifted) a ítems de día que se
 * consolidaron antes, para que un tour añadido como «Lugar» pase a Actividad.
 */
export function hydrateAffiliateUrlsFromSources(trips: Trip[], sources: Source[]): Trip[] {
  const hrefBySourceItemId = new Map<string, string>()
  for (const source of sources) {
    for (const item of source.items) {
      const href = item.affiliateUrl?.trim()
      if (href) hrefBySourceItemId.set(item.id, href)
    }
  }
  if (hrefBySourceItemId.size === 0) return trips

  let changed = false
  const next = trips.map((trip) => {
    let tripChanged = false
    const days = trip.days.map((day) => {
      let dayChanged = false
      const items = day.items.map((item) => {
        if (item.affiliateUrl?.trim()) return item
        const href = item.sourceItemId
          ? hrefBySourceItemId.get(item.sourceItemId)
          : undefined
        if (!href) return item
        dayChanged = true
        return { ...item, affiliateUrl: href }
      })
      if (!dayChanged) return day
      tripChanged = true
      return { ...day, items }
    })
    if (!tripChanged) return trip
    changed = true
    return { ...trip, days }
  })
  return changed ? next : trips
}

// El JSON del backend usa snake_case; en `SourceBasicItem` la categoría es camelCase.
function mapBasicCategory(raw: string): BasicCategory {
  switch (raw) {
    case "insurance":
      return "insurance"
    case "sim":
      return "sim"
    case "car_rental":
      return "carRental"
    case "flight":
      return "flight"
    case "other":
      return "other"
    default:
      return "other"
  }
}

/**
 * Flatten a backend Itinerary into a flat list of SourceItems
 * suitable for the Inspiration panel.
 */
export function flattenItinerary(itinerary: Itinerary): SourceItem[] {
  const items: SourceItem[] = []

  for (const day of itinerary.days) {
    // Solo aporta pista de día al agrupar en el panel; si el artículo no iba estructurado, queda `null` en todo el listado.
    const dayHint = itinerary.source_structured_by_days ? day.day : null

    for (const t of day.transport ?? []) {
      const name = t.from && t.to ? `${t.from} → ${t.to}` : t.type.charAt(0).toUpperCase() + t.type.slice(1)
      items.push({
        id: uid(),
        type: "transport",
        name,
        detail: t.notes,
        dayHint,
        region: t.region ?? null,
        thumbUrl: t.thumb_url ?? null,
        sourceRouteHint: sourceRouteHintFromTransport(t),
      })
    }

    for (const a of day.accommodations ?? []) {
      // `affiliate_url` se copia a `affiliateUrl` (camel) para clics de reserva en el front.
      const aff = sourceAffiliate(a.affiliate_url)
      items.push({
        id: uid(),
        type: "stay",
        name: a.name,
        detail: a.notes,
        dayHint,
        region: a.region ?? null,
        thumbUrl: a.thumb_url ?? null,
        affiliateUrl: aff.affiliateUrl,
        vendor: aff.vendor,
      })
    }

    for (const r of day.restaurants ?? []) {
      items.push({
        id: uid(),
        type: "food",
        name: r.name,
        detail: r.notes,
        dayHint,
        region: r.region ?? null,
        thumbUrl: r.thumb_url ?? null,
      })
    }

    for (const act of day.activities ?? []) {
      const aff = sourceAffiliate(act.affiliate_url)
      items.push({
        id: uid(),
        type: "activity",
        name: act.name,
        detail: act.notes,
        dayHint,
        region: act.region ?? null,
        thumbUrl: act.thumb_url ?? null,
        affiliateUrl: aff.affiliateUrl,
        vendor: aff.vendor,
      })
      for (const sub of act.sub_activities ?? []) {
        // Si la sub-actividad no trae `region`, hereda la de su actividad padre (más concreta que el `area` del artículo).
        const subAff = sourceAffiliate(sub.affiliate_url)
        items.push({
          id: uid(),
          type: "activity",
          name: sub.name,
          detail: sub.notes,
          dayHint,
          region: sub.region ?? act.region ?? null,
          thumbUrl: sub.thumb_url ?? null,
          affiliateUrl: subAff.affiliateUrl,
          vendor: subAff.vendor,
        })
      }
    }
  }

  return items
}

/**
 * Vuelca `itinerary.basics` a ítems para la pestaña Descuentos.
 */
export function flattenBasics(itinerary: Itinerary): SourceBasicItem[] {
  const list = itinerary.basics ?? []
  // Cada `b.affiliate_url` se expone como `affiliateUrl` alineado con el resto del front.
  return list.map((b) => ({
    id: uidBasic(),
    category: mapBasicCategory(b.category),
    name: b.name,
    detail: b.notes,
    vendor: b.vendor,
    affiliateUrl: b.affiliate_url,
    thumbUrl: b.thumb_url ?? null,
  }))
}

/**
 * Etiqueta de guía: «Japan — 21 días». Usada como nombre de viaje partner y cabecera móvil.
 */
export function formatGuideLabel(
  source: Pick<Source, "area" | "totalDays" | "title">,
): string {
  const area = source.area?.trim()
  if (area && source.totalDays && source.totalDays > 0) {
    return `${area} — ${source.totalDays} días`
  }
  if (area) return area
  return source.title
}

function titleFromUrl(url: string): string | null {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean).pop()
    if (!seg) return null
    const decoded = decodeURIComponent(seg).replace(/[-_]+/g, " ").trim()
    if (!decoded || decoded.length < 3) return null
    return decoded.charAt(0).toUpperCase() + decoded.slice(1)
  } catch {
    return null
  }
}

/**
 * Titular del artículo en el panel Fuentes (desktop).
 * Prefiere `source.title` si ya es el og:title; si aún es la etiqueta sintética legacy, cae al slug de la URL.
 */
export function sourceArticleHeading(source: Source): string {
  const guide = formatGuideLabel(source)
  const title = source.title.trim()
  if (title && title !== guide) return title
  return titleFromUrl(source.url) ?? (title || guide)
}

/** Autor sintético desde la URL (hostname sin www, primer label). Misma regla que el chip pendiente. */
export function authorFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0] || url
  } catch {
    return url
  }
}

/**
 * Build a Source from a backend Itinerary response + metadata.
 */
export function buildSource(
  url: string,
  itinerary: Itinerary,
): Source {
  const author = authorFromUrl(url)

  const area = itinerary.destination?.trim() ? itinerary.destination.trim() : null
  const totalDays =
    Number.isFinite(itinerary.total_days) && itinerary.total_days > 0
      ? Math.floor(itinerary.total_days)
      : null
  const guideLabel =
    area && totalDays ? `${area} — ${totalDays} días` : area || "Fuente"
  const ogTitle = itinerary.og_title?.trim() || null
  const reconciled = reconcileExtractedSource(
    flattenItinerary(itinerary),
    flattenBasics(itinerary),
    itinerary.article_html,
  )

  return {
    id: crypto.randomUUID(),
    url,
    author,
    title: ogTitle || titleFromUrl(url) || guideLabel,
    // `area` = destino del artículo; usado como fallback de geocoding cuando un ítem no trae `region`.
    area,
    totalDays,
    items: reconciled.items,
    basics: reconciled.basics,
    articleHtml: itinerary.article_html ?? "",
    ogImage: itinerary.og_image ?? null,
  }
}
