import { BrandLockup } from "@/components/brand-mark"
import { LandingStart } from "../landing-start"
import { ProductFrame } from "../product-frame"

export function BlogLandingHero({
  displayName,
  referrer,
  blogSlug,
  markSrc,
  wordmarkClassName,
}: {
  displayName: string
  referrer: string
  blogSlug: string
  markSrc: string
  wordmarkClassName?: string
}) {
  return (
    <section className="relative overflow-hidden bg-canvas pb-16 pt-20 sm:pb-24">
      <div aria-hidden className="landing-grid-texture absolute inset-0" />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(50%_60%_at_50%_0%,#9F817314,transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 text-center">
        <div className="landing-hero-lockup">
          <div data-landing-lockup-from>
            <BrandLockup
              label={displayName}
              markSrc={markSrc}
              wordmarkClassName={wordmarkClassName}
              wordmarkInk="black"
              wordmarkHand
            />
          </div>
        </div>
        <h1 className="mx-auto max-w-4xl text-balance text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl sm:leading-[1.05] lg:text-7xl">
          Los viajes que te inspiran,{" "}
          <span className="text-foreground/45">convertidos en tu itinerario</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-foreground/70 sm:text-xl">
          WanderPlanner transforma las rutas y recomendaciones de {displayName} en tu plan de viaje, día a día.
        </p>
        <LandingStart
          tabs={["destination", "signup"]}
          referrer={referrer}
          suggest="blog"
          blogSlug={blogSlug}
          surface={blogSlug}
        />
      </div>

      <ProductFrame />
    </section>
  )
}
