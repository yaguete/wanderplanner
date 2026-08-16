"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { isTurnstileEnabled, Turnstile } from "@/components/auth/turnstile"
import {
  PARTNER_BUTTON_LABEL,
  PartnerButtonPreview,
} from "@/components/partners/partner-button-preview"
import {
  buildEmbedSnippet,
  buildStartUrl,
  cleanSourceUrl,
  normalizeRefSlug,
} from "@/lib/partner-button"
import { MAX_AUTO_DAYS, isReservedRefSlug, parseDaysParam } from "@/lib/partner-trip"
import { prewarmSource, type PrewarmResult } from "@/lib/partners-api"
import { cn } from "@/lib/utils"

const fieldClass =
  "border-white/15 bg-white/5 text-white placeholder:text-white/40 ring-offset-[hsl(20_8%_11%)]"

const iconBtnClass =
  "shrink-0 border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"

function appOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_APP_ORIGIN || "").trim().replace(/\/$/, "")
  if (configured) return configured
  if (typeof window !== "undefined") return window.location.origin
  return "https://wanderplanner.ai"
}

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(success)
  } catch {
    toast.error("No se pudo copiar al portapapeles")
  }
}

type Generated = {
  startUrl: string
  snippet: string
  prewarm: PrewarmResult | null
  skippedPrewarm: boolean
}

