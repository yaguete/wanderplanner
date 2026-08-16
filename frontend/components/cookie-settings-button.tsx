"use client"

import { openConsentBanner } from "@/lib/cookie-consent"

export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={openConsentBanner}>
      Configurar
    </button>
  )
}
