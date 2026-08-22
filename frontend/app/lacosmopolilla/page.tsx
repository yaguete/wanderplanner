import type { Metadata } from "next"
import { Caveat } from "next/font/google"
import { notFound } from "next/navigation"
import { LandingHeader } from "@/components/landing/landing-header"
import { LandingFooter } from "@/components/landing/landing-footer"
import { BlogLandingAttribution } from "@/components/landing/blog/blog-landing-attribution"
import { BlogLandingHero } from "@/components/landing/blog/blog-landing-hero"
import { getBlogLanding } from "@/lib/blog-landings"

/** Rotulador fino (Martie Three Regular / Sharpie ultrafine). Gochi Hand era demasiado gruesa. */
const caveat = Caveat({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
})

const SLUG = "lacosmopolilla"

export const metadata: Metadata = {
  title: {
    absolute: "lacosmopolilla · WanderPlanner",
  },
  description:
    "Busca un destino en las guías de lacosmopolilla y conviértelo en tu itinerario, día a día.",
  robots: { index: false, follow: true },
  openGraph: {
    title: "lacosmopolilla · WanderPlanner",
    description:
      "Busca un destino en las guías de lacosmopolilla y conviértelo en tu itinerario, día a día.",
  },
}

export default function LacosmopolillaPage() {
  const landing = getBlogLanding(SLUG)
  if (!landing || !landing.enabled) notFound()

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:text-primary-foreground"
      >
        Saltar al contenido
      </a>
      <BlogLandingAttribution refSlug={landing.slug} />
      <div className="relative">
        <LandingHeader
          homeHref={`/${landing.slug}`}
          lockupLabel={landing.displayName}
          lockupMarkSrc={landing.markSrc}
          lockupWordmarkClassName={caveat.className}
          lockupInk="black"
          lockupHand
        />
        <main id="contenido">
          <BlogLandingHero
            displayName={landing.displayName}
            referrer={landing.slug}
            blogSlug={landing.slug}
            markSrc={landing.markSrc}
            wordmarkClassName={caveat.className}
          />
        </main>
        <LandingFooter />
      </div>
    </>
  )
}
