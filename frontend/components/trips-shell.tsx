"use client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { TripProvider } from "@/lib/trip-context"
import { TripChromeProvider } from "@/lib/trip-chrome-context"
import { RegistrationGateProvider } from "@/components/auth/registration-gate"
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider"
import { useIsMobile } from "@/hooks/use-mobile"

function TripsChrome({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile()

  return (
    /*
     * Móvil: el documento es el scroller. Un shell `h-screen overflow-hidden`
     * deja el root sin overflow y entonces ni Safari ni Chrome colapsan su
     * barra de direcciones — solo la atan al root scroller, nunca a uno
     * anidado. `svh` y no `vh`: en iOS `100vh` es el viewport *grande* (barra
     * ya colapsada), un alto que este shell no llega a ocupar.
     *
     * Los breakpoints van en CSS, no en `useIsMobile()`: el hook devuelve
     * `false` en el primer render y el shell parpadearía al hidratar.
     */
    <div className="flex min-h-[100svh] flex-col bg-canvas md:h-screen md:overflow-hidden">
      <AppHeader />
      <div className="flex flex-1 md:min-h-0">
        {!isMobile ? <AppSidebar /> : null}
        <main className="flex min-w-0 flex-1 flex-col md:min-h-0">{children}</main>
      </div>
    </div>
  )
}

/** Shell cliente de `/trips` y `/account` (perfil y settings): providers + cromo. El layout es Server Component por el `noindex`. */
export function TripsShell({ children }: { children: React.ReactNode }) {
  return (
    <TripProvider>
      <RegistrationGateProvider>
        <OnboardingProvider>
          <TripChromeProvider>
            <TooltipProvider delayDuration={0}>
              <TripsChrome>{children}</TripsChrome>
            </TooltipProvider>
          </TripChromeProvider>
        </OnboardingProvider>
      </RegistrationGateProvider>
    </TripProvider>
  )
}
