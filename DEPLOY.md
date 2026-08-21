# WanderPlanner — Despliegue

Arquitectura en producción (privada, sin anunciar tráfico):

| Pieza | Plataforma | URL / recurso |
| --- | --- | --- |
| Frontend (Next.js 15) | **Vercel** · Root Directory = `frontend` | `https://wanderplanner.ai` |
| Backend (FastAPI) | **Fly.io** · app `wanderplanner-api` · región `ams` | `https://api.wanderplanner.ai` (también `https://wanderplanner-api.fly.dev`) |
| Postgres + Auth | **Supabase** (gestionados) | proyecto `kzriijgdkrdruikmpufl` · `eu-west-1` |

Código de referencia: [`backend/fly.toml`](backend/fly.toml), [`backend/Dockerfile`](backend/Dockerfile), [`backend/.env.example`](backend/.env.example), [`frontend/.env.example`](frontend/.env.example), [`supabase/README.md`](supabase/README.md).

Smoke test tras un deploy:

```bash
./scripts/smoke.sh https://api.wanderplanner.ai
```

---

## 1. Backend — Fly.io

### App y región

- App: `wanderplanner-api`
- Región primaria: `ams` (Ámsterdam). Fly cerró `mad`; otras EU cercanas: `cdg`, `fra`, `lhr`.
- Certificado custom: `fly certs add api.wanderplanner.ai` (CNAME del dominio hacia el hostname de Fly).
- Runtime: imagen de [`backend/Dockerfile`](backend/Dockerfile) · puerto interno `8000` · `auto_stop_machines = stop` / `min_machines_running = 0` · 1 GB RAM.

### Deploy

Desde `backend/` (o pasando `-c backend/fly.toml` / `--config`):

```bash
# Primera vez (ya hecho): fly launch --no-deploy --name wanderplanner-api --region ams
cd backend
fly deploy
fly status
fly logs
```

### Secrets (obligatorios en producción)

```bash
fly secrets set \
  ANTHROPIC_API_KEY=... \
  DEEPSEEK_API_KEY=... \
  TAVILY_API_KEY=... \
  GOOGLE_PLACES_API_KEY=... \
  UNSPLASH_ACCESS_KEY=... \
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  REQUIRE_AUTH=true \
  TURNSTILE_SECRET_KEY=... \
  ALLOWED_ORIGINS=https://wanderplanner.ai
```

Listar / rotar:

```bash
fly secrets list
fly secrets set NOMBRE=nuevo_valor   # redeploy implícito
```

