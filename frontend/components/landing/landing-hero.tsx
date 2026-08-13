import Link from "next/link"
import { BrandLockup } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { ProductFrame } from "./product-frame"

export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-canvas pb-16 pt-20 sm:pb-24">
      {/* Texturas de fondo: grid + velo de marca (~8%). Solo decoración. */}
      <div aria-hidden className="landing-grid-texture absolute inset-0" />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(50%_60%_at_50%_0%,#9F817314,transparent_70%)]"
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
        <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-foreground/70 sm:text-lg">
          WanderPlanner lee a los viajeros/as en los que confías y te ayuda a convertir sus rutas en tu itinerario, día a día.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-12 w-full px-8 text-base sm:w-auto">
            <Link href="/signup">Empezar a planificar</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 w-full px-8 text-base sm:w-auto">
            <Link href="/partners">Soy bloguero</Link>
          </Button>
        </div>
      </div>

      <ProductFrame />
    </section>
  )
}
