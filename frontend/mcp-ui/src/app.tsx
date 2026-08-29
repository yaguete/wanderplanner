import { useEffect, useState } from "react"
import { openExternalUrl, type OpenAiHost } from "../../lib/mcp/ui-open-link"
import {
  widgetModelFromContent,
  type SearchWidgetModel,
  type SourceCardModel,
  type TripWidgetModel,
} from "../../lib/mcp/ui-views"
import { listenMcpMessages, mcpRequest, OPENAI_SET_GLOBALS_EVENT } from "./bridge"

declare global {
  interface Window {
    openai?: OpenAiHost
  }
}

function hostOpenAi(): OpenAiHost | undefined {
  return typeof window !== "undefined" ? window.openai : undefined
}

function toolOutputFromEvent(event: Event): unknown {
  const detail = (event as CustomEvent).detail
  return detail?.globals?.toolOutput ?? detail ?? hostOpenAi()?.toolOutput
}

function initialHostPayload(): unknown {
  return (
    hostOpenAi()?.toolOutput ??
    (typeof window !== "undefined" ? (window.__WP_MCP_PAYLOAD ?? window.__wpMcp?.getPayload()) : null) ??
    null
  )
}

function applyIfWidget(raw: unknown, setContent: (next: unknown) => void) {
  if (raw == null) return
  if (widgetModelFromContent(raw)) setContent(raw)
}

async function onOpenHref(href: string) {
  await openExternalUrl(href, {
    openai: hostOpenAi(),
    request: (method, params) =>
      mcpRequest(method, params) as Promise<{ isError?: boolean } | undefined>,
    fallback: (url) => {
      window.open(url, "_blank", "noopener,noreferrer")
    },
  })
}

function CardLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        event.preventDefault()
        void onOpenHref(href)
      }}
    >
      {children}
    </a>
  )
}

function SourceCard({ card }: { card: SourceCardModel }) {
  return (
    <article className="card">
      <p className="kicker">{card.author}</p>
      <h2>{card.articleTitle}</h2>
      <p className="place">{card.place}</p>
      {card.quote ? <blockquote>{card.quote}</blockquote> : null}
      {card.cta.kind === "none" ? null : (
        <p className="cta">
          <CardLink href={card.cta.href}>{card.cta.label}</CardLink>
        </p>
      )}
    </article>
  )
}

function SearchView({ model }: { model: SearchWidgetModel }) {
  if (model.layer === "none") {
    return <p className="empty">No hay fuentes para esto. Añade un artículo en WanderPlanner.</p>
  }
  if (model.layer === "trip") {
    if (model.cards.length === 0) {
      return <p className="empty">No hay recomendaciones en las fuentes de este viaje.</p>
    }
    return (
      <div className="stack">
        {model.cards.map((card, i) => (
          <SourceCard key={`${card.place}-${i}`} card={card} />
        ))}
      </div>
    )
  }
  if (model.suggestions.length === 0) {
    return <p className="empty">No hay artículos que mostrar.</p>
  }
  return (
    <div className="stack">
      {model.suggestions.map((s) => (
        <article className="card" key={s.url}>
          <p className="kicker">{s.host}</p>
          <h2>{s.title}</h2>
          <p className="cta">
            <CardLink href={s.url}>Leer el artículo</CardLink>
          </p>
        </article>
      ))}
    </div>
  )
}

function TripView({ model }: { model: TripWidgetModel }) {
  return (
    <div className="stack">
      <header>
        <p className="kicker">WanderPlanner</p>
        <h1>{model.name}</h1>
      </header>
      {model.mode === "summary"
        ? model.days.map((day) => (
            <section key={day.index}>
              <h2>
                Día {day.index}
                {day.label ? ` · ${day.label}` : ""}
              </h2>
              <p className="place">
                {day.itemNames.length > 0 ? day.itemNames.join(" · ") : "Sin ítems"}
              </p>
            </section>
          ))
        : model.days.map((day) => (
            <section key={day.index}>
              <h2>
                Día {day.index}
                {day.label ? ` · ${day.label}` : ""}
              </h2>
              <ul>
                {day.items.map((item) => (
                  <li key={`${day.index}-${item.name}`}>
                    <strong>{item.name}</strong>
                    {item.sourceAuthor ? ` · ${item.sourceAuthor}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ))}
      {model.wanderplannerUrl ? (
        <p className="cta">
          <CardLink href={model.wanderplannerUrl}>Abrir en WanderPlanner</CardLink>
        </p>
      ) : null}
    </div>
  )
}

export function App() {
  const [content, setContent] = useState<unknown>(() => {
    const raw = initialHostPayload()
    return widgetModelFromContent(raw) ? raw : null
  })

  useEffect(() => {
    const apply = (raw: unknown) => applyIfWidget(raw, setContent)

    apply(initialHostPayload())

    const onGlobals = (event: Event) => apply(toolOutputFromEvent(event))
    window.addEventListener(OPENAI_SET_GLOBALS_EVENT, onGlobals)

    const stopMcp = listenMcpMessages(apply)

    let ticks = 0
    const timer = window.setInterval(() => {
      ticks += 1
      apply(hostOpenAi()?.toolOutput)
      if (ticks >= 40) window.clearInterval(timer)
    }, 250)

    return () => {
      window.removeEventListener(OPENAI_SET_GLOBALS_EVENT, onGlobals)
      stopMcp()
      window.clearInterval(timer)
    }
  }, [])

  const model = widgetModelFromContent(content)
  if (!model) {
    return <p className="empty">Cargando…</p>
  }
  if (model.kind === "search") return <SearchView model={model} />
  return <TripView model={model} />
}
