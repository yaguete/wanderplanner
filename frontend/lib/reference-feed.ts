/**
 * Cliente y helpers puros del feed de referencias (`GET /sources/reference-feed`).
 */
import { authHeaders } from "@/lib/api-auth"
import { domainFromUrl, type FavoriteReference } from "@/lib/db/profile-repo"
import { isInspirationalSourceUrl } from "@/lib/inspirational-source"
import { canAddSource, sourceMatchKey } from "@/lib/trip-sources"
import type { Source, Trip } from "@/types/itinerary"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export const MAX_REFERENCE_FEED_HOSTS = 8
export const REFERENCE_FEED_FILTER_KEY = "wp-trips-source-filter"
const SESSION_CACHE_PREFIX = "wp-reference-feed:"
const SESSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000

export type ReferenceFeedItem = {
  url: string
  title: string
  publishedAt: string | null
  imageUrl: string | null
  instant: boolean
  host: string
}

export type ReferenceFeedReason = "not_blog" | "unavailable" | "empty" | null

export type ReferenceFeedResponse = {
  host: string
  items: ReferenceFeedItem[]
  reason: ReferenceFeedReason
}

export type FeedHostChip = {
  domain: string
  label: string
  feedable: boolean
}

export type FeedListRow =
  | { type: "article"; item: ReferenceFeedItem }
  | { type: "more"; host: string; label: string; href: string }

export type TripFeedEligibility = "ok" | "full" | "busy" | "duplicate"

/** Icono público del sitio (gstatic). `/favicon.ico` suele 404 en WordPress. */
export function faviconUrlForHost(host: string): string {
  const domain = host.replace(/^www\./i, "").toLowerCase().trim()
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`
}

export function hostIsFeedable(host: string): boolean {
  const h = host.replace(/^www\./i, "").toLowerCase().trim()
  if (!h) return false
  return isInspirationalSourceUrl(`https://${h}/ruta-de-ejemplo`)
}

export function normalizeFeedHost(raw: string): string | null {
  const host = domainFromUrl(raw.startsWith("http") ? raw : `https://${raw}`)
  if (!host || !host.includes(".")) return null
  return host
}

export function feedHostsFromReferences(
  refs: readonly FavoriteReference[],
): FeedHostChip[] {
  const seen = new Set<string>()
  const out: FeedHostChip[] = []
  for (const ref of refs) {
    const domain = (ref.domain ?? domainFromUrl(ref.url))?.replace(/^www\./i, "").toLowerCase()
    if (!domain || !domain.includes(".") || seen.has(domain)) continue
    seen.add(domain)
    out.push({
      domain,
      label: ref.label?.trim() || domain,
      feedable: hostIsFeedable(domain),
    })
  }
  return out
}

export function capFeedHosts(domains: readonly string[]): string[] {
  return [...domains].slice(0, MAX_REFERENCE_FEED_HOSTS)
}

export function resolveFeedFilter(
  available: readonly string[],
  stored: string[] | null,
): string[] {
  if (stored == null) return [...available]
  const allow = new Set(available)
  const next = stored.filter((d) => allow.has(d))
  if (stored.length > 0 && next.length === 0) return [...available]
  return next
}

export function allFeedFilterSelected(
  available: readonly string[],
  selected: readonly string[],
): boolean {
  return available.length > 0 && available.every((d) => selected.includes(d))
}

/** Si están todas, las oculta; si no, las muestra todas. */
export function toggleAllFeedFilter(
  available: readonly string[],
  selected: readonly string[],
): string[] {
  return allFeedFilterSelected(available, selected) ? [] : [...available]
}

export function toggleOneFeedFilter(
  selected: readonly string[],
  domain: string,
): string[] {
  return selected.includes(domain)
    ? selected.filter((d) => d !== domain)
    : [...selected, domain]
}

export function readStoredFeedFilter(): string[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(REFERENCE_FEED_FILTER_KEY)
    if (raw == null) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.filter((d): d is string => typeof d === "string" && d.length > 0)
  } catch {
    return null
  }
}

export function writeStoredFeedFilter(domains: readonly string[]): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(REFERENCE_FEED_FILTER_KEY, JSON.stringify([...domains]))
  } catch {
    /* private mode */
  }
}

export function blogHomeUrl(host: string): string {
  const h = host.replace(/^www\./i, "").toLowerCase().trim()
  return h ? `https://${h}/` : ""
}

/** Filas del listado: artículos de cada blog (fecha desc.) y «Ver más» al cierre del grupo. */
export function buildFeedListRows(
  groups: readonly { host: string; label: string; items: readonly ReferenceFeedItem[] }[],
): FeedListRow[] {
  const rows: FeedListRow[] = []
  for (const group of groups) {
    const items = mergeFeedItems([{ host: group.host, items: group.items }])
    if (items.length === 0) continue
    for (const item of items) rows.push({ type: "article", item })
    const href = blogHomeUrl(group.host)
    if (!href) continue
    rows.push({
      type: "more",
      host: group.host,
      label: group.label.trim() || group.host,
      href,
    })
  }
  return rows
}

export function mergeFeedItems(
  groups: readonly { host: string; items: readonly ReferenceFeedItem[] }[],
): ReferenceFeedItem[] {
  const seen = new Set<string>()
  const merged: ReferenceFeedItem[] = []
  for (const group of groups) {
    for (const item of group.items) {
      const key = sourceMatchKey(item.url)
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push({ ...item, host: item.host || group.host })
    }
  }
  merged.sort((a, b) => {
    const ta = a.publishedAt ?? ""
    const tb = b.publishedAt ?? ""
    if (ta === tb) return a.title.localeCompare(b.title, "es")
    return tb.localeCompare(ta)
  })
  return merged
}

