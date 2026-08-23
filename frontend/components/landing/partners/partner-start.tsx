"use client"

/**
 * Cápsula del hero de /partners. Dos chips (CTA / landing), misma cápsula
 * que LandingStart: píldora negra sobre fondo blanco.
 */
import { useId, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PartnerButtonBuilder } from "@/components/partners/partner-button-builder"
import { BlogFrame } from "./blog-frame"
import { LandingFrame } from "./landing-frame"
import { BLOG_LANDINGS } from "@/lib/blog-landings"
import { LEGAL } from "@/lib/legal"
import { cn } from "@/lib/utils"

type PartnerStartTab = "cta" | "landing"

type TabDef = { id: PartnerStartTab; label: string; mobileLines: [string, string] }

const TABS: TabDef[] = [
  {
    id: "cta",
    label: "Quiero un CTA para mis artículos",
    mobileLines: ["Quiero un CTA", "para mis artículos"],
  },
  {
    id: "landing",
    label: "Quiero una landing personalizada",
    mobileLines: ["Quiero una landing", "personalizada"],
  },
]

const EXAMPLE_BLOG =
  BLOG_LANDINGS.find((blog) => blog.slug === "lacosmopolilla" && blog.enabled) ??
  BLOG_LANDINGS.find((blog) => blog.enabled) ??
  null

const MAILTO = `mailto:${LEGAL.email}?subject=${encodeURIComponent("Quiero mi landing")}&body=${encodeURIComponent("Mi blog: \nMi dominio:")}`

export function PartnerStart() {
  const baseId = useId()
  const [tab, setTab] = useState<PartnerStartTab>("cta")

  const onChipKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = index
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % TABS.length
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + TABS.length) % TABS.length
    } else if (event.key === "Home") {
      next = 0
    } else if (event.key === "End") {
      next = TABS.length - 1
    } else {
      return
    }
    event.preventDefault()
    setTab(TABS[next].id)
    const button = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[
      next
    ]
    button?.focus()
  }

  return (
    <>
      <div className="px-6">
        <div
          id="empezar"
          className="relative z-20 mx-auto mt-10 w-full max-w-2xl scroll-mt-24 text-left"
        >
          <div
            role="tablist"
            aria-label="Cómo quieres colaborar"
            className="flex w-full rounded-full bg-background p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]"
          >
            {TABS.map((item, index) => {
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
                  onClick={() => setTab(item.id)}
                  onKeyDown={(event) => onChipKeyDown(event, index)}
                  aria-label={item.label}
                  className={cn(
                    "min-w-0 flex-1 rounded-full px-1.5 py-2 text-[13px] font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
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
              id={`${baseId}-panel-cta`}
              aria-labelledby={`${baseId}-tab-cta`}
              hidden={tab !== "cta"}
            >
              <PartnerButtonBuilder />
            </div>

            <div
              role="tabpanel"
              id={`${baseId}-panel-landing`}
              aria-labelledby={`${baseId}-tab-landing`}
              hidden={tab !== "landing"}
            >
              <div className="flex min-h-[16rem] flex-col justify-center gap-6 sm:min-h-[14rem]">
                <p className="text-pretty text-base leading-7 text-white/80 sm:text-lg">
                  Una página tuya, con tu nombre y tu buscador. Tu audiencia escribe un destino y
                  solo encuentra tus guías y artículos. La montamos nosotros y tú la enlazas desde
                  donde quieras.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
                  {EXAMPLE_BLOG ? (
                    <Button
                      asChild
                      variant="link"
                      className="h-11 px-0 text-white/70 hover:text-white"
                    >
                      <Link href={`/${EXAMPLE_BLOG.slug}`}>Ver ejemplo</Link>
                    </Button>
                  ) : null}
                  <Button
                    asChild
                    className="h-11 w-fit bg-white text-[hsl(20_8%_14%)] hover:bg-white/90"
                  >
                    <a href={MAILTO}>Quiero la mía</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div hidden={tab !== "cta"}>
        <BlogFrame />
      </div>
      <div hidden={tab !== "landing"}>
        <LandingFrame />
      </div>
    </>
  )
}
