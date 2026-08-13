import Link from "next/link"
import { Button } from "@/components/ui/button"

export function ClosingCta() {
  return (
    <section className="relative overflow-hidden bg-canvas py-24 sm:py-32">
      {/* Bookend del hero: misma textura y velo de marca, emanando del pie. */}
      <div
        aria-hidden
        className="landing-grid-texture landing-grid-texture--flip absolute inset-0"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[360px] bg-[radial-gradient(50%_60%_at_50%_100%,#9F817314,transparent_70%)]"
      />
      <div className="landing-reveal relative mx-auto w-full max-w-6xl px-6 text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-[-0.03em] sm:text-4xl lg:text-5xl">
          ¿Dónde te lleva el próximo artículo que leas?
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-foreground/70 sm:text-lg">
          Crea tu cuenta gratis y convierte tu próxima lectura en tu próximo viaje.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-12 w-full px-8 text-base sm:w-auto">
            <Link href="/signup">Empezar a planificar</Link>
          </Button>
          <Button asChild variant="link">
            <Link href="#empezar">o empieza con un artículo</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