export function formatPublishedAt(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d)
}

export function tripFeedEligibility(opts: {
  sourceCount: number
  loadingPendingCount: number
  alreadyHasArticle: boolean
}): TripFeedEligibility {
  if (opts.alreadyHasArticle) return "duplicate"
  if (opts.loadingPendingCount > 0) return "busy"
  if (!canAddSource({ sourceCount: opts.sourceCount, loadingPendingCount: 0 })) {
    return "full"
  }
  return "ok"
}

export function tripHasArticle(
  sources: readonly Pick<Source, "url">[],
  articleUrl: string,
): boolean {
  const key = sourceMatchKey(articleUrl)
  if (!key) return false
  return sources.some((s) => sourceMatchKey(s.url) === key)
}

export function tripsWithArticle(
  trips: readonly Pick<Trip, "name" | "archived" | "sourceIds">[],
  sourcesById: ReadonlyMap<string, Pick<Source, "url">>,
  articleUrl: string,
): string[] {
  const key = sourceMatchKey(articleUrl)
  if (!key) return []
  const names: string[] = []
  for (const trip of trips) {
    if (trip.archived) continue
    const has = trip.sourceIds.some((id) => {
      const source = sourcesById.get(id)
      return source ? sourceMatchKey(source.url) === key : false
    })
    if (has) names.push(trip.name)
  }
  return names
}

export type AddArticleTripOption = {
  id: string
  name: string
  eligibility: TripFeedEligibility
}

export function buildAddArticleTripOptions(
  trips: readonly Pick<Trip, "id" | "name" | "archived" | "sourceIds">[],
  sources: readonly Pick<Source, "id" | "url">[],
  pendingLoadingTripIds: ReadonlySet<string>,
  articleUrl: string,
): AddArticleTripOption[] {
  const key = sourceMatchKey(articleUrl)
  const sourceKeyById = new Map(sources.map((s) => [s.id, sourceMatchKey(s.url)]))
  return trips
    .filter((t) => !t.archived)
    .map((trip) => {
      const alreadyHasArticle = trip.sourceIds.some((id) => sourceKeyById.get(id) === key)
      return {
        id: trip.id,
        name: trip.name,
        eligibility: tripFeedEligibility({
          sourceCount: trip.sourceIds.length,
          loadingPendingCount: pendingLoadingTripIds.has(trip.id) ? 1 : 0,
          alreadyHasArticle,
        }),
      }
    })
}

export function extractionFailureMessage(
  reason: "max-sources" | "already-loading" | "trip-not-found" | "invalid-state",
): string {
  if (reason === "max-sources") return "Este viaje ya tiene 5 fuentes."
  if (reason === "already-loading") return "Este viaje ya está extrayendo una fuente."
  if (reason === "trip-not-found") return "No encontramos ese viaje."
  return "No se pudo añadir el artículo."
}

type CacheEntry = { at: number; payload: ReferenceFeedResponse }

function cacheKey(host: string): string {
  return `${SESSION_CACHE_PREFIX}${host}`
}

export function readCachedFeed(host: string): ReferenceFeedResponse | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(cacheKey(host))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    if (!parsed || typeof parsed.at !== "number" || !parsed.payload) return null
    if (Date.now() - parsed.at > SESSION_CACHE_TTL_MS) {
      sessionStorage.removeItem(cacheKey(host))
      return null
    }
    return parsed.payload
  } catch {
    return null
  }
}

export function writeCachedFeed(host: string, payload: ReferenceFeedResponse): void {
  if (typeof window === "undefined") return
  try {
    const entry: CacheEntry = { at: Date.now(), payload }
    sessionStorage.setItem(cacheKey(host), JSON.stringify(entry))
  } catch {
    /* quota */
  }
}

function parseFeedItem(raw: unknown, host: string): ReferenceFeedItem | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (typeof row.url !== "string" || !row.url) return null
  return {
    url: row.url,
    title: typeof row.title === "string" && row.title.trim() ? row.title : host,
    publishedAt: typeof row.published_at === "string" ? row.published_at : null,
    imageUrl: typeof row.image_url === "string" && row.image_url ? row.image_url : null,
    instant: row.instant === true,
    host,
  }
}

export async function fetchReferenceFeed(domain: string): Promise<ReferenceFeedResponse> {
  const host = normalizeFeedHost(domain) ?? domain
  const cached = readCachedFeed(host)
  if (cached) return cached

  const params = new URLSearchParams({ domain: host })
  const headers = await authHeaders()
  try {
    const res = await fetch(`${API_BASE}/sources/reference-feed?${params}`, { headers })
    if (!res.ok) {
      return { host, items: [], reason: "unavailable" }
    }
    const body = (await res.json()) as unknown
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      return { host, items: [], reason: "unavailable" }
    }
    const row = body as Record<string, unknown>
    const reasonRaw = row.reason
    const reason: ReferenceFeedReason =
      reasonRaw === "not_blog" || reasonRaw === "unavailable" || reasonRaw === "empty"
        ? reasonRaw
        : null
    const itemsRaw = Array.isArray(row.items) ? row.items : []
    const payload: ReferenceFeedResponse = {
      host: typeof row.host === "string" && row.host ? row.host : host,
      items: itemsRaw
        .map((item) => parseFeedItem(item, host))
        .filter((item): item is ReferenceFeedItem => item != null),
      reason,
    }
    writeCachedFeed(host, payload)
    return payload
  } catch {
    return { host, items: [], reason: "unavailable" }
  }
}
