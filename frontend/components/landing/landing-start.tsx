"use client"

/**
 * Cápsula de arranque del hero. Tres chips (artículo / destino / cuenta).
 * La pestaña 1 es un form GET nativo a `/start`: convierte aunque la isla no hidrate.
 * En landings de blog (`suggest="blog"`) no hay pestaña 1: exige JS.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { track } from "@vercel/analytics"
import { ArrowRight, Globe, Instagram } from "lucide-react"
import { SignupForm } from "@/components/auth/signup-form"
import { Turnstile, isTurnstileEnabled } from "@/components/auth/turnstile"
import { DestinationSearchField } from "@/components/destination-search-field"
import { SourceSuggestList } from "@/components/source-suggest-list"
import { isBlogLandingEnabled, getBlogLanding } from "@/lib/blog-landings"
import { cleanSourceUrl } from "@/lib/partner-button"
import { unsupportedSourceUrlMessage } from "@/lib/instagram-url"
import { LANDING_REF } from "@/lib/partner-trip"
import {
  isSourceSuggestEnabled,
  isSourceSuggestWebEnabled,
  suggestBlogSources,
  suggestSources,
  type SourceSuggestHit,
} from "@/lib/source-suggest"
import { cn } from "@/lib/utils"

export type StartTab = "article" | "destination" | "signup"
export type LandingStartSuggest = "tavily" | "blog"

type TabDef = { id: StartTab; label: string; mobileLines: [string, string] }

const TABS: TabDef[] = [
  { id: "article", label: "Añade una fuente", mobileLines: ["Añade una", "fuente"] },
  { id: "destination", label: "Busca un destino", mobileLines: ["Busca un", "destino"] },
  { id: "signup", label: "Crea tu cuenta", mobileLines: ["Crea tu", "cuenta"] },
]

function resolveTabs(opts: {
  tabIds?: StartTab[]
  suggest: LandingStartSuggest
  blogSlug?: string
}): TabDef[] {
  const source = opts.tabIds ? TABS.filter((tab) => opts.tabIds!.includes(tab.id)) : TABS
  return source.filter((tab) => {
    if (tab.id !== "destination") return true
    if (opts.suggest === "blog") return isBlogLandingEnabled(opts.blogSlug)
    return isSourceSuggestEnabled()
  })
}

export function LandingStart({
  tabs: tabIds,
  referrer = LANDING_REF,
  suggest = "tavily",
  blogSlug,
  surface,
  destinationPlaceholder,
}: {
  tabs?: StartTab[]
  referrer?: string
  suggest?: LandingStartSuggest
  blogSlug?: string
  /** Distingue `track()` de la home (ausente) y de `/lacosmopolilla`. */
  surface?: string
  /** Placeholder del buscador de destino. La home no lo pasa. */
  destinationPlaceholder?: string
} = {}) {
  const router = useRouter()
  const baseId = useId()
  const tabs = resolveTabs({ tabIds, suggest, blogSlug })
  const [tab, setTab] = useState<StartTab>(tabs[0]?.id ?? "article")
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

  const webEnabled = suggest === "tavily" && isSourceSuggestWebEnabled()
  const showWebCaptcha = webEnabled && needCaptcha && isTurnstileEnabled()
  const showDestination = tabs.some((item) => item.id === "destination")
  const showArticle = tabs.some((item) => item.id === "article")
  const blogHost =
    suggest === "blog" && blogSlug ? getBlogLanding(blogSlug)?.host : undefined

  const trackProps = useCallback(
    (extra: Record<string, string | number | boolean>) =>
      surface ? { ...extra, surface } : extra,
    [surface],
  )

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
      setUrlError("Introduce la URL completa del artículo o del post (https://…).")
      return
    }
    const blocked = unsupportedSourceUrlMessage(cleaned)
    if (blocked) {
      setUrlError(blocked)
      return
    }
    setUrlError(null)
    track("landing_start_submit", trackProps({ tab: "article" }))
    const params = new URLSearchParams({ source: cleaned, ref: referrer })
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
        const response =
          suggest === "blog" && blogSlug
            ? await suggestBlogSources(blogSlug, query, { signal: controller.signal })
            : await suggestSources(query, {
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
            : suggest === "blog"
              ? "Ahora mismo no podemos buscar en el blog. Inténtalo de nuevo."
              : "No hemos podido buscar artículos. Inténtalo de nuevo.",
        )
      } finally {
        setDestLoading(false)
      }
    },
    [blogSlug, suggest, setCaptchaToken],
  )

  const onDestChange = (next: string) => {
    setDestValue(next)
    if (destError) setDestError(null)
    if (next.trim() !== "") return
    abortRef.current?.abort()
    setDestResults(null)
    setDestLoading(false)
    setNeedCaptcha(false)
    setCaptchaToken(null)
  }

  const onDestSubmit = () => {
    const query = destValue.trim()
    if (query.length < 3) {
      setDestError("Escribe al menos 3 letras del destino.")
      return
    }
    track("landing_start_submit", trackProps({ tab: "destination" }))
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
    track(
      "landing_start_submit",
      trackProps({ tab: "destination", origin: hit.origin, instant: hit.instant }),
    )
    const params = new URLSearchParams({ source: hit.url, ref: referrer })
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
                track("landing_start_tab", trackProps({ tab: item.id }))
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
        {showArticle ? (
          <div
            role="tabpanel"
            id={`${baseId}-panel-article`}
            aria-labelledby={`${baseId}-tab-article`}
            hidden={tab !== "article"}
          >
            <form method="GET" action="/start" onSubmit={onUrlSubmit} className="landing-start-field">
              <input type="hidden" name="ref" value={referrer} />
              <label htmlFor={`${baseId}-source`} className="sr-only">
                URL del artículo o del post
              </label>
              <div className="relative min-w-0 flex-1">
                <input
                  ref={urlInputRef}
                  id={`${baseId}-source`}
                  name="source"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  required
                  placeholder=""
                  value={urlValue}
                  onChange={(e) => {
                    setUrlValue(e.target.value)
                    if (urlError) setUrlError(null)
                  }}
                  className="landing-start-input w-full"
                />
                {!urlValue ? (
                  <span
                    className="pointer-events-none absolute inset-y-0 left-0 flex items-center gap-1.5 text-base text-muted-foreground sm:text-[0.9375rem]"
                    aria-hidden
                  >
                    <span className="truncate">Pega un enlace web</span>
                    <Globe className="size-3.5 shrink-0 opacity-75" strokeWidth={2} />
                    <Instagram className="size-3.5 shrink-0 opacity-75" strokeWidth={2} />
                    
                  </span>
                ) : null}
              </div>
              <button type="submit" className="landing-start-go" aria-label="Empezar con esta fuente">
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </form>
            {urlError ? (
              <p className="mt-2 text-left text-sm text-destructive">{urlError}</p>
            ) : null}
            <p className="mt-2.5 text-pretty text-xs leading-5 text-foreground/50">
              Un artículo web o un reel de Instagram. Pronto también TikTok y YouTube.
            </p>
          </div>
        ) : null}

        {showDestination ? (
          <div
            role="tabpanel"
            id={`${baseId}-panel-destination`}
            aria-labelledby={`${baseId}-tab-destination`}
            hidden={tab !== "destination"}
          >
            <DestinationSearchField
              id={`${baseId}-dest`}
              inputRef={destInputRef}
              value={destValue}
              loading={destLoading}
              onChange={onDestChange}
              onSubmit={onDestSubmit}
              placeholder={destinationPlaceholder}
            />
            {showDestOverlay ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-background p-3 text-left shadow-lg">
                {destError ? <p className="px-1 py-2 text-sm text-destructive">{destError}</p> : null}
                {destLoading && !destResults ? (
                  <p className="px-1 py-2 text-sm text-muted-foreground">Buscando artículos…</p>
                ) : null}
                {destResults && destResults.length === 0 && !destError ? (
                  <p className="px-1 py-2 text-sm text-muted-foreground">
                    {showArticle
                      ? "No hemos encontrado fuentes para ese destino. Prueba con otro nombre o pega una dirección web."
                      : "No hemos encontrado guías para ese destino. Prueba con otro nombre."}
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
            {blogHost ? (
              <p className="mt-2.5 text-pretty text-xs leading-5 text-foreground/50">
                ¿No lo tienes claro? Regresa a{" "}
                <a
                  href={`https://${blogHost}`}
                  rel="nofollow noopener noreferrer"
                  className="underline decoration-foreground/25 underline-offset-2 hover:text-foreground/70"
                >
                  {blogHost}
                </a>{" "}
                para encontrar inspiración.
              </p>
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
