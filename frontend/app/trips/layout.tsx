"use client"

import { useState } from "react"
import { Menu } from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { TripProvider } from "@/lib/trip-context"
import { useIsMobile } from "@/hooks/use-mobile"

function TripsShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader
        leading={
          isMobile ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Abrir menú"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          ) : null
        }
      />
      <div className="flex min-h-0 flex-1">
        {!isMobile ? <AppSidebar /> : null}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </div>

      {isMobile ? (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[min(18rem,88vw)] p-0">
            <SheetTitle className="sr-only">Navegación</SheetTitle>
            <AppSidebar className="w-full border-0" onNavigate={() => setSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}

export default function TripsLayout({ children }: { children: React.ReactNode }) {
  return (
    <TripProvider>
      <TooltipProvider delayDuration={0}>
        <TripsShell>{children}</TripsShell>
      </TooltipProvider>
    </TripProvider>
  )
}
