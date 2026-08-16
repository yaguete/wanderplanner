import { BrandLockup } from "@/components/brand-mark"
import { PartnerButtonBuilder } from "@/components/partners/partner-button-builder"
import { BlogFrame } from "./blog-frame"

export function PartnerHero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-20 sm:pb-24">
      <div aria-hidden className="landing-grid-texture absolute inset-0" />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(50%_60%_at_50%_0%,#9F81732e,transparent_70%)]"
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 text-center">
        <div className="landing-hero-lockup">
          <div data-landing-lockup-from>
            <BrandLockup variant="negative" />
          </div>
        </div>
        <h1 className="mx-auto max-w-4xl text-balance text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl sm:leading-[1.05] lg:text-7xl">
          Ayuda a tu audiencia{" "}
          <span className="text-white/50">a planificar tus viajes.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-white/70 sm:text-xl">
          WanderPlanner transforma tus guías y recomendaciones en un plan de viaje ejecutable. Tu contenido, tu marca y tu monetización siguen siendo tuyos.
        </p>
        <div
          id="empezar"
          className="relative z-20 mx-auto mt-10 w-full max-w-2xl scroll-mt-24 rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-left sm:px-6 sm:py-7"
        >
          <PartnerButtonBuilder />
        </div>
      </div>

      <BlogFrame />
    </section>
  )
}
