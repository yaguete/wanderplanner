import { useEffect, useState } from "react"
import { openExternalUrl, type OpenAiHost } from "../../lib/mcp/ui-open-link"
import {
  widgetModelFromContent,
  type SearchWidgetModel,
  type SourceCardModel,
  type TripWidgetModel,
} from "../../lib/mcp/ui-views"
import { handshake, listenMcpMessages, mcpRequest } from "./bridge"

declare global {
  interface Window {
    openai?: OpenAiHost
  }
}

function hostOpenAi(): OpenAiHost | undefined {
  return typeof window !== "undefined" ? window.openai : undefined
}

function structuredFromUnknown(raw: unknown): unknown {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return raw
  const obj = raw as Record<string, unknown>
  if ("structuredContent" in obj) return obj.structuredContent
  return raw
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
  const [content, setContent] = useState<unknown>(() => hostOpenAi()?.toolOutput ?? null)

  useEffect(() => {
    void handshake().then((result) => {
      const next = structuredFromUnknown(result)
      if (next != null) setContent(next)
    })
    return listenMcpMessages((structured) => setContent(structured))
  }, [])

  const model = widgetModelFromContent(content)
  if (!model) {
    return <p className="empty">Cargando…</p>
  }
  if (model.kind === "search") return <SearchView model={model} />
  return <TripView model={model} />
}
