import Link from "next/link"
import { BrandWordmark } from "@/components/brand-mark"
import { LandingLockup } from "./landing-lockup"

export function LandingHeader() {
  return (
    <header className="landing-header fixed inset-x-0 top-0 z-40">
      <div className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          data-landing-lockup-to
          className="landing-header-lockup"
          aria-label="WanderPlanner — inicio"
        >
          <BrandWordmark />
        </Link>
        <nav className="flex items-center" aria-label="Principal">
          <Link
            href="/login"
            className="relative text-sm font-medium leading-none outline-none after:absolute after:-inset-x-2.5 after:-inset-y-2 after:-z-10 after:rounded-md after:bg-background after:shadow-sm after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-sm:hover:after:opacity-0"
          >
            Entrar
          </Link>
        </nav>
      </div>
      <LandingLockup />
    </header>
  )
}
