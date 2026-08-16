"use client"

import { useEffect, useState } from "react"
import { Analytics } from "@vercel/analytics/next"
import {
  CONSENT_CHANGED_EVENT,
  isAnalyticsAllowed,
  readConsent,
} from "@/lib/cookie-consent"

export function AnalyticsGate() {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const sync = () => setAllowed(isAnalyticsAllowed(readConsent()))
    sync()
    window.addEventListener(CONSENT_CHANGED_EVENT, sync)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, sync)
  }, [])

  if (!allowed) return null
  return <Analytics />
}
