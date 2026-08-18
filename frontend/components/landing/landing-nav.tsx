"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"
import type { LandingTone } from "./landing-tone"

function navLinkClass(negative: boolean) {
  return cn(
    "relative text-sm font-medium leading-none outline-none after:absolute after:-inset-x-2.5 after:-inset-y-2 after:-z-10 after:rounded-md after:shadow-sm after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:ring-2 focus-visible:ring-ring max-sm:hover:after:opacity-0",
    negative
      ? "text-white after:bg-white/10 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(20_8%_11%)]"
      : "after:bg-background focus-visible:ring-offset-2",
  )
}

/**
 * Isla cliente: el HTML de servidor pinta «Entrar» (sin sesión / loading) para no
 * saltar al hidratar. Tras la sesión, cuenta → Tus viajes; invitado → seguir + Entrar.
 */
export function LandingNav({
  tone = "light",
  showSignup = false,
}: {
  tone?: LandingTone
  showSignup?: boolean
}) {
  const { user, isGuest, isLoading } = useAuth()
  const negative = tone === "negative"
  const ready = !isLoading && user

  return (
    <nav className="flex items-center gap-3 sm:gap-4" aria-label="Principal">
      {ready && !isGuest ? (
        <Link href="/trips" className={navLinkClass(negative)}>
          Tus viajes
        </Link>
      ) : (
        <>
          {ready && isGuest ? (
            <Link href="/trips" className={navLinkClass(negative)}>
              Seguir con mi viaje
            </Link>
          ) : null}
          <Link href="/login" className={navLinkClass(negative)}>
            Entrar
          </Link>
          {showSignup ? (
            <Button asChild size="sm" className="h-9 px-3.5">
              <Link href="/signup">Crear cuenta</Link>
            </Button>
          ) : null}
        </>
      )}
    </nav>
  )
}

export function LandingFooterAuthLinks({
  mutedClass,
}: {
  mutedClass: string
}) {
  const { user, isGuest, isLoading } = useAuth()
  const ready = !isLoading && user

  if (ready && !isGuest) {
    return (
      <Link href="/trips" className={cn("text-sm", mutedClass)}>
        Tus viajes
      </Link>
    )
  }

  return (
    <>
      {ready && isGuest ? (
        <Link href="/trips" className={cn("text-sm", mutedClass)}>
          Seguir con mi viaje
        </Link>
      ) : null}
      <Link href="/login" className={cn("text-sm", mutedClass)}>
        Entrar
      </Link>
    </>
  )
}