| Variable | De dónde sale | Notas |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) → API keys | Extracción `/itinerary` (Claude Haiku) |
| `DEEPSEEK_API_KEY` | [platform.deepseek.com](https://platform.deepseek.com/) | Asistente `/assistant/chat` |
| `TAVILY_API_KEY` | [tavily.com](https://tavily.com/) → dashboard | Búsqueda web del asistente |
| `GOOGLE_PLACES_API_KEY` | Google Cloud → APIs & Services → Places API (New) | Miniaturas `/thumb` (stay/food/transport, Básicos y fallback de Commons). Acepta también alias `GOOGLE_MAPS_API_KEY`. `kind=activity` (todo lo que no es stay/food/transport) va primero a Wikimedia Commons (sin clave) |
| `UNSPLASH_ACCESS_KEY` | [unsplash.com/oauth/applications](https://unsplash.com/oauth/applications) | Portadas `/cover` (solo backend; **nunca** `NEXT_PUBLIC_*`) |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Mismo proyecto que el front |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` | **Solo backend.** Cachés `article_extractions` / `place_thumbs` / `destination_covers` / `country_task_suggestions` y `usage_events` |
| `REQUIRE_AUTH` | — (configuración propia) | `true` en producción. Sin Bearer → 401 en `/itinerary`, `/thumb`, `/cover`, `/assistant/chat`, `/day-summary`, `/country-tasks`. **No** afecta a `/partners/prewarm` ni a `GET /sources/suggest` (públicos por diseño) |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile → secret key (la misma que en Supabase Auth → Bot protection) | Obligatoria si `REQUIRE_AUTH=true`: sin ella `/partners/prewarm` responde **503** (fail-closed). En local sin `REQUIRE_AUTH` el prewarm acepta sin captcha |
| `ALLOWED_ORIGINS` | — | CSV de orígenes CORS. Prod: `https://wanderplanner.ai`. Añade URLs de Preview de Vercel si quieres probar APIs desde previews |

#### Opcionales

| Variable | Default / efecto |
| --- | --- |
| `SUPABASE_JWT_SECRET` | Si falta, valida por JWKS de `SUPABASE_URL`. Preferible **no** fijarlo si los tokens son asimétricos (ES256/RS256); un secreto HS256 desalineado provoca «Token de sesión inválido» |
| `ASSISTANT_MODEL` | `deepseek-v4-flash` |
| `ITINERARY_MAX_OUTPUT_TOKENS` | `32000` (tope 64000) |
| `EXTRACTION_CACHE_TTL_DAYS` | `30` |
| `MAX_PHOTO_LOOKUPS_DAY` | `2000` (cinturón global durable de misses de pago `/thumb` Places + `/cover` Unsplash, vía `usage_events.kind=photo_paid`; Wikimedia no cuenta. Fail-closed si no se puede leer la DB) |
| `PARTNER_PREWARM_MAX_IP_DAY` | `10` (tope por IP del prewarm; memoria de proceso) |
| `PARTNER_PREWARM_MAX_DAY` | `200` (cap global durable vía `usage_events.kind=partner_prewarm`) |
| `SOURCE_SUGGEST_ENABLED` | `true` (kill switch de `GET /sources/suggest`) |
| `SOURCE_SUGGEST_WEB_ENABLED` | `true` (escalón Tavily abierto si caché+curados no dan ningún hit; `false` lo apaga) |
| `LANDING_SOURCE_SEARCH_MAX_IP_DAY` | `20` (tope por IP de Tavily en `/sources/suggest`; memoria de proceso) |
| `LANDING_SOURCE_SEARCH_MAX_DAY` | `200` (cap global durable `usage_events.kind=landing_source_search`) |
| `GUEST_MAX_EXTRACTIONS` | `1` |
| `GUEST_MAX_ASSISTANT_MESSAGES` | `10` |
| `GUEST_MAX_PHOTO_LOOKUPS` | `30` |
| `GUEST_MAX_COUNTRY_TASKS` | `5` (misses Claude de `/country-tasks` como invitado) |
| `USER_MAX_EXTRACTIONS_DAY` | `10` |
| `USER_MAX_EXTRACTIONS_MONTH` | `50` |
| `USER_MAX_ASSISTANT_MESSAGES_DAY` | `50` |
| `USER_MAX_PHOTO_LOOKUPS_DAY` | `300` |
| `USER_MAX_COUNTRY_TASKS_DAY` | `30` |
| `TRAVEL_BRIEF_TTL_DAYS` | `7` (refresco de Recomendaciones MAE en la propia petición) |
| `INSTAGRAM_PROVIDER` | `off` si no se fija. Local: `oembed` (caption) o `fixture` (JSON local). Prod: `external` (o `graphql`). **Nunca** caer a `fetch_article` con una URL de post/reel |
| `INSTAGRAM_PROVIDER_URL` | Endpoint del vendor (solo backend). Obligatorio si `INSTAGRAM_PROVIDER=external` |
| `INSTAGRAM_PROVIDER_KEY` | Credencial del vendor (`Authorization: Bearer` o `x-api-key`). Secret de Fly, no `NEXT_PUBLIC_*` |
| `INSTAGRAM_GRAPHQL_DOC_ID` | Solo si `INSTAGRAM_PROVIDER=graphql` |
| `INSTAGRAM_RESOLVE_TIMEOUT_S` | `20` (clamp 3–60). Presupuesto de latencia del resolver |
| `INSTAGRAM_OCR_ENABLED` | `true` por defecto. `false` apaga la visión sin redeploy de lógica |
| `INSTAGRAM_OCR_MIN_WIDTH` | `640` (candidato de CDN más pequeño con ancho ≥ este valor) |
| `INSTAGRAM_OCR_MAX_SLIDES` | `8` |
| `INSTAGRAM_OCR_MAX_OUTPUT_TOKENS` | `2000` (techo de coste de la transcripción) |
| `INSTAGRAM_OCR_MAX_CAPTION_CHARS` | vacío = sin tope. Si se pone (p. ej. `600`), el OCR solo corre en captions más cortos |
| `USER_MAX_INSTAGRAM_EXTRACTIONS_DAY` | `5` (registrado; tope diario `usage_events.kind=extraction_instagram`). `cost_hint` = tokens visuales del OCR. Los invitados no pagan este kind: una acción = `extraction` |

### Rollback (Fly)

No hay `fly rollback`. Se redeploya una imagen anterior del registry:

```bash
fly releases --app wanderplanner-api --image
# Elige la release buena, p. ej. registry.fly.io/wanderplanner-api:deployment-01H…
fly deploy --app wanderplanner-api --image registry.fly.io/wanderplanner-api:<tag>
```

Opcional: etiquetar deploys legibles con `fly deploy --image-label v1.2.3` para no depender solo de tags `deployment-…`. Las imágenes no usadas mucho tiempo pueden podarse del registry de Fly; para rollback “garantizado” conviene también un registry externo.

Los **secrets** no vuelven atrás con la imagen: si un secret nuevo rompió prod, corrígelo con `fly secrets set` / `unset`.

---

## 2. Frontend — Vercel

### Proyecto

1. Importar el repo `yaguete/wanderplanner` (o el remoto actual).
2. **Root Directory: `frontend`** (crítico: el `package.json` de Next vive ahí).
3. Framework preset: Next.js. Build / install por defecto (`npm run build`).
4. Dominio producción: `wanderplanner.ai` → este proyecto.

Cada push a `main` despliega Production; ramas / PRs generan Preview.

### Variables de entorno (Production y Preview)

Configurar en Vercel → Project → Settings → Environment Variables. Todas son `NEXT_PUBLIC_*` (van al bundle del navegador):

| Variable | De dónde sale | Notas |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Hostname del backend | Prod: `https://api.wanderplanner.ai`. Preview: misma API o una de staging si la hubiera |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → URL | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` `public` | Pública; RLS protege datos. **Nunca** la `service_role` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | [account.mapbox.com](https://account.mapbox.com/) → Access tokens | Token `pk.…` **restringido por URL** a `wanderplanner.ai` (y previews si hace falta) |
| `NEXT_PUBLIC_MAPBOX_PERMANENT_GEOCODING` | — | Default **on** (cualquier valor salvo `false`/`0`/`off`). Kill switch del endpoint `mapbox.places-permanent` al confirmar un lugar. Es **licencia, no ahorro**: el `permanent=true` sobre `mapbox.places` nunca facturó; apagarlo vuelve a persistir el dataset temporal. No ponerlo a `false` en producción |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile → site key | Clave pública del widget, visible en el navegador. Se usa en `/start`, `/login`, `/signup`, `/partners` y los chips del hero; autoriza sus hostnames en Cloudflare. En Supabase Auth **y** en Fly (`TURNSTILE_SECRET_KEY`) se configura la **secret key asociada**, nunca esta site key |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | Kill switch del botón «Continuar con Google» | Default `false`. Encender **después** de aplicar `20260821120000_google_display_name.sql` y de configurar Google en el dashboard. Apagarlo oculta el botón sin redeploy de código |
| `NEXT_PUBLIC_APP_ORIGIN` | Dominio canónico del front | Opcional. Override de `SITE_URL` (`https://wanderplanner.ai`) para el snippet de `/partners`. Si falta, el kit usa `SITE_URL`; **nunca** `window.location.origin` (local y Preview incrustarían un host que el lector no puede abrir) |
| `NEXT_PUBLIC_SOURCE_SUGGEST_ENABLED` | Kill switch del chip «Busca un destino» | Default `true`. `false` oculta la pestaña 2 |
| `NEXT_PUBLIC_SOURCE_SUGGEST_WEB_ENABLED` | Widget Turnstile en la pestaña destino | Default `false`. Solo aplica si el API devolviera `need_captcha` (el escalón web ya no lo pide) |

Opcional: `NEXT_PUBLIC_VENDOR_LOGO_PROVIDER` (default `clearbit`).

**No** poner en Vercel: `UNSPLASH_ACCESS_KEY`, `GOOGLE_PLACES_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, ni ninguna clave de IA.

### Deploy manual (CLI)

```bash
cd frontend
vercel link          # una vez
vercel --prod        # o dejar que el Git integration despliegue
```

### Rollback (Vercel)

Instant Rollback — apunta el dominio de producción a un deployment anterior **sin rebuild**:

```bash
# Hobby: solo el deployment de producción inmediatamente anterior
vercel rollback

# Pro/Enterprise: a uno concreto
vercel rollback <deployment-id-or-url>
vercel rollback status
```

También desde el dashboard: Deployment → … → Instant Rollback.

Tras un rollback, Vercel desactiva la asignación automática de dominios de producción a nuevos pushes. Para volver al flujo normal: `vercel promote <deployment-id-or-url>` (o “Undo Rollback” en el dashboard).

---

## 3. Supabase (gestionados)

No hay “deploy” de app: el proyecto ya está en la nube. Lo que se despliega son **migraciones** y la **configuración de Auth**.

### Checklist de producción

- Authentication → Providers → **Anonymous Sign-Ins** activado (`/start`).
- Authentication → Providers → **Google**: Client ID + Secret de un cliente OAuth «Web» en Google Cloud. Redirect de Google: `https://<project-ref>.supabase.co/auth/v1/callback`. Scopes solo `email` + `profile`. El botón del front no se enseña hasta `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`.
- Authentication → **Bot protection (Turnstile)** con la **secret key** asociada a la site key pública configurada en `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- Authentication → URL Configuration:
  - Site URL: `https://wanderplanner.ai`
  - Redirect URLs: `https://wanderplanner.ai/**` + URLs de Preview de Vercel (`https://*.vercel.app/**` o las concretas).
- Custom SMTP (Resend u otro) si quieres entrega real de emails de confirmación; el SMTP por defecto de Supabase no basta para usuarios reales.
- Migraciones aplicadas (en orden):

  1. `20260726220000_init_wanderplanner.sql`
  2. `20260726223000_cleanup_anonymous_users.sql`
  3. `20260726230000_grant_data_api.sql`
  4. `20260728000000_place_thumbs_and_covers.sql`
  5. `20260728120000_usage_events.sql`
  6. `20260803000000_grant_service_role_backend_tables.sql`
  7. `20260803120000_article_extractions_validation.sql`
  8. `20260803180000_trip_tasks.sql`
  9. `20260804010000_day_summary_usage.sql`
  10. `20260808000000_sources_total_days.sql`
  11. `20260808190000_partner_prewarm_usage.sql` (si aplica el kit partners)
  12. `20260808200000_dismissed_country_tasks.sql`
  13. `20260808210000_country_task_suggestions.sql`
  14. `20260808220000_trip_origin.sql`
  15. `20260816120000_ai_transfer_consent.sql`
  16. `20260816180000_guest_trip_claim.sql`
  17. `20260817000000_place_thumbs_wikimedia.sql`
  18. `20260817120000_photo_paid_usage.sql` (antes del backend que escribe `photo_paid`; si no, el tope global lee 0)

```bash
# Con CLI vinculada al proyecto:
supabase db push
# O pegar cada fichero en SQL Editor, en orden.
```

**Orden con el frontend:** `20260803180000_trip_tasks.sql` añade columnas que el front ya pide en `TRIP_COLUMNS` (`tasks`, `extra_tasks`, `num_travelers`, `currency`). Hay que aplicar esa migración **antes** de mergear a `main` (Vercel despliega Production en cada push). Aplicarla con el frontend viejo aún en producción es inocuo (`add column if not exists`).

**T4.4 trámites por destino:** aplicar `20260808200000_dismissed_country_tasks.sql` y `20260808210000_country_task_suggestions.sql` **antes** del frontend que pide `dismissed_country_tasks` en `TRIP_COLUMNS`. Orden de despliegue: **migraciones → backend Fly (`GET /country-tasks`) → frontend Vercel**.

**⚠️ T4B.1 origen del viaje:** `20260808220000_trip_origin.sql` añade `trips.origin` (jsonb nullable). El frontend la incluye en `TRIP_COLUMNS`; si mergeas a `main` **antes** de aplicar la migración, PostgREST responde *column does not exist* y **`/trips` cae para todos los usuarios**. Orden obligatorio: **1) aplicar la migración en Supabase de producción, 2) verificar la columna, 3) solo entonces mergear**. Aditiva e idempotente: segura con el front viejo aún en producción.

