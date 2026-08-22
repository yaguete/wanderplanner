/**
 * Landings co-branded de blogs partners (`/lacosmopolilla`, …).
 *
 * El slug **es** el `ref` del CTA: tiene que pasar `parseRefParam` sin cambios.
 * El host WP está fijado aquí; el proxy nunca acepta una URL libre.
 */
export type BlogLanding = {
  slug: string
  /** Lockup (minúsculas pegadas, como el dominio). */
  wordmark: string
  /** Nombre en prosa: h1, no el wordmark. */
  displayName: string
  host: string
  enabled: boolean
  /** Isotipo del blog (SVG en `/public/brand`). Footer de WanderPlanner no lo usa. */
  markSrc: string
  /** Placeholder del buscador de destino (solo esta landing). */
  destinationPlaceholder?: string
  /** Taxonomía ajena; la denylist de slug es la capa que degrada bien sola. */
  excludeCategoryIds: readonly number[]
}

export const BLOG_LANDINGS: readonly BlogLanding[] = [
  {
    slug: "lacosmopolilla",
    wordmark: "lacosmopolilla",
    displayName: "La Cosmopolilla",
    host: "lacosmopolilla.com",
    enabled: true,
    markSrc: "/brand/lacosmopolilla-mark.svg",
    destinationPlaceholder: "Granada, Islandia, Costa Rica, …",
    excludeCategoryIds: [
      41, // consejos-viajeros
      44, // sorteos
      3787, // playlist
      2771, // podcast
      43, // mis-listas
      8, // videos
      45, // viajar-y-comer
      1, // sin-categoria
    ],
  },
]

const BY_SLUG = new Map(BLOG_LANDINGS.map((blog) => [blog.slug, blog]))

export function getBlogLanding(slug: string): BlogLanding | null {
  return BY_SLUG.get(slug.trim().toLowerCase()) ?? null
}

export function isBlogLandingEnabled(slug: string | undefined): boolean {
  if (!slug) return false
  const blog = getBlogLanding(slug)
  return blog != null && blog.enabled
}
