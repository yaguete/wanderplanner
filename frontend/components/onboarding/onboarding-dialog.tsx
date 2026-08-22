"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react"
import { ArrowLeft, ArrowRight, X } from "lucide-react"
import { track } from "@vercel/analytics"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { BRAND_INK, BrandMark, BrandWordmark } from "@/components/brand-mark"
import {
  type OnboardingCtaAction,
  type OnboardingMode,
  type OnboardingOutcome,
  type OnboardingTrigger,
  focusSourceRutaFromOnboarding,
  openAddSourceFromOnboarding,
  revealSourcesFromOnboarding,
} from "@/lib/onboarding"
import { cn } from "@/lib/utils"
import { ONBOARDING_SLIDES } from "./onboarding-slides"

const SLIDE_COUNT = ONBOARDING_SLIDES.length
const SWIPE_PX = 48

const CTA_LABEL: Record<OnboardingCtaAction, string> = {
  add_source: "Empieza a planificar",
  view_extraction: "Ver cómo va",
  view_trip: "Ir a la ruta",
}

export function OnboardingDialog({
  open,
  mode,
  trigger,
  cta,
  onClose,
}: {
  open: boolean
  mode: OnboardingMode
  trigger: OnboardingTrigger
  cta: OnboardingCtaAction
  onClose: (outcome: OnboardingOutcome, lastSlide: number) => void
}) {
  const [index, setIndex] = useState(0)
  const maxIndexRef = useRef(0)
  const closeReasonRef = useRef<OnboardingOutcome | null>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const touchStartX = useRef<number | null>(null)
  const last = index === SLIDE_COUNT - 1
  const finishedRef = useRef(false)

  useEffect(() => {
    track("onboarding_shown", { mode, trigger })
  }, [mode, trigger])

  const goTo = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(SLIDE_COUNT - 1, next))
    setIndex(clamped)
    if (clamped > maxIndexRef.current) maxIndexRef.current = clamped
  }, [])

  const finish = useCallback(
    (outcome: OnboardingOutcome) => {
      if (finishedRef.current) return
      finishedRef.current = true
      closeReasonRef.current = outcome
      onClose(outcome, maxIndexRef.current)
    },
    [onClose],
  )

  const runCta = useCallback(() => {
    track("onboarding_cta", {
      action: cta === "add_source" ? "add_source" : "view_trip",
    })
    finish("completed")
    queueMicrotask(() => {
      if (cta === "add_source") openAddSourceFromOnboarding()
      else if (cta === "view_extraction") revealSourcesFromOnboarding()
      else focusSourceRutaFromOnboarding()
    })
  }, [cta, finish])

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault()
        if (last) runCta()
        else goTo(index + 1)
      } else if (event.key === "ArrowLeft") {
        event.preventDefault()
        goTo(index - 1)
      }
    },
    [goTo, index, last, runCta],
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) finish(closeReasonRef.current ?? "dismissed")
      }}
    >
      <DialogContent
        hideClose
        fullscreenOnMobile
        overlayClassName="bg-black/45"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          primaryRef.current?.focus()
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "gap-0 bg-background p-0 sm:max-w-[52rem]",
          "sm:data-[state=open]:zoom-in-95",
        )}
      >
        <div className="relative min-h-0 flex-1 sm:h-[min(90vh,36rem)] sm:flex-none">
          <div
            className="absolute inset-0 overflow-hidden"
            onTouchStart={(event) => {
              touchStartX.current = event.changedTouches[0]?.clientX ?? null
            }}
            onTouchEnd={(event) => {
              const start = touchStartX.current
              touchStartX.current = null
              if (start == null) return
              const dx = (event.changedTouches[0]?.clientX ?? start) - start
              if (dx <= -SWIPE_PX) goTo(index + 1)
              else if (dx >= SWIPE_PX) goTo(index - 1)
            }}
          >
            <div
              className="flex h-full w-full transition-transform duration-300 ease-out motion-reduce:transition-none"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {ONBOARDING_SLIDES.map((item, i) => {
                const Mock = item.Mock
                const active = i === index
                const isLastSlide = i === SLIDE_COUNT - 1
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex min-h-0 min-w-full shrink-0 basis-full flex-col px-4",
                      "pt-14 sm:flex-row sm:items-center sm:gap-8 sm:px-8 sm:pt-12",
                      isLastSlide
                        ? "pb-[7.5rem] sm:pb-16"
                        : "pb-[4.75rem] sm:pb-16",
                    )}
                    aria-hidden={!active}
                  >
                    <div className="order-2 mt-5 shrink-0 sm:order-1 sm:mt-0 sm:min-w-0 sm:flex-1">
                      <span className="mb-3 flex min-w-0 items-end gap-2">
                        <BrandMark className="h-12" />
                        {item.id === "mecanismo" ? (
                          <BrandWordmark className="-mb-[0.12em]" />
                        ) : item.kicker ? (
                          <span
                            className="-mb-[0.12em] truncate text-xl font-light leading-none tracking-tight"
                            style={{ color: BRAND_INK }}
                          >
                            {item.kicker}
                          </span>
                        ) : null}
                      </span>
                      {active ? (
                        <>
                          <DialogTitle className="text-balance text-lg font-semibold tracking-tight sm:text-2xl">
                            {item.title}
                          </DialogTitle>
                          <DialogDescription className="mt-1.5 text-pretty text-sm leading-6 text-foreground/75 sm:mt-2">
                            {item.body}
                          </DialogDescription>
                          <p className="mt-1.5 hidden text-pretty text-sm leading-5 text-muted-foreground sm:mt-2 sm:block">
                            {item.footer}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-balance text-lg font-semibold tracking-tight sm:text-2xl">
                            {item.title}
                          </p>
                          <p className="mt-1.5 text-pretty text-sm leading-6 text-foreground/75 sm:mt-2">
                            {item.body}
                          </p>
                          <p className="mt-1.5 hidden text-pretty text-sm leading-5 text-muted-foreground sm:mt-2 sm:block">
                            {item.footer}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="order-1 flex min-h-[11rem] min-w-0 flex-1 items-stretch justify-center px-1 py-3 sm:order-2 sm:min-h-0 sm:flex-none sm:items-center sm:p-6">
                      <Mock />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-transparent px-4 pb-1 pt-3 sm:px-6 sm:pt-4">
            <button
              type="button"
              className="pointer-events-auto text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => finish("skipped")}
            >
              Saltar
            </button>
            <button
              type="button"
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Cerrar"
              onClick={() => finish("dismissed")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            className="sr-only"
            aria-live="polite"
          >
            {index + 1} de {SLIDE_COUNT}
          </div>

          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 bg-transparent px-4 py-3 sm:px-6",
              "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
              last && "max-sm:flex-wrap",
            )}
          >
            {index === 0 ? (
              <span className="h-10 w-10 shrink-0" aria-hidden />
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="pointer-events-auto h-10 w-10 shrink-0 rounded-full"
                aria-label="Slide anterior"
                onClick={() => goTo(index - 1)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}

            <div className="pointer-events-auto flex flex-1 items-center justify-center gap-2">
              {ONBOARDING_SLIDES.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Ir a la slide ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    i === index ? "w-5" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50",
                  )}
                  style={i === index ? { backgroundColor: BRAND_INK } : undefined}
                  onClick={() => goTo(i)}
                />
              ))}
            </div>

            {last ? (
              <Button
                ref={primaryRef}
                type="button"
                className="pointer-events-auto h-10 shrink-0 rounded-full px-4 max-sm:w-full"
                onClick={runCta}
              >
                {CTA_LABEL[cta]}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                ref={primaryRef}
                type="button"
                size="icon"
                className="pointer-events-auto h-10 w-10 shrink-0 rounded-full"
                aria-label="Siguiente slide"
                onClick={() => goTo(index + 1)}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