**Google SSO:** orden **1) migración** `20260821120000_google_display_name.sql` (el trigger `handle_new_user` lee `full_name` / `name`), **2) dashboard** Auth → Google con Client ID/Secret y redirect de Google Cloud, **3) flag** `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` en Vercel. Si el botón llega antes que 1+2, cada clic es un 400. Rollback: apagar el flag (email+contraseña siguen). Local: `[auth.external.google]` en `supabase/config.toml` va **`enabled = false`** en git; redirect de Google `http://127.0.0.1:54321/auth/v1/callback`.

Detalle local y env: [`supabase/README.md`](supabase/README.md).

### Rollback (Supabase)

- **Esquema:** las migraciones son forward-only. No hay `supabase db rollback` en producción. Para deshacer un cambio ya aplicado: escribe una **nueva migración compensatoria** (down SQL revisado a mano) y aplícala como las demás, pegándola en el SQL Editor.
- **Nunca** `supabase db reset --linked` contra producción (borra datos).
- **Datos:** el plan Free no tiene backups automáticos ni PITR. La continuidad depende de dumps periódicos (ver deuda T7.3 del plan de producción). Un restore es restaurar un `pg_dump` / backup manual, no “un botón de rollback”.

---

## 4. Entornos: local vs Preview vs Production

