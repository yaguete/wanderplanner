import Link from "next/link"
import { BrandLockup } from "@/components/brand-mark"
import { cn } from "@/lib/utils"
import type { LandingTone } from "./landing-tone"

export function LandingFooter({
  tone = "light",
  audienceHref = "/partners",
  audienceLabel = "Para blogueros",
}: {
  tone?: LandingTone
  audienceHref?: string
  audienceLabel?: string
}) {
  const year = new Date().getFullYear()
  const negative = tone === "negative"
  const muted = negative ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground"

  return (
    <footer
      className={cn(
        "border-t",
        negative ? "border-white/10 bg-[hsl(20_8%_11%)] text-white" : "border-border bg-background",
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <BrandLockup variant={negative ? "negative" : "color"} />
            <p className={cn("mt-3 max-w-xs text-sm", negative ? "text-white/60" : "text-muted-foreground")}>
              Los viajes que te inspiran, convertidos en tu itinerario.
            </p>
            <p className={cn("mt-3 text-xs", negative ? "text-white/60" : "text-muted-foreground")}>
              © {year} WanderPlanner
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold">Producto</p>
            <nav className="mt-4 flex flex-col gap-2.5" aria-label="Producto">
              <Link href="/login" className={cn("text-sm", muted)}>
                Entrar
              </Link>
              <Link href="/signup" className={cn("text-sm", muted)}>
                Crear cuenta
              </Link>
              <Link href={audienceHref} className={cn("text-sm", muted)}>
                {audienceLabel}
              </Link>
            </nav>
          </div>

          <div>
            <p className="text-sm font-semibold">Legal</p>
            <nav className="mt-4 flex flex-col gap-2.5" aria-label="Legal">
              <Link href="/legal/aviso-legal" className={cn("text-sm", muted)}>
                Aviso legal
              </Link>
              <Link href="/legal/privacidad" className={cn("text-sm", muted)}>
                Privacidad
              </Link>
              <Link href="/legal/cookies" className={cn("text-sm", muted)}>
                Cookies
              </Link>
            </nav>
          </div>

          <div>
            <p className="text-sm font-semibold">Contacto</p>
            <nav className="mt-4 flex flex-col gap-2.5" aria-label="Contacto">
              <a href="mailto:hola@wanderplanner.ai" className={cn("text-sm", muted)}>
                hola@wanderplanner.ai
              </a>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  )
}
