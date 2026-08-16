import type { Metadata } from "next"
import { LandingHeader } from "@/components/landing/landing-header"
import { LandingHero } from "@/components/landing/landing-hero"
import { ValueProps } from "@/components/landing/value-props"
import { ForBloggers } from "@/components/landing/for-bloggers"
import { ClosingCta } from "@/components/landing/closing-cta"
import { LandingFooter } from "@/components/landing/landing-footer"

export const metadata: Metadata = {
  title: {
    absolute: "WanderPlanner: itinerarios de viaje con IA, gratis",
  },
  description:
    "Gratis y con IA. Pega el artículo de tu bloguero favorito y WanderPlanner lo convierte en tu itinerario, día a día.",
  openGraph: {
    title: "WanderPlanner: itinerarios de viaje con IA, gratis",
    description:
      "Gratis y con IA. Pega el artículo de tu bloguero favorito y WanderPlanner lo convierte en tu itinerario, día a día.",
  },
}

export default function RootPage() {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:text-primary-foreground"
      >
        Saltar al contenido
      </a>
      <div className="relative">
        <LandingHeader />
        <main id="contenido">
          <LandingHero />
          <ValueProps />
          <ForBloggers />
          <ClosingCta />
        </main>
        <LandingFooter />
      </div>
    </>
  )
}
