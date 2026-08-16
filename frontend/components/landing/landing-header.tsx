import Link from "next/link"
import { BrandWordmark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { LandingLockup } from "./landing-lockup"
import type { LandingTone } from "./landing-tone"

export function LandingHeader({
  tone = "light",
  homeHref = "/",
  showSignup = false,
}: {
  tone?: LandingTone
  homeHref?: string
  /** En páginas sin cápsula de alta (p. ej. /legal): CTA junto a Entrar. */
  showSignup?: boolean
}) {
  const negative = tone === "negative"
  return (
    <header className="landing-header fixed inset-x-0 top-0 z-40">
      <div className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link
          href={homeHref}
          data-landing-lockup-to
          className="landing-header-lockup"
          aria-label="WanderPlanner — inicio"
        >
          <BrandWordmark variant={negative ? "negative" : "color"} />
        </Link>
        <nav className="flex items-center gap-3 sm:gap-4" aria-label="Principal">
          <Link
            href="/login"
            className={cn(
              "relative text-sm font-medium leading-none outline-none after:absolute after:-inset-x-2.5 after:-inset-y-2 after:-z-10 after:rounded-md after:shadow-sm after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:ring-2 focus-visible:ring-ring max-sm:hover:after:opacity-0",
              negative
                ? "text-white after:bg-white/10 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(20_8%_11%)]"
                : "after:bg-background focus-visible:ring-offset-2",
            )}
          >
            Entrar
          </Link>
          {showSignup ? (
            <Button asChild size="sm" className="h-9 px-3.5">
              <Link href="/signup">Crear cuenta</Link>
            </Button>
          ) : null}
        </nav>
      </div>
      <LandingLockup tone={tone} href={homeHref} />
    </header>
  )
}
