"use client"

/**
 * Cápsula de arranque del hero. Tres chips (artículo / destino / cuenta).
 * La pestaña 1 es un form GET nativo a `/start`: convierte aunque la isla no hidrate.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { track } from "@vercel/analytics"
import { ArrowRight, Loader2 } from "lucide-react"
import { SignupForm } from "@/components/auth/signup-form"
import { Turnstile, isTurnstileEnabled } from "@/components/auth/turnstile"
import { SourceSuggestList } from "@/components/source-suggest-list"
import { cleanSourceUrl } from "@/lib/partner-button"
import { LANDING_REF } from "@/lib/partner-trip"
import {
  isSourceSuggestEnabled,
  isSourceSuggestWebEnabled,
  suggestSources,
  type SourceSuggestHit,
} from "@/lib/source-suggest"
import { cn } from "@/lib/utils"

type StartTab = "article" | "destination" | "signup"

const TABS: { id: StartTab; label: string; mobileLines: [string, string] }[] = [
  { id: "article", label: "Añade una fuente", mobileLines: ["Añade una", "fuente"] },
  { id: "destination", label: "Busca un destino", mobileLines: ["Busca un", "destino"] },
  { id: "signup", label: "Crea tu cuenta", mobileLines: ["Crea tu", "cuenta"] },
]

function visibleTabs(): { id: StartTab; label: string; mobileLines: [string, string] }[] {
  if (isSourceSuggestEnabled()) return TABS
  return TABS.filter((tab) => tab.id !== "destination")
}

export function LandingStart() {
  const router = useRouter()
  const baseId = useId()
  const tabs = visibleTabs()
  const [tab, setTab] = useState<StartTab>("article")
  const [urlValue, setUrlValue] = useState("")
  const [urlError, setUrlError] = useState<string | null>(null)
  const [destValue, setDestValue] = useState("")
  const [destError, setDestError] = useState<string | null>(null)
  const [destLoading, setDestLoading] = useState(false)
  const [destResults, setDestResults] = useState<SourceSuggestHit[] | null>(null)
  const [needCaptcha, setNeedCaptcha] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const destInputRef = useRef<HTMLInputElement>(null)
  const interactedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const webEnabled = isSourceSuggestWebEnabled()
  const showWebCaptcha = webEnabled && needCaptcha && isTurnstileEnabled()

  const selectTab = useCallback((next: StartTab, fromUser: boolean) => {
    setTab(next)
    if (fromUser) interactedRef.current = true
  }, [])

  useEffect(() => {
    if (!interactedRef.current) return
    if (tab === "article") urlInputRef.current?.focus()
    if (tab === "destination") destInputRef.current?.focus()
  }, [tab])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const onUrlSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (typeof window === "undefined") return
    event.preventDefault()
    const cleaned = cleanSourceUrl(urlValue)
    if (!/^https?:\/\//i.test(cleaned)) {
      setUrlError("Introduce la URL completa del artículo (https://…).")
      return
    }
    setUrlError(null)
    track("landing_start_submit", { tab: "article" })
    const params = new URLSearchParams({ source: cleaned, ref: LANDING_REF })
    router.push(`/start?${params.toString()}`)
  }

  const runSuggest = useCallback(
    async (query: string, token: string | null) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setDestLoading(true)
      setDestError(null)
      try {
        const response = await suggestSources(query, {
          captchaToken: token,
          signal: controller.signal,
        })
        setDestResults(response.results)
        setNeedCaptcha(response.needCaptcha)
        if (response.needCaptcha) {
          setCaptchaToken(null)
          setCaptchaKey((key) => key + 1)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setDestResults([])
        setDestError(
          error instanceof Error && error.message
            ? error.message
            : "No hemos podido buscar artículos. Inténtalo de nuevo.",
        )
      } finally {
        setDestLoading(false)
      }
    },
    [],
  )

  const onDestSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = destValue.trim()
    if (query.length < 3) {
      setDestError("Escribe al menos 3 letras del destino.")
      return
    }
    track("landing_start_submit", { tab: "destination" })
    void runSuggest(query, captchaToken)
  }

  useEffect(() => {
    if (!showWebCaptcha || !captchaToken || destValue.trim().length < 3) return
    void runSuggest(destValue.trim(), captchaToken)
  }, [captchaToken, destValue, runSuggest, showWebCaptcha])

  const onChipKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = index
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % tabs.length
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + tabs.length) % tabs.length
    } else if (event.key === "Home") {
      next = 0
    } else if (event.key === "End") {
      next = tabs.length - 1
    } else {
      return
    }
    event.preventDefault()
    selectTab(tabs[next].id, true)
    const button = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[
      next
    ]
    button?.focus()
  }

  const openHit = (hit: SourceSuggestHit) => {
    track("landing_start_submit", { tab: "destination", origin: hit.origin, instant: hit.instant })
    const params = new URLSearchParams({ source: hit.url, ref: LANDING_REF })
    router.push(`/start?${params.toString()}`)
  }

  const showDestOverlay =
    tab === "destination" && (destLoading || destError != null || destResults != null || showWebCaptcha)
  const showSignupOverlay = tab === "signup"

  return (
    <div id="empezar" className="relative z-20 mx-auto mt-10 w-full max-w-2xl scroll-mt-24">
      <div
        role="tablist"
        aria-label="Cómo quieres empezar"
        className="flex w-full rounded-full bg-background p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]"
      >
        {tabs.map((item, index) => {
          const selected = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                track("landing_start_tab", { tab: item.id })
                selectTab(item.id, true)
              }}
              onKeyDown={(event) => onChipKeyDown(event, index)}
              aria-label={item.label}
              className={cn(
                "min-w-0 flex-1 rounded-full px-1.5 py-2 text-[13px] font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "bg-foreground text-background"
                  : "text-foreground/55 hover:text-foreground",
              )}
            >
              <span className="block leading-[1.2] sm:hidden">
                {item.mobileLines[0]}
                <br />
                {item.mobileLines[1]}
              </span>
              <span className="hidden sm:block">{item.label}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        <div
          role="tabpanel"
          id={`${baseId}-panel-article`}
          aria-labelledby={`${baseId}-tab-article`}
          hidden={tab !== "article"}
        >
          <form method="GET" action="/start" onSubmit={onUrlSubmit} className="landing-start-field">
            <input type="hidden" name="ref" value={LANDING_REF} />
            <label htmlFor={`${baseId}-source`} className="sr-only">
              URL del artículo
            </label>
            <input
              ref={urlInputRef}
              id={`${baseId}-source`}
              name="source"
              type="url"
              inputMode="url"
              autoComplete="url"
              required
              placeholder="Pega la URL del artículo"
              value={urlValue}
              onChange={(e) => {
                setUrlValue(e.target.value)
                if (urlError) setUrlError(null)
              }}
              className="landing-start-input"
            />
            <button type="submit" className="landing-start-go" aria-label="Empezar con este artículo">
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </form>
          {urlError ? (
            <p className="mt-2 text-left text-sm text-destructive">{urlError}</p>
          ) : null}
          <p className="mt-2.5 text-pretty text-xs leading-5 text-foreground/50">
            Por ahora, un artículo de blog o revista de viaje. Pronto también Instagram, TikTok y
            YouTube.
          </p>
        </div>

        {isSourceSuggestEnabled() ? (
          <div
            role="tabpanel"
            id={`${baseId}-panel-destination`}
            aria-labelledby={`${baseId}-tab-destination`}
            hidden={tab !== "destination"}
          >
            <form onSubmit={onDestSubmit} className="landing-start-field">
              <label htmlFor={`${baseId}-dest`} className="sr-only">
                Destino
              </label>
              <input
                ref={destInputRef}
                id={`${baseId}-dest`}
                type="search"
                enterKeyHint="search"
                placeholder="Japón, Vietnam, Islandia…"
                value={destValue}
                onChange={(e) => {
                  const next = e.target.value
                  setDestValue(next)
                  if (destError) setDestError(null)
                  if (next.trim() !== "") return
                  // Sin query: cierra el panel (no hay búsqueda que mostrar).
                  abortRef.current?.abort()
                  setDestResults(null)
                  setDestLoading(false)
                  setNeedCaptcha(false)
                  setCaptchaToken(null)
                }}
                className="landing-start-input"
              />
              <button type="submit" className="landing-start-go" aria-label="Buscar artículos">
                {destLoading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <ArrowRight className="size-4" aria-hidden />
                )}
              </button>
            </form>
            {showDestOverlay ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-background p-3 text-left shadow-lg">
                {destError ? <p className="px-1 py-2 text-sm text-destructive">{destError}</p> : null}
                {destLoading && !destResults ? (
                  <p className="px-1 py-2 text-sm text-muted-foreground">Buscando artículos…</p>
                ) : null}
                {destResults && destResults.length === 0 && !destError ? (
                  <p className="px-1 py-2 text-sm text-muted-foreground">
                    No hemos encontrado artículos para ese destino. Prueba con otro nombre o pega una URL.
                  </p>
                ) : null}
                {destResults && destResults.length > 0 ? (
                  <SourceSuggestList hits={destResults} onSelect={openHit} />
                ) : null}
                {showWebCaptcha ? (
                  <div className="mt-3 flex justify-center">
                    <Turnstile
                      key={captchaKey}
                      onToken={setCaptchaToken}
                      appearance="interaction-only"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          role="tabpanel"
          id={`${baseId}-panel-signup`}
          aria-labelledby={`${baseId}-tab-signup`}
          hidden={tab !== "signup"}
        >
          {showSignupOverlay ? (
            <div className="max-h-[min(72vh,40rem)] overflow-y-auto rounded-2xl border border-border bg-background p-5 text-left shadow-lg sm:p-6">
              <SignupForm variant="compact" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
