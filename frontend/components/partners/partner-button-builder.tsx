"use client"

import { useMemo, useState } from "react"
import { Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { isTurnstileEnabled, Turnstile } from "@/components/auth/turnstile"
import {
  buildEmbedSnippet,
  buildStartUrl,
  cleanSourceUrl,
  normalizeRefSlug,
  partnerButtonPreviewStyles,
} from "@/lib/partner-button"
import { MAX_AUTO_DAYS, parseDaysParam } from "@/lib/partner-trip"
import { prewarmSource, type PrewarmResult } from "@/lib/partners-api"

const DEFAULT_LABEL = "Planifica esta ruta con WanderPlanner"

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

function BrandSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 18c3-1.5 5-5 5-8.5C9 6 10.5 4 12 4s3 2 3 5.5C15 13 17 16.5 20 18" />
      <path d="M8.5 14.5c1.2.6 2.5.9 3.5.9s2.3-.3 3.5-.9" />
    </svg>
  )
}

function ButtonPreview({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={partnerButtonPreviewStyles.anchor}
    >
      <span style={partnerButtonPreviewStyles.iconBox}>
        <BrandSvg />
      </span>
      <span>{DEFAULT_LABEL}</span>
    </a>
  )
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
      snippet: buildEmbedSnippet({ href: startUrl, label: DEFAULT_LABEL }),
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
      setError("Introduce un slug de partner (p. ej. lacosmopolilla).")
      return
    }
    if (daysRaw.trim() && forcedDays == null) {
      setError(`La duración debe ser un número entero entre 1 y ${MAX_AUTO_DAYS}.`)
      return
    }
    if (captchaEnabled && !captchaToken && !skipPrewarm) {
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
      const message =
        e instanceof Error ? e.message : "No se pudo sintetizar la fuente"
      setError(message)
      setAllowSkip(true)
    } finally {
      setSubmitting(false)
      setProgress(null)
      resetCaptcha()
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          void handleGenerate(false)
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="partner-url">URL del post</Label>
            <Input
              id="partner-url"
              type="url"
              required
              placeholder="https://tublog.com/ruta-7-dias/"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="partner-ref">Slug de partner</Label>
            <Input
              id="partner-ref"
              required
              placeholder="aliasdelpartner"
              value={refSlug}
              onChange={(e) => setRefSlug(e.target.value)}
              disabled={submitting}
            />
            {normalizedRef && normalizedRef !== refSlug.trim() ? (
              <p className="text-xs text-muted-foreground">
                Se usará como <code className="text-foreground">{normalizedRef}</code>
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="partner-days">
              Duración en días <span className="font-normal text-muted-foreground">(opcional)</span>
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
              onChange={(e) => setDaysRaw(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              Solo rellénalo si quieres forzar una duración distinta a la del artículo (1–
              {MAX_AUTO_DAYS}).
            </p>
          </div>
        </div>

        {captchaEnabled ? (
          <Turnstile resetKey={turnstileKey} onToken={setCaptchaToken} />
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {progress ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            {progress}
          </p>
        ) : null}

        <Button
          type="submit"
          className="mt-1 h-11"
          disabled={submitting || (captchaEnabled && !captchaToken)}
        >
          {submitting ? "Generando…" : "Generar mi botón"}
        </Button>

        {allowSkip ? (
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            onClick={() => void handleGenerate(true)}
            disabled={submitting}
          >
            Generar igualmente (sin precalentar)
          </Button>
        ) : null}
      </form>

      {generated ? (
        <div className="flex flex-col gap-5 border-t border-border pt-6">
          {generated.prewarm ? (
            <p className="text-sm text-muted-foreground">
              Ruta ya sintetizada
              {generated.prewarm.destination ? (
                <>
                  : <span className="font-medium text-foreground">{generated.prewarm.destination}</span>
                </>
              ) : null}
              {generated.prewarm.items > 0 ? (
                <>
                  {" "}
                  · {generated.prewarm.items} ítems
                </>
              ) : null}
              . El primer lector entrará sin esperar.
              {generated.prewarm.status === "cached" ? (
                <span className="block mt-1 text-xs">Ya estaba en caché.</span>
              ) : null}
            </p>
          ) : generated.skippedPrewarm ? (
            <p className="text-sm text-muted-foreground">
              Enlace y snippet listos. La síntesis se hará cuando el primer lector pulse el botón.
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="partner-start-url">Enlace completo</Label>
            <div className="flex gap-2">
              <Input
                id="partner-start-url"
                readOnly
                value={generated.startUrl}
                className="font-mono text-base md:text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                aria-label="Copiar enlace"
                onClick={() => void copyText(generated.startUrl, "Enlace copiado")}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="partner-snippet">Snippet HTML (WordPress)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void copyText(generated.snippet, "Snippet copiado")}
              >
                <Copy className="size-3.5" />
                Copiar
              </Button>
            </div>
            <pre
              id="partner-snippet"
              className="max-h-40 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground"
            >
              {generated.snippet}
            </pre>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Vista previa</p>
            <ButtonPreview href={generated.startUrl} />
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            Pega el snippet en un bloque HTML de tu post. El botón abre WanderPlanner en una
            pestaña nueva.
          </p>
        </div>
      ) : null}
    </div>
  )
}
