import Link from "next/link"
import { Button } from "@/components/ui/button"

export function PartnerClosingCta() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div
        aria-hidden
        className="landing-grid-texture landing-grid-texture--flip absolute inset-0"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[360px] bg-[radial-gradient(50%_60%_at_50%_100%,#9F81732e,transparent_70%)]"
      />
      <div className="landing-reveal relative mx-auto w-full max-w-6xl px-6 text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-[-0.03em] sm:text-4xl lg:text-5xl">
          Pon un CTA en tu próxima publicación.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-white/70 sm:text-lg">
          Dos minutos: pegas la URL, te llevas el snippet HTML y tus lectores empiezan a planificar inmediatamente.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="h-12 w-full bg-white px-8 text-base text-[hsl(20_8%_14%)] hover:bg-white/90 sm:w-auto"
          >
            <a href="#empezar">Generar mi CTA</a>
          </Button>
          <Button
            asChild
            variant="link"
            className="text-white/70 hover:text-white"
          >
            <Link href="/">Empieza a planificar tu próximo viaje</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
