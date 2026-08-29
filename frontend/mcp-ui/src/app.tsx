import { useEffect, useState } from "react"
import { openExternalUrl, type OpenAiHost } from "../../lib/mcp/ui-open-link"
import {
  budgetVerdictLabel,
  coveragePercent,
  dayDateLabel,
  formatWidgetAmount,
  reviewCheckLabel,
  widgetModelFromContent,
  type BudgetWidgetModel,
  type ReviewWidgetModel,
  type SearchWidgetModel,
  type SourceCardModel,
  type TripDayItemView,
  type TripWidgetModel,
} from "../../lib/mcp/ui-views"
import { listenMcpMessages, mcpRequest, OPENAI_SET_GLOBALS_EVENT } from "./bridge"
import { SquirrelMark } from "./brand"

declare global {
  interface Window {
    openai?: OpenAiHost
  }
}

const TYPE_META: Record<string, string> = {
  stay: "Alojamiento",
  activity: "Actividad",
  food: "Restaurante",
  transport: "Transporte",
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

function CardLink({
  href,
  children,
  className,
}: {
  href: string
  children: string
  className?: string
}) {
  return (
    <a
      className={className}
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

function WidgetHead({ name }: { name: string }) {
  return (
    <header className="widget-head">
      <SquirrelMark />
      <h1 className="trip-name">{name}</h1>
    </header>
  )
}

function itemAttribution(item: TripDayItemView): string {
  const bits = [item.sourceAuthor, item.sourceTitle].filter(Boolean)
  if (bits.length > 0) return bits.join(" · ")
  return TYPE_META[item.type] ?? "En el plan"
}

function SourceCard({ card }: { card: SourceCardModel }) {
  return (
    <article className="source">
      <p className="source-author">{card.author}</p>
      <h2 className="source-title">{card.articleTitle}</h2>
      <p className="source-place">{card.place}</p>
      {card.quote ? <blockquote>{card.quote}</blockquote> : null}
      {card.cta.kind === "none" ? null : (
        <p className="btn-row">
          <CardLink className="btn" href={card.cta.href}>
            {card.cta.label}
          </CardLink>
        </p>
      )}
    </article>
  )
}

function SearchView({ model }: { model: SearchWidgetModel }) {
  if (model.layer === "none") {
    return (
      <div className="widget">
        <p className="empty">No hay fuentes para esto. Añade un artículo en WanderPlanner.</p>
      </div>
    )
  }
  if (model.layer === "trip") {
    if (model.cards.length === 0) {
      return (
        <div className="widget">
          <p className="empty">No hay recomendaciones en las fuentes de este viaje.</p>
        </div>
      )
    }
    return (
      <div className="widget">
        {model.cards.map((card, i) => (
          <SourceCard key={`${card.place}-${i}`} card={card} />
        ))}
      </div>
    )
  }
  if (model.suggestions.length === 0) {
    return (
      <div className="widget">
        <p className="empty">No hay artículos que mostrar.</p>
      </div>
    )
  }
  return (
    <div className="widget">
      {model.suggestions.map((s) => (
        <article className="source" key={s.url}>
          <p className="source-author">{s.host}</p>
          <h2 className="source-title">{s.title}</h2>
          <p className="btn-row">
            <CardLink className="btn" href={s.url}>
              Leer el artículo
            </CardLink>
          </p>
        </article>
      ))}
    </div>
  )
}

/** «Día 4 · mié 31 dic». La fecha es lo que responde a «el último día del año». */
function DayKicker({ index, startDate }: { index: number; startDate: string | null }) {
  const date = dayDateLabel(startDate, index)
  return (
    <p className="day-kicker">
      <span className="day-kicker-num">Día {index}</span>
      {date ? <span className="day-kicker-date">{date}</span> : null}
    </p>
  )
}

function TripView({ model }: { model: TripWidgetModel }) {
  return (
    <div className="widget">
      <WidgetHead name={model.name} />
      {model.mode === "summary"
        ? model.days.map((day) => (
            <section className="day" key={day.index}>
              <DayKicker index={day.index} startDate={model.startDate} />
              {day.label ? <p className="day-title">{day.label}</p> : null}
              <p className="summary-line">
                {day.itemNames.length > 0 ? day.itemNames.join(" · ") : "Sin ítems"}
              </p>
            </section>
          ))
        : model.days.map((day) => (
            <section className="day" key={day.index}>
              <DayKicker index={day.index} startDate={model.startDate} />
              {day.label ? <p className="day-title">{day.label}</p> : null}
              <ul className="timeline">
                {day.items.map((item) => (
                  <li className="item" key={`${day.index}-${item.name}`}>
                    <span className="rail">
                      <span className="dot" data-type={item.type} />
                    </span>
                    <div>
                      <span className="item-name">{item.name}</span>
                      <span className="item-meta">{itemAttribution(item)}</span>
                      {item.quote ? <blockquote>{item.quote}</blockquote> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      {model.wanderplannerUrl ? (
        <p className="btn-row">
          <CardLink className="btn" href={model.wanderplannerUrl}>
            Abrir en WanderPlanner
          </CardLink>
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
    return (
      <div className="widget">
        <div className="skel" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <p className="visually-hidden">Cargando…</p>
      </div>
    )
  }
  if (model.kind === "search") return <SearchView model={model} />
  if (model.kind === "review") return <ReviewView model={model} />
  if (model.kind === "budget") return <BudgetView model={model} />
  return <TripView model={model} />
}

function ReviewView({ model }: { model: ReviewWidgetModel }) {
  return (
    <div className="widget">
      <WidgetHead name={model.name} />
      <ul className="checks">
        {model.checks.map((c) => (
          <li className="check" key={c.id}>
            <span className="sev" data-sev={c.severity} />
            <div>
              <p className="check-label">{reviewCheckLabel(c.id)}</p>
              <p className="check-summary">{c.summary}</p>
              {c.days.length > 0 ? (
                <p className="chips">
                  {c.days.map((d) => (
                    <span className="chip" key={d}>
                      Día {d}
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {model.evidence.length > 0 ? (
        <section className="evidence">
          <p className="section-kicker">En tus fuentes</p>
          {model.evidence.map((card, i) => (
            <SourceCard key={`${card.place}-${i}`} card={card} />
          ))}
        </section>
      ) : null}
      {model.wanderplannerUrl ? (
        <p className="btn-row">
          <CardLink className="btn" href={model.wanderplannerUrl}>
            Abrir en WanderPlanner
          </CardLink>
        </p>
      ) : null}
    </div>
  )
}

function BudgetView({ model }: { model: BudgetWidgetModel }) {
  const pct = coveragePercent(model.priced, model.total)
  return (
    <div className="widget">
      <WidgetHead name={model.name} />
      <div className="budget-rows">
        {model.cap != null ? (
          <p className="budget-row">
            <span>Techo</span>
            <strong>{formatWidgetAmount(model.cap, model.currency)}</strong>
          </p>
        ) : null}
        <p className="budget-row">
          <span>Apuntado</span>
          <strong>{formatWidgetAmount(model.counted, model.currency)}</strong>
        </p>
      </div>
      <p className="verdict">{budgetVerdictLabel(model.verdictKind, model.delta, model.currency)}</p>
      <p className="coverage-label">
        Valorados {model.priced} de {model.total}
      </p>
      <div className="bar" aria-hidden="true">
        <span className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {model.unpricedTitles.length > 0 ? (
        <section className="unpriced">
          <p className="section-kicker">Sin valorar</p>
          <ul>
            {model.unpricedTitles.map((title, i) => (
              <li key={`${title}-${i}`}>{title}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {model.wanderplannerUrl ? (
        <p className="btn-row">
          <CardLink className="btn" href={model.wanderplannerUrl}>
            Abrir en WanderPlanner
          </CardLink>
        </p>
      ) : null}
    </div>
  )
}