export function PartnerButtonBuilder() {
  const [sourceUrl, setSourceUrl] = useState("")
  const [refSlug, setRefSlug] = useState("")
  const [daysRaw, setDaysRaw] = useState("")
  const [showDays, setShowDays] = useState(false)
  const [showCaptcha, setShowCaptcha] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [turnstileKey, setTurnstileKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detectedDays, setDetectedDays] = useState<number | null>(null)
  const [generated, setGenerated] = useState<Generated | null>(null)
  const [allowSkip, setAllowSkip] = useState(false)

  const captchaEnabled = isTurnstileEnabled()
  const cleanedUrl = useMemo(() => cleanSourceUrl(sourceUrl), [sourceUrl])
  const normalizedRef = useMemo(() => normalizeRefSlug(refSlug), [refSlug])
  const forcedDays = parseDaysParam(daysRaw || null)

  function armCaptcha() {
    if (captchaEnabled) setShowCaptcha(true)
  }

  function resetCaptcha() {
    setCaptchaToken(null)
    setTurnstileKey((k) => k + 1)
  }

  function buildOutputs(prewarm: PrewarmResult | null, skipped: boolean): Generated {
    const origin = appOrigin()
    const startUrl = buildStartUrl({
      origin,
      sourceUrl: cleanedUrl,
      ref: normalizedRef,
      days: forcedDays,
    })
    return {
      startUrl,
      snippet: buildEmbedSnippet({ href: startUrl, label: PARTNER_BUTTON_LABEL }),
      prewarm,
      skippedPrewarm: skipped,
    }
  }

  async function handleGenerate(skipPrewarm: boolean) {
    setError(null)
    setAllowSkip(false)

    if (!cleanedUrl || !/^https?:\/\//i.test(cleanedUrl)) {
      setError("Introduce la URL completa del post (https://…).")
      return
    }
    if (!normalizedRef) {
      setError("Introduce un slug de partner (p. ej. tu-blog).")
      return
    }
    if (isReservedRefSlug(normalizedRef)) {
      setError("Ese slug está reservado. Elige el nombre de tu blog.")
      return
    }
    if (daysRaw.trim() && forcedDays == null) {
      setError(`La duración debe ser un número entero entre 1 y ${MAX_AUTO_DAYS}.`)
      return
    }
    if (captchaEnabled && !captchaToken && !skipPrewarm) {
      armCaptcha()
      setError("Completa el captcha antes de generar.")
      return
    }

    if (skipPrewarm) {
      setGenerated(buildOutputs(null, true))
      return
    }

    setSubmitting(true)
    setProgress("Leyendo el artículo…")
    try {
      const result = await prewarmSource(cleanedUrl, {
        captchaToken,
        onProgress: setProgress,
      })
      if (
        typeof result.total_days === "number" &&
        result.total_days >= 1 &&
        result.total_days <= MAX_AUTO_DAYS
      ) {
        setDetectedDays(Math.floor(result.total_days))
      } else {
        setDetectedDays(null)
      }
      setGenerated(buildOutputs(result, false))
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo sintetizar la fuente"
      setError(message)
      setAllowSkip(true)
    } finally {
      setSubmitting(false)
      setProgress(null)
      resetCaptcha()
    }
  }

  return (
    <div className="flex min-h-[22rem] flex-col justify-center sm:min-h-[20rem]">
      {generated ? (
        <div className="flex flex-col gap-5">
          {generated.prewarm ? (
            <p className="text-sm text-white/70">
              Ruta ya sintetizada
              {generated.prewarm.destination ? (
                <>
                  :{" "}
                  <span className="font-medium text-white">{generated.prewarm.destination}</span>
                </>
              ) : null}
              {generated.prewarm.items > 0 ? <> · {generated.prewarm.items} ítems</> : null}. El
              primer lector entrará sin esperar.
              {generated.prewarm.status === "cached" ? (
                <span className="mt-1 block text-xs text-white/60">Ya estaba en caché.</span>
              ) : null}
            </p>
          ) : generated.skippedPrewarm ? (
            <p className="text-sm text-white/70">
              Enlace y snippet listos. La síntesis se hará cuando el primer lector pulse el botón.
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="partner-start-url" className="text-white">
              Enlace completo
            </Label>
            <div className="flex gap-2">
              <Input
                id="partner-start-url"
                readOnly
                value={generated.startUrl}
                className={cn(fieldClass, "font-mono text-base md:text-xs")}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={iconBtnClass}
                aria-label="Copiar enlace"
                onClick={() => void copyText(generated.startUrl, "Enlace copiado")}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="partner-snippet" className="text-white">
                Snippet HTML (WordPress)
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-white/70 hover:bg-white/10 hover:text-white"
                onClick={() => void copyText(generated.snippet, "Snippet copiado")}
              >
                <Copy className="size-3.5" />
                Copiar
              </Button>
            </div>
            <pre
              id="partner-snippet"
              className="max-h-40 overflow-auto rounded-md border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-white/80"
            >
              {generated.snippet}
            </pre>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-white">Vista previa</p>
            <PartnerButtonPreview href={generated.startUrl} />
          </div>

          <p className="flex items-start gap-2 text-xs text-white/60">
            <Check className="mt-0.5 size-3.5 shrink-0 text-white" aria-hidden />
            Pega el snippet en un bloque HTML de tu post. El botón abre WanderPlanner en una
            pestaña nueva.
          </p>

          <Button
            type="button"
            variant="ghost"
            className="h-10 self-start text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => {
              setGenerated(null)
              setAllowSkip(false)
              setError(null)
              resetCaptcha()
            }}
          >
            Generar otro botón
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            void handleGenerate(false)
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="partner-url" className="text-white">
                URL del post
              </Label>
              <Input
                id="partner-url"
                type="url"
                required
                placeholder="https://tublog.com/ruta-7-dias/"
                value={sourceUrl}
                onChange={(e) => {
                  armCaptcha()
                  setSourceUrl(e.target.value)
                }}
                onFocus={armCaptcha}
                disabled={submitting}
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="partner-ref" className="text-white">
                Slug de partner
              </Label>
              <Input
                id="partner-ref"
                required
                placeholder="aliasdelpartner"
                value={refSlug}
                onChange={(e) => {
                  armCaptcha()
                  setRefSlug(e.target.value)
                }}
                onFocus={armCaptcha}
                disabled={submitting}
                className={fieldClass}
              />
              {normalizedRef && normalizedRef !== refSlug.trim() ? (
                <p className="text-xs text-white/60">
                  Se usará como <code className="text-white">{normalizedRef}</code>
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-white/60 hover:text-white"
              aria-expanded={showDays}
              onClick={() => setShowDays((open) => !open)}
            >
              ¿Forzar duración?
              <ChevronDown
                className={cn("size-3.5 transition-transform", showDays && "rotate-180")}
                aria-hidden
              />
            </button>
            {showDays ? (
              <div className="mt-2 flex flex-col gap-1.5">
                <Label htmlFor="partner-days" className="sr-only">
                  Duración en días
                </Label>
                <Input
                  id="partner-days"
                  type="text"
                  inputMode="numeric"
                  placeholder={
                    detectedDays != null
                      ? `El artículo declara ${detectedDays} días — déjalo vacío para usarlos`
                      : "Déjalo vacío para adoptar los del artículo"
                  }
                  value={daysRaw}
                  onChange={(e) => {
                    armCaptcha()
                    setDaysRaw(e.target.value)
                  }}
                  onFocus={armCaptcha}
                  disabled={submitting}
                  className={fieldClass}
                />
                <p className="text-xs text-white/60">
                  Solo si quieres una duración distinta a la del artículo (1–{MAX_AUTO_DAYS}).
                </p>
              </div>
            ) : null}
          </div>

          {captchaEnabled && showCaptcha ? (
            <Turnstile resetKey={turnstileKey} onToken={setCaptchaToken} theme="dark" />
          ) : null}

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {progress ? (
            <p className="flex items-center gap-2 text-sm text-white/70">
              <Spinner className="size-4" />
              {progress}
            </p>
          ) : null}

          <Button
            type="submit"
            className="mt-1 h-11 bg-white text-[hsl(20_8%_14%)] hover:bg-white/90"
            disabled={submitting || (captchaEnabled && (!showCaptcha || !captchaToken))}
          >
            {submitting ? "Generando…" : "Generar mi botón"}
          </Button>

          {allowSkip ? (
            <Button
              type="button"
              variant="ghost"
              className="h-10 text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => void handleGenerate(true)}
              disabled={submitting}
            >
              Generar igualmente (sin precalentar)
            </Button>
          ) : null}
        </form>
      )}
    </div>
  )
}
