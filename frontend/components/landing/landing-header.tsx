import Link from "next/link"
import { BrandLockup } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="WanderPlanner — inicio">
          <BrandLockup />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Principal">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/partners">Para blogueros</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Entrar</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Crear cuenta</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
