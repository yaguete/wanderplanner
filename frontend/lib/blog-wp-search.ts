/**
 * Mapeo + filtro + ranking de posts WP para las landings de blog.
 * Puro: el proxy (FastAPI) es espejo; estos tests son el contrato.
 */
import type { SourceSuggestHit } from "@/lib/source-suggest"

export const BLOG_SUGGEST_LIMIT = 4

export type WpRendered = { rendered?: string }

export type WpPost = {
  slug?: string
  link?: string
  title?: WpRendered | string
  excerpt?: WpRendered | string
  categories?: number[]
}

const DENY_SLUG: readonly RegExp[] = [
  /^seguro-/,
  /(^|-)(mejor-)?seguros?-(de-viaje|para-viajar|viaje)(-|$)/,
  /(^|-)esim(-|$)/,
  /^(como-tener-)?internet-en-/,
  /(^|-)heymondo(-|$)/,
  /(^|-)holafly(-|$)/,
  /(^|-)intermundial(-|$)/,
  /^descuentos?-/,
  /^opiniones-/,
  /(^|-)codigo-descuento(-|$)/,
  /(^|-)sorteos?(-|$)/,
]

export function foldText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
}

export function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ""
    })
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ""
    })
    .replace(/&hellip;/gi, "…")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
}

export function stripHtml(raw: string): string {
  const decoded = decodeHtmlEntities(raw)
  return decoded
    .replace(/<[^>]+>/g, " ")
    .replace(/\[\s*…\s*\]/g, "…")
    .replace(/\s+/g, " ")
    .trim()
}

function renderedText(value: WpRendered | string | undefined): string {
  if (typeof value === "string") return value
  if (value && typeof value.rendered === "string") return value.rendered
  return ""
}

export function isDeniedGuideSlug(slug: string): boolean {
  const folded = foldText(slug).replace(/_/g, "-")
  return DENY_SLUG.some((re) => re.test(folded))
}

export function hasExcludedCategory(
  categories: readonly number[] | undefined,
  excludeIds: readonly number[],
): boolean {
  if (!categories || categories.length === 0 || excludeIds.length === 0) return false
  const banned = new Set(excludeIds)
  return categories.some((id) => banned.has(id))
}

export function mapWpPostToHit(post: WpPost, host: string): SourceSuggestHit | null {
  const url = typeof post.link === "string" ? post.link.trim() : ""
  if (!url) return null
  const title = stripHtml(renderedText(post.title))
  const excerpt = stripHtml(renderedText(post.excerpt))
  const displayHost = host.replace(/^www\./i, "")
  return {
    url,
    title: title || displayHost || url,
    destination: excerpt || null,
    totalDays: null,
    host: displayHost,
    origin: "curated",
    instant: false,
  }
}

function queryIn(field: string, query: string): boolean {
  const needle = foldText(query).trim()
  if (!needle) return false
  return foldText(field).includes(needle)
}

/** 0 = slug, 1 = título, 2 = resto. */
export function rankScore(query: string, slug: string, title: string): number {
  if (queryIn(slug.replace(/-/g, " "), query) || queryIn(slug, query)) return 0
  if (queryIn(title, query)) return 1
  return 2
}

export function selectBlogHits(
  posts: readonly WpPost[],
  query: string,
  host: string,
  excludeCategoryIds: readonly number[],
  limit = BLOG_SUGGEST_LIMIT,
): SourceSuggestHit[] {
  const kept: { hit: SourceSuggestHit; slug: string; score: number }[] = []
  const seen = new Set<string>()
  for (const post of posts) {
    const slug = typeof post.slug === "string" ? post.slug : ""
    if (!slug || isDeniedGuideSlug(slug)) continue
    if (hasExcludedCategory(post.categories, excludeCategoryIds)) continue
    const hit = mapWpPostToHit(post, host)
    if (!hit) continue
    const key = hit.url.replace(/\/+$/, "")
    if (seen.has(key)) continue
    seen.add(key)
    kept.push({
      hit,
      slug,
      score: rankScore(query, slug, hit.title),
    })
  }
  kept.sort((a, b) => a.score - b.score)
  return kept.slice(0, Math.max(0, limit)).map((row) => row.hit)
}
