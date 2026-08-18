import Link from "next/link"
import { BrandWordmark } from "@/components/brand-mark"
import { LandingLockup } from "./landing-lockup"
import { LandingNav } from "./landing-nav"
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
        <LandingNav tone={tone} showSignup={showSignup} />
      </div>
      <LandingLockup tone={tone} href={homeHref} />
    </header>
  )
}

