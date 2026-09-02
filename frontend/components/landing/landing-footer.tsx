import Link from "next/link"
import { BrandLockup } from "@/components/brand-mark"
import { CookieSettingsButton } from "@/components/cookie-settings-button"
import { ThemeModeToggle } from "@/components/theme-mode-toggle"
import { showsThemeToggle } from "@/lib/theme-scope"
import { cn } from "@/lib/utils"
import { LandingFooterAuthLinks } from "./landing-nav"
import type { LandingTone } from "./landing-tone"

const KIWIMANGO_HREF =
  "https://kiwimango.biz/products/61d79de3-468d-4608-a5cd-1c98d1f3d65e?utm_source=badge&utm_medium=embed"
const KIWIMANGO_BADGE = "https://kiwimango.biz/api/badge/61d79de3-468d-4608-a5cd-1c98d1f3d65e"

export function LandingFooter({
  tone = "light",
  audienceHref = "/partners",
  audienceLabel = "Para creadores/as",
  showKiwiMango = false,
}: {
  tone?: LandingTone
  audienceHref?: string
  audienceLabel?: string
  /** Badge de votación. Solo la landing de viajeros (`/`). */
  showKiwiMango?: boolean
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
              <LandingFooterAuthLinks mutedClass={muted} />
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
              <p className="flex items-center gap-1.5 text-sm">
                <Link href="/legal/cookies" className={muted}>
                  Cookies
                </Link>
                <span className={negative ? "text-white/40" : "text-muted-foreground"} aria-hidden>
                  ·
                </span>
                <CookieSettingsButton className={cn("text-sm", muted)} />
              </p>
            </nav>
          </div>

          <div>
            <p className="text-sm font-semibold">Contacto</p>
            <nav className="mt-4 flex flex-col gap-2.5" aria-label="Contacto">
              <a href="mailto:hola@wanderplanner.ai" className={cn("text-sm", muted)}>
                hola@wanderplanner.ai
              </a>
            </nav>
            {showsThemeToggle(undefined, tone) ? (
              <ThemeModeToggle className="mt-5" />
            ) : null}
          </div>
        </div>

        {showKiwiMango ? (
          <div
            className={cn(
              "mt-12 flex flex-col gap-4 border-t pt-8 sm:flex-row sm:items-center sm:justify-between",
              negative ? "border-white/10" : "border-border",
            )}
          >
            <p className={cn("max-w-sm text-sm", negative ? "text-white/60" : "text-muted-foreground")}>
              Si te gusta lo que ves, apóyanos en{" "}
              <a
                href="https://www.kiwimango.biz"
                target="_blank"
                rel="noopener noreferrer"
                className={cn("underline underline-offset-2", muted)}
              >
                KiwiMango
              </a>.
            </p>
            <a
              href={KIWIMANGO_HREF}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Vota WanderPlanner en KiwiMango"
              className="inline-flex shrink-0 self-start rounded-[10px] opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:self-auto"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- badge vivo (recuento de votos); no es un asset nuestro. */}
              <img
                src={KIWIMANGO_BADGE}
                alt="Vota WanderPlanner en KiwiMango"
                width={200}
                height={50}
                loading="lazy"
                decoding="async"
              />
            </a>
          </div>
        ) : null}
      </div>
    </footer>
  )
}
