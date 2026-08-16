"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  CONSENT_CHANGED_EVENT,
  CONSENT_OPEN_EVENT,
  readConsent,
  writeConsent,
  type ConsentChoice,
} from "@/lib/cookie-consent"
import { cn } from "@/lib/utils"

export function CookieBanner() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const sync = () => setVisible(readConsent() === null)
    sync()
    const onOpen = () => setVisible(true)
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen)
    window.addEventListener(CONSENT_CHANGED_EVENT, sync)
    return () => {
      window.removeEventListener(CONSENT_OPEN_EVENT, onOpen)
      window.removeEventListener(CONSENT_CHANGED_EVENT, sync)
    }
  }, [])

  const choose = (choice: ConsentChoice) => {
    writeConsent(choice)
    setVisible(false)
  }

  if (!visible) return null

  const onTripDetail = Boolean(pathname && /^\/trips\/[^/]+/.test(pathname))

  return (
    <div
      role="region"
      aria-label="Cookies"
      className={cn(
        "cookie-banner fixed z-[45] max-w-md rounded-2xl border border-border/80 bg-background p-4 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.28)] sm:p-5",
        "left-4 right-4 sm:left-6 sm:right-auto",
        "bottom-[max(1rem,env(safe-area-inset-bottom))]",
        onTripDetail && "max-md:bottom-[var(--wp-nav-clearance)]",
      )}
    >
      <p className="text-pretty text-sm leading-5 text-foreground/80">
        ¿Nos dejas registrar tu visita? Nos permite entender qué funciona para mejorar el servicio.{" "}
        <Link href="/legal/cookies" className="font-medium text-foreground underline underline-offset-4">
          Cookies
        </Link>
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button type="button" className="h-10" onClick={() => choose("all")}>
          Aceptar
        </Button>
        <Button type="button" variant="outline" className="h-10" onClick={() => choose("necessary")}>
          No, gracias
        </Button>
      </div>
    </div>
  )
}
