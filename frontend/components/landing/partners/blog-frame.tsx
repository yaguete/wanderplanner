import { LandingStreetPhoto } from "@/components/landing/landing-mocks"
import { PartnerButtonPreview } from "@/components/partners/partner-button-preview"
import { PartnerBrowserFrame } from "./partner-browser-frame"

export function BlogFrame() {
  return (
    <PartnerBrowserFrame url="unblogdeviajes.com/vietnam-en-12-dias">
      <article className="mx-auto w-full max-w-[46ch] px-6 pt-8">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/50">
          @unblogdeviajes · 14 marzo
        </p>
        <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Vietnam en 12 días: la ruta completa
        </h2>
        <p className="mt-4 text-[13px] leading-6 text-white/70">
          Si es tu primera vez en Vietnam, esta ruta de 12 días es el itinerario: Hanói, la bahía
          de Ha Long, Sa Pa y el descenso hacia Hoi An. Sin prisas, con los platos que merecen cola.
        </p>
        <LandingStreetPhoto className="mt-4 h-28 w-full rounded-lg ring-1 ring-white/10 sm:h-32" />
        <div className="mt-5">
          <PartnerButtonPreview mode="mock" variant="negative" />
        </div>
        <div className="mt-6 flex flex-col gap-2 [mask-image:linear-gradient(to_bottom,#000_10%,transparent_100%)]">
          <div className="h-2 w-full rounded-full bg-white/10" />
          <div className="h-2 w-11/12 rounded-full bg-white/10" />
          <div className="h-2 w-4/5 rounded-full bg-white/10" />
        </div>
      </article>
    </PartnerBrowserFrame>
  )
}
