import type { Metadata } from "next"
import { LandingHeader } from "@/components/landing/landing-header"
import { LandingHero } from "@/components/landing/landing-hero"
import { HowItWorks } from "@/components/landing/how-it-works"
import { ForBloggers } from "@/components/landing/for-bloggers"
import { SocialProof } from "@/components/landing/social-proof"
import { ClosingCta } from "@/components/landing/closing-cta"
import { LandingFooter } from "@/components/landing/landing-footer"

export const metadata: Metadata = {
  description:
    "Planifica con quien ya ha estado allí: WanderPlanner lee los artículos de tus blogueros de viaje favoritos y los convierte en un itinerario por días.",
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
          <HowItWorks />
          <ForBloggers />
          <SocialProof />
          <ClosingCta />
        </main>
        <LandingFooter />
      </div>
    </>
  )
}
