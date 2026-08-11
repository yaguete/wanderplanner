"use client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { TripProvider } from "@/lib/trip-context"
import { TripChromeProvider } from "@/lib/trip-chrome-context"
import { RegistrationGateProvider } from "@/components/auth/registration-gate"
import { useIsMobile } from "@/hooks/use-mobile"

function TripsShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <AppHeader />
      <div className="flex min-h-0 flex-1">
        {!isMobile ? <AppSidebar /> : null}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}

export default function TripsLayout({ children }: { children: React.ReactNode }) {
  return (
    <TripProvider>
      <RegistrationGateProvider>
        <TripChromeProvider>
          <TooltipProvider delayDuration={0}>
            <TripsShell>{children}</TripsShell>
          </TooltipProvider>
        </TripChromeProvider>
      </RegistrationGateProvider>
    </TripProvider>
  )
}
