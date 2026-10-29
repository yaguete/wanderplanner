# WanderPlanner

**Turn travel content into editable, day-by-day itineraries — without stealing it.**

WanderPlanner digests travel articles and Instagram posts from creators you love and turns them into a structured trip you can edit: days, activities, stays, transport legs and budgets. Crucially, it **preserves the original author's attribution and affiliate links** — generic AI tools use creator content but strip out the links that pay them. WanderPlanner is built so value flows back to the people who wrote the guides.

- **Live product:** [wanderplanner.ai](https://wanderplanner.ai)
- **Public MCP server:** [mcp.wanderplanner.ai](https://mcp.wanderplanner.ai) — OAuth (RFC 9728), read-only tools, published to the ChatGPT apps directory with an MCP-UI widget.

## Why it exists

Two real problems, one product:

1. **Creators** watch generic AI (ChatGPT, Claude, Gemini…) answer with their content while their affiliate links — their income — disappear.
2. **Travelers** can't easily *execute* an itinerary they liked: is this doable with kids? is this open in September? WanderPlanner digests the content and helps the reader act on it, without appropriating authorship.

## What's inside (monorepo)

| Path | What |
|---|---|
| `frontend/` | Next.js 15 · React 19 · TypeScript · Tailwind · Radix — hosted on Vercel |
| `backend/` | FastAPI (Python) — extraction, assistant, thumbnails, country tasks — hosted on Fly.io |
| `supabase/` | Postgres + Auth + RLS (document model on `jsonb`), migrations |
| `frontend/app/mcp` + `frontend/lib/mcp` | **Public MCP server**: OAuth flow, well-known endpoints (RFC 9728), seven read-only tools (`list_trips`, `get_trip`, `list_trip_sources`, `review_trip`, `search_sources`, `get_trip_budget`, `get_country_tasks`) and an MCP-UI widget (`text/html+skybridge`) |
| `scripts/` | Smoke tests for API and MCP |
| `CLAUDE.md` | Full operating manual of the project (architecture, models, quotas, decisions) |
| `DEPLOY.md` | Deploy runbook: Vercel + Fly.io + Supabase, env vars, rollback |
| `DESIGN.md` | Product design notes |

**AI models:** itinerary extraction with Claude Haiku, travel assistant with DeepSeek, MAE (Spanish Foreign Ministry) country briefs for pre-travel paperwork.

## Status

In production. The growth phase was closed **ahead of schedule** after first-party funnel data showed the bottleneck was retention, not acquisition — the learning is documented in the repo history and on the [author's site](https://thinkmaketest.ai). The product stays live while alternative hypotheses (LLM directories, creator agreements) are explored.

## Author

Built end to end by **Yago López Losada** — research, product definition, interface design and development (Next.js, FastAPI, Postgres + RLS, LLM extraction and vectorization, MCP + OAuth). More at [thinkmaketest.ai](https://thinkmaketest.ai) · [LinkedIn](https://www.linkedin.com/in/yagolopezlosada)

---

## 🇪🇸 En castellano

WanderPlanner convierte contenido de viaje (blogs, Instagram) en itinerarios editables por días, **conservando la atribución y los enlaces de afiliación del autor original**. Los creadores pierden sus enlaces cuando una IA genérica usa su contenido; los viajeros no saben cómo ejecutar una guía que les ha gustado. WanderPlanner resuelve ambas cosas a la vez.

Producto en producción ([wanderplanner.ai](https://wanderplanner.ai)) y servidor MCP público con OAuth ([mcp.wanderplanner.ai](https://mcp.wanderplanner.ai)), publicado en el directorio de aplicaciones de ChatGPT. Monorepo: frontend Next.js (Vercel), backend FastAPI (Fly.io), Supabase (Postgres + Auth + RLS). La fase de crecimiento se cerró doce días antes de plazo cuando los datos señalaron que el cuello era la recurrencia, no la adquisición.

## License

[MIT](LICENSE)