| | Local | Preview (Vercel) | Production |
| --- | --- | --- | --- |
| Front | `localhost:3000` | `*.vercel.app` | `wanderplanner.ai` |
| API | `localhost:8000` | suele apuntar a la API de prod o a Fly | `api.wanderplanner.ai` |
| `REQUIRE_AUTH` | `false` (cómodo) | — (backend) | `true` |
| `ALLOWED_ORIGINS` | defaults `localhost:3000,3001` | incluir el origen del preview si llamas a la API real | `https://wanderplanner.ai` |
| Supabase redirects | `http://localhost:3000/**` | URLs preview | Site URL + `wanderplanner.ai/**` |
| Claves de imagen | solo `backend/.env` | solo Fly secrets | solo Fly secrets |

Coordinación típica al abrir un Preview que habla con la API de producción:

1. Añadir el origen del Preview a `ALLOWED_ORIGINS` en Fly (`fly secrets set …`).
2. Añadir el mismo origen a Redirect URLs de Supabase Auth.
3. Si Mapbox está restringido por URL, autorizar también el host del preview.

---

## 5. Verificación post-deploy

Checklist mínima (Fase 2 / T2.5 del plan de producción):

1. Alta con email real → confirmación → login → crear viaje → persiste al recargar.
2. `/start?source=<url>&ref=…` en incógnito → captcha → viaje con fuente, sin cuenta.
3. Segunda fuente como invitado → 429 → modal de registro.
4. Asistente en streaming (SSE Vercel→Fly sin buffering).
5. Portadas y miniaturas al hacer scroll; **cero** claves de Places/Unsplash en el bundle.
6. Artículo largo (15+ días) sin cortarse.
7. `./scripts/smoke.sh https://api.wanderplanner.ai` en verde.

---

## 6. Comandos rápidos

```bash
# Backend
cd backend && fly deploy
fly status -a wanderplanner-api
fly logs -a wanderplanner-api
fly releases -a wanderplanner-api --image
fly deploy -a wanderplanner-api --image registry.fly.io/wanderplanner-api:<tag>   # rollback

# Frontend
cd frontend && vercel --prod
vercel rollback                 # Instant Rollback
vercel promote <deployment>     # deshacer rollback / reactivar auto-assign

# Supabase
# Migraciones: SQL Editor del dashboard, pegando el fichero. `supabase db push`
# NO funciona aquí (CLI sin vincular, sin historial en el remoto). Ver supabase/README.md.
# Rollback de esquema = nueva migración compensatoria, no un undo mágico

# Smoke
./scripts/smoke.sh https://api.wanderplanner.ai
```
