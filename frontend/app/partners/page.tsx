import type { Metadata } from "next"
import { LandingHeader } from "@/components/landing/landing-header"
import { LandingFooter } from "@/components/landing/landing-footer"
import { PartnerHero } from "@/components/landing/partners/partner-hero"
import { PartnerValueProps } from "@/components/landing/partners/partner-value-props"
import { PartnerClosingCta } from "@/components/landing/partners/partner-closing-cta"

export const metadata: Metadata = {
  title: {
    absolute: "WanderPlanner para blogueros: un botón al final de tu post",
  },
  description:
    "Genera el botón para tu artículo. Tu lector convierte tu ruta en su plan. Tu marca, tus enlaces de afiliación y tu tráfico siguen siendo tuyos.",
  openGraph: {
    title: "WanderPlanner para blogueros: un botón al final de tu post",
    description:
      "Genera el botón para tu artículo. Tu lector convierte tu ruta en su plan. Tu marca, tus enlaces de afiliación y tu tráfico siguen siendo tuyos.",
  },
}

export default function PartnersPage() {
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-white focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:text-[hsl(20_8%_14%)]"
      >
        Saltar al contenido
      </a>
      <div className="landing-negative relative">
        <LandingHeader tone="negative" homeHref="/partners" />
        <main id="contenido">
          <PartnerHero />
          <PartnerValueProps />
          <PartnerClosingCta />
        </main>
        <LandingFooter
          tone="negative"
          audienceHref="/"
          audienceLabel="Para viajeros"
        />
      </div>
    </>
  )
}
