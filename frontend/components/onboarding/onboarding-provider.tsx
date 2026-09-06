"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { track } from "@vercel/analytics"
import { useRegistrationGate } from "@/components/auth/registration-gate"
import { useAuth } from "@/lib/auth-context"
import {
  claimAutoShow,
  hasLocalUserOnboardingSeen,
  isTripDetailPath,
  markOnboardingSeen,
  ONBOARDING_OPEN_EVENT,
  onboardingCta,
  persistLocalUserOnboardingSeen,
  promoteGuestOnboarding,
  type OnboardingCtaAction,
  type OnboardingOutcome,
  type OnboardingTrigger,
} from "@/lib/onboarding"
import { fetchOnboardingSeen, recordOnboardingSeen } from "@/lib/onboarding-persist"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { tripIdFromPath } from "@/lib/trip-paths"
import { useTrips } from "@/lib/trip-context"
import { isAssistantFirstVisitor } from "@/lib/trip-entry-layout"
import { OnboardingDialog } from "./onboarding-dialog"

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, isGuest, isLoading: authLoading } = useAuth()
  const { isOpen: gateOpen } = useRegistrationGate()
  const { trips, isLoading: tripsLoading, getTripSources, pendingSources } = useTrips()
  const [open, setOpen] = useState(false)
  const [trigger, setTrigger] = useState<OnboardingTrigger>("auto")
  const [profileSeen, setProfileSeen] = useState<boolean | null>(null)
  const wasGuestRef = useRef(isGuest)

  const tripId = tripIdFromPath(pathname)
  const sourceCount = tripId ? getTripSources(tripId).length : 0
  const loadingPendingCount = tripId
    ? pendingSources.filter((p) => p.tripId === tripId && p.status === "loading").length
    : 0

  const cta: OnboardingCtaAction = onboardingCta({
    sourceCount,
    loadingPendingCount,
    assistantFirst: isAssistantFirstVisitor({
      isGuest,
      tripsLoading,
      activeTripCount: trips.filter((t) => !t.archived).length,
    }),
  })
  const mode = isGuest ? "guest" : "user"
  const userId = user?.id ?? null

  useEffect(() => {
    if (wasGuestRef.current && !isGuest && userId) {
      promoteGuestOnboarding({
        userId,
        session: window.sessionStorage,
        local: window.localStorage,
      })
      if (hasLocalUserOnboardingSeen(window.localStorage, userId)) {
        setProfileSeen(true)
        if (isSupabaseConfigured()) {
          void recordOnboardingSeen(createClient(), userId)
        }
      }
    }
    wasGuestRef.current = isGuest
  }, [isGuest, userId])

  useEffect(() => {
    if (authLoading) return
    if (isGuest || !userId) {
      setProfileSeen(null)
      return
    }
    if (hasLocalUserOnboardingSeen(window.localStorage, userId)) {
      setProfileSeen(true)
      if (isSupabaseConfigured()) {
        void recordOnboardingSeen(createClient(), userId)
      }
      return
    }
    if (!isSupabaseConfigured()) {
      setProfileSeen(false)
      return
    }
    let cancelled = false
    void fetchOnboardingSeen(createClient(), userId).then((seen) => {
      if (cancelled) return
      if (hasLocalUserOnboardingSeen(window.localStorage, userId) || seen === true) {
        persistLocalUserOnboardingSeen(window.localStorage, userId)
        setProfileSeen(true)
        if (seen !== true && isSupabaseConfigured()) {
          void recordOnboardingSeen(createClient(), userId)
        }
        return
      }
      setProfileSeen(seen)
    })
    return () => {
      cancelled = true
    }
  }, [authLoading, isGuest, userId])

  const tryAutoShow = useCallback(() => {
    if (typeof window === "undefined") return
    if (
      !claimAutoShow({
        route: isTripDetailPath(pathname) ? "trip-detail" : "other",
        authLoading,
        isGuest,
        userId,
        gateOpen,
        now: Date.now(),
        session: window.sessionStorage,
        local: window.localStorage,
        profileSeen: isGuest ? false : profileSeen,
      })
    ) {
      return
    }
    setTrigger("auto")
    setOpen(true)
    if (!isGuest && userId && isSupabaseConfigured()) {
      void recordOnboardingSeen(createClient(), userId)
    }
  }, [pathname, authLoading, isGuest, userId, gateOpen, profileSeen])

  useEffect(() => {
    if (open) return
    tryAutoShow()
  }, [tryAutoShow, open])

  useEffect(() => {
    const onReplay = () => {
      setTrigger("replay")
      setOpen(true)
    }
    window.addEventListener(ONBOARDING_OPEN_EVENT, onReplay)
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, onReplay)
  }, [])

  useEffect(() => {
    if (!open) return
    const html = document.documentElement
    const already = html.dataset.wpScrollLock === "1"
    html.dataset.wpScrollLock = "1"
    return () => {
      if (!already) delete html.dataset.wpScrollLock
    }
  }, [open])

  const handleClose = useCallback(
    (outcome: OnboardingOutcome, lastSlide: number) => {
      setOpen(false)
      markOnboardingSeen({
        isGuest,
        userId,
        trigger,
        outcome,
        now: Date.now(),
        session: window.sessionStorage,
        local: window.localStorage,
      })
      if (!isGuest && userId && isSupabaseConfigured()) {
        void recordOnboardingSeen(createClient(), userId)
      }
      track("onboarding_slide", { index: lastSlide })
      track("onboarding_done", { outcome, lastSlide })
    },
    [isGuest, userId, trigger],
  )

  const dialog = open ? (
    <OnboardingDialog
      open={open}
      mode={mode}
      trigger={trigger}
      cta={cta}
      onClose={handleClose}
    />
  ) : null

  return (
    <>
      {children}
      {dialog}
    </>
  )
}
