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
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
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
