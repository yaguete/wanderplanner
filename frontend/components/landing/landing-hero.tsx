import { BrandLockup } from "@/components/brand-mark"
import { LandingStart } from "./landing-start"
import { ProductFrame } from "./product-frame"

export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-canvas pb-16 pt-20 sm:pb-24">
      {/* Texturas de fondo: grid + velo de marca (~8%). Solo decoración. */}
      <div aria-hidden className="landing-grid-texture absolute inset-0" />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[480px] landing-brand-veil"
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 text-center">
        <div className="landing-hero-lockup">
          <div data-landing-lockup-from>
            <BrandLockup />
          </div>
        </div>
        <h1 className="mx-auto max-w-4xl text-balance text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl sm:leading-[1.05] lg:text-7xl">
          Los viajes que te inspiran,{" "}
          <span className="text-foreground/45">convertidos en tu itinerario</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-foreground/70 sm:text-xl">
          WanderPlanner lee a los viajeros/as en los que confías y te ayuda a transformar sus recomendaciones en tu plan de viaje, día a día.
        </p>
        <LandingStart />
      </div>

      <ProductFrame />
    </section>
  )
}
