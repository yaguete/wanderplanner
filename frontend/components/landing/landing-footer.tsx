import Link from "next/link"
import { BrandLockup } from "@/components/brand-mark"

export function LandingFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <BrandLockup />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Los viajes que lees, convertidos en tu itinerario.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold">Producto</p>
            <nav className="mt-4 flex flex-col gap-2.5" aria-label="Producto">
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
                Entrar
              </Link>
              <Link href="/signup" className="text-sm text-muted-foreground hover:text-foreground">
                Crear cuenta
              </Link>
              <Link href="/partners" className="text-sm text-muted-foreground hover:text-foreground">
                Kit de partners
              </Link>
            </nav>
          </div>

          <div>
            <p className="text-sm font-semibold">Legal</p>
            <nav className="mt-4 flex flex-col gap-2.5" aria-label="Legal">
              <Link
                href="/legal/aviso-legal"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Aviso legal
              </Link>
              <Link
                href="/legal/privacidad"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Privacidad
              </Link>
              <Link
                href="/legal/cookies"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cookies
              </Link>
            </nav>
          </div>

          <div>
            <p className="text-sm font-semibold">Contacto</p>
            <nav className="mt-4 flex flex-col gap-2.5" aria-label="Contacto">
              <a
                href="mailto:hola@wanderplanner.ai"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                hola@wanderplanner.ai
              </a>
            </nav>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-6">
          <p className="text-xs text-muted-foreground">
            Algunos enlaces de los itinerarios son enlaces de afiliación del blog de origen.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">© {year} WanderPlanner</p>
        </div>
      </div>
    </footer>
  )
}
